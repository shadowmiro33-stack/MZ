// 업무 지시 — 관리자 모드가 보낸 업무를 그 직원(프로젝트 폴더)에서 Claude Code 헤드리스(claude -p)로 실행한다.
// 업무 글은 stdin 으로 넘긴다(따옴표·줄바꿈 걱정 없이). 출력은 ~/.claude-office/tasks/<id>.log, 기록은 <id>.json.
// 훅은 -p 세션에도 울리므로 사무실 화면에서 그 캐릭터가 일하는 것이 보인다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { IS_WIN, officeHome } from './paths.mjs';
import { pidAlive } from './liveness.mjs';
import { record as journalRecord, resolveQuestion } from './journal.mjs';

export const MODES = Object.freeze({
  acceptEdits: ['--permission-mode', 'acceptEdits', '--permission-prompts', 'none'],   // 파일 수정은 자동, 그 밖은 거절
  plan: ['--permission-mode', 'plan', '--permission-prompts', 'none'],                 // 계획만 세운다(파일 안 건드림)
  auto: ['--permission-mode', 'auto', '--permission-prompts', 'none'],                 // 자동 모드 분류기가 판단
  bypass: ['--dangerously-skip-permissions'],                                           // 전부 자동 승인(위험)
});
export const MAX_TASK = 20000;
const KEEP = 100;                                                                        // 기록 보관 개수
const TAIL = 4000;                                                                       // 목록에 실어 보내는 로그 꼬리

export const tasksDir = () => path.join(officeHome(), 'tasks');
const live = new Map(); // id → child

/** claude 실행 파일 — PATH 의 claude, 없으면 네이티브 설치 위치 */
export function claudeBin() {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  const home = os.homedir();
  const cands = IS_WIN
    ? [path.join(home, '.local', 'bin', 'claude.exe'), path.join(home, 'AppData', 'Roaming', 'npm', 'claude.cmd')]
    : [path.join(home, '.local', 'bin', 'claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude'];
  for (const c of cands) if (fs.existsSync(c)) return c;
  return 'claude';
}

const PROMPT = '표준 입력(stdin)으로 받은 업무 지시를 이 폴더에서 수행하세요. 답의 마지막은 반드시 이 형식으로: '
  + '"## 보고" 제목 아래 무엇을 했고 결과가 어디 있는지 한국어로 3~6줄. 사람이 정해 줘야 진행할 수 있는 것이 있으면 "## 질문" 제목 아래 번호를 붙여 적고 거기서 멈추세요. '
  + 'Carry out the task given on stdin in this directory. End with "## 보고" (3-6 lines in Korean: what you did, where the result is) and, only if you need a human decision, "## 질문" with numbered questions.';

/** 끝난 업무를 직원 일지에 적는다 — 보고 첫 줄(activity), 질문이 있으면 question. 원문 대신 요약만 */
function journalize(rec) {
  try {
    const { report, question } = parseReport(tail(rec.id));
    const head = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean)[0] || '';
    const what = head(report) || (rec.exitCode === 0 ? '업무 완료' : '업무 실패');
    journalRecord(rec.cwd, { kind: 'activity', text: `${head(rec.task).slice(0, 60)} → ${what}`, meta: { task: rec.id, ok: rec.exitCode === 0 } });
    if (question) journalRecord(rec.cwd, { kind: 'question', text: head(question), meta: { task: rec.id } });
  } catch { /* 일지는 보조 — 실패해도 업무는 끝났다 */ }
}

/** 출력 꼬리에서 보고·질문을 뽑는다 — 화면이 대화창에 말풍선으로 보여 준다 */
export function parseReport(log) {
  const s = String(log || '');
  const rep = s.match(/##\s*보고\s*\n([\s\S]*?)(?=\n##\s*질문|$)/);
  const q = s.match(/##\s*질문\s*\n([\s\S]*?)$/);
  const clean = (x) => (x ? x.trim().replace(/\n{3,}/g, '\n\n').slice(0, 4000) : '');
  return { report: clean(rep && rep[1]), question: clean(q && q[1]) };
}

function idNow() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${Math.random().toString(36).slice(2, 6)}`;
}
const recFile = (id) => path.join(tasksDir(), `${id}.json`);
const logFile = (id) => path.join(tasksDir(), `${id}.log`);
function save(rec) {
  fs.mkdirSync(tasksDir(), { recursive: true });
  const tmp = `${recFile(rec.id)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(rec, null, 2));
  fs.renameSync(tmp, recFile(rec.id));
}

/** 업무 시작. who = 표시용(직원 이름), cwd = 프로젝트 폴더(있어야 함) */
export function startTask({ who, cwd, task, mode = 'acceptEdits', model = '', continueSession = false, schedule = '', systemPrompt = '', replyTo = '' }) {
  cwd = String(cwd || '').trim().replace(/^["']+|["']+$/g, '');          // 탐색기에서 복사하면 따옴표가 붙는다
  if (!cwd || !fs.existsSync(cwd)) { const e = new Error('폴더가 없습니다 / folder not found: ' + cwd); e.code = 'noDir'; throw e; }
  if (!fs.statSync(cwd).isDirectory()) {                                   // 파일을 적었다 — 그 파일이 있는 폴더를 제안
    const e = new Error('폴더가 아니라 파일입니다 / not a folder: ' + cwd); e.code = 'notDir'; e.parent = path.dirname(cwd); throw e;
  }
  if (typeof task !== 'string' || !task.trim()) throw new Error('업무 내용이 비었습니다 / empty task');
  if (!Object.hasOwn(MODES, mode)) throw new Error('모르는 권한 모드 / unknown mode: ' + mode);
  const id = idNow();
  fs.mkdirSync(tasksDir(), { recursive: true });
  const out = fs.openSync(logFile(id), 'a');
  const args = ['-p', PROMPT, ...MODES[mode], '--output-format', 'text'];
  if (continueSession) args.unshift('--continue');                                      // 같은 폴더의 지난 대화에 이어서
  if (systemPrompt) args.push('--append-system-prompt', systemPrompt.slice(0, 6000));   // 직원 프로필
  if (model && /^[a-z0-9.-]{2,40}$/i.test(model)) args.push('--model', model);
  const bin = claudeBin();
  const child = spawn(bin, args, {
    cwd, windowsHide: true, stdio: ['pipe', out, out],
    shell: IS_WIN && /\.cmd$|\.bat$/i.test(bin), env: { ...process.env, CLAUDE_OFFICE_TASK: id },
  });
  const rec = { id, who: String(who || path.basename(cwd)), cwd, task: task.slice(0, MAX_TASK), mode, model: model || '', continueSession: !!continueSession, schedule: schedule || '', profile: !!systemPrompt, replyTo: replyTo || '',
    pid: child.pid, startedAt: new Date().toISOString(), endedAt: null, exitCode: null, error: null, bin };
  save(rec);
  if (replyTo && /^[\w-]+$/.test(replyTo)) {                                             // 질문에 답했다 — 원 업무에 표시 + 일지의 질문도 답함
    const orig = readRec(replyTo);
    if (orig) { orig.answeredBy = id; save(orig); try { resolveQuestion(orig.cwd, orig.id); } catch { /* 일지는 보조 */ } }
  }
  live.set(id, child);
  child.on('error', (e) => { rec.error = e.message; rec.endedAt = new Date().toISOString(); rec.exitCode = -1; save(rec); live.delete(id); try { fs.closeSync(out); } catch { /* 이미 닫힘 */ } });
  child.on('exit', (code, sig) => {
    rec.endedAt = new Date().toISOString(); rec.exitCode = code ?? (sig ? -2 : -1); save(rec); live.delete(id);
    try { fs.closeSync(out); } catch { /* 이미 닫힘 */ }
    journalize(rec);
  });
  child.stdin.on('error', () => { /* 아이가 먼저 죽었다 */ });
  child.stdin.end(task.slice(0, MAX_TASK) + '\n');
  prune();
  return rec;
}

export function stopTask(id) {
  const child = live.get(id);
  const rec = readRec(id);
  if (!rec) return { ok: false, error: 'not found' };
  if (child) {
    try { child.kill('SIGTERM'); } catch { /* 이미 죽음 */ }
    return { ok: true, id };
  }
  if (rec.pid && !rec.endedAt && pidAlive(rec.pid)) {                                   // 서버가 재시작된 뒤 남은 아이
    try { process.kill(rec.pid, 'SIGTERM'); } catch { /* 무시 */ }
    rec.endedAt = new Date().toISOString(); rec.exitCode = -2; save(rec);
    return { ok: true, id };
  }
  return { ok: false, error: 'not running' };
}

function readRec(id) {
  try {
    return JSON.parse(fs.readFileSync(recFile(id), 'utf8'));
  } catch {
    return null;
  }
}
function tail(id) {
  try {
    const fd = fs.openSync(logFile(id), 'r');
    const size = fs.fstatSync(fd).size;
    const n = Math.min(size, TAIL);
    const buf = Buffer.alloc(n);
    fs.readSync(fd, buf, 0, n, size - n);
    fs.closeSync(fd);
    return (size > n ? '…' : '') + buf.toString('utf8');
  } catch {
    return '';
  }
}

/** 업무 목록(최신 먼저) + 로그 꼬리. 서버가 재시작됐으면 살아 있는 pid 로 running 을 판단 */
export function listTasks(limit = 60) {
  let files = [];
  try {
    files = fs.readdirSync(tasksDir()).filter((f) => f.endsWith('.json') && !f.endsWith('.tmp')).sort().reverse().slice(0, limit);
  } catch {
    return [];
  }
  return files.map((f) => readRec(f.slice(0, -5))).filter(Boolean).map((rec) => {
    const running = live.has(rec.id) || (!rec.endedAt && rec.pid && pidAlive(rec.pid));
    const log = tail(rec.id);
    const { report, question } = running ? { report: '', question: '' } : parseReport(log);
    return { ...rec, status: running ? 'running' : rec.error ? 'error' : rec.exitCode === 0 ? 'done' : rec.endedAt ? 'failed' : 'done', log, report, question };
  });
}

/** 업무 기록 하나 삭제(실행 중이면 먼저 멈춘다) */
export function deleteTask(id) {
  if (!/^[\w-]+$/.test(String(id))) return false;
  if (live.has(id)) stopTask(id);
  const had = fs.existsSync(recFile(id));
  fs.rmSync(recFile(id), { force: true }); fs.rmSync(logFile(id), { force: true });
  return had;
}
/** 끝난 업무 전부 삭제(실행 중은 남긴다). 돌려주는 값 = 지운 개수 */
export function clearTasks() {
  let n = 0;
  try {
    for (const f of fs.readdirSync(tasksDir())) {
      if (!f.endsWith('.json')) continue;
      const id = f.slice(0, -5);
      const rec = readRec(id);
      if (!rec || live.has(id) || (!rec.endedAt && rec.pid && pidAlive(rec.pid))) continue;
      fs.rmSync(recFile(id), { force: true }); fs.rmSync(logFile(id), { force: true }); n++;
    }
  } catch { /* 폴더 없음 */ }
  return n;
}

/** 오래된 기록 정리 — 최근 KEEP 개만 */
function prune() {
  try {
    const files = fs.readdirSync(tasksDir()).filter((f) => f.endsWith('.json')).sort();
    for (const f of files.slice(0, Math.max(0, files.length - KEEP))) {
      const id = f.slice(0, -5);
      if (live.has(id)) continue;
      fs.rmSync(recFile(id), { force: true }); fs.rmSync(logFile(id), { force: true });
    }
  } catch { /* 정리는 실패해도 된다 */ }
}

/** 지금 도는 업무 — { pathKey(cwd): { id, who, task, startedAt, line } } (폴더마다 하나). 사무실 화면이 그 캐릭터를 일하게 한다 */
export function runningTasks(pathKeyFn) {
  const out = {};
  for (const x of listTasks(60)) {
    if (x.status !== 'running') continue;
    const k = pathKeyFn(x.cwd);
    if (out[k]) continue;
    out[k] = { id: x.id, who: x.who, task: x.task.split('\n').find((l) => l.trim() && !/절차서를 읽어라/.test(l)) || x.task, startedAt: x.startedAt, line: lastLine(x.log) };
  }
  return out;
}
/** 로그의 마지막 뜻있는 줄(진행 표시용, 80자) */
export function lastLine(log) {
  const lines = String(log || '').split('\n').map((l) => l.trim()).filter((l) => l && !/^#+ /.test(l) && l !== '…');
  return lines.length ? lines[lines.length - 1].slice(0, 80) : '';
}

/** 답하지 않은 질문 — { pathKey(cwd): { id, who, question, at } } (가장 최근 하나). 사무실 화면이 그 캐릭터를 폴짝 뛰게 한다 */
export function openQuestions(pathKeyFn) {
  const out = {};
  for (const x of listTasks(60)) {
    if (x.status === 'running' || !x.question || x.answeredBy) continue;
    const k = pathKeyFn(x.cwd);
    if (!out[k] || out[k].at < x.endedAt) out[k] = { id: x.id, who: x.who, question: x.question.split('\n')[0].slice(0, 80), at: x.endedAt || x.startedAt };
  }
  return out;
}
