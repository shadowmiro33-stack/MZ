// 직원 업무 일지 — 자비스(open-jarvis)의 DailyTimeline 을 직원(프로젝트 폴더) 단위로 옮긴 것.
// <cwd>/.claude/journal/YYYY-MM-DD.json 에 하루치 사건을 시간순으로. 종류: activity(업무 보고)·question(답 기다림)·todo·note·briefing.
// 원칙(자비스 7항): 대화 원문이 아니라 요약(300자)만, 키·비밀값 저장 금지. Claude 는 업무마다 toContext() 를 받아 "지난번에 뭘 했는지" 기억한다.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const JOURNAL_DIR = path.join('.claude', 'journal');
export const KINDS = ['activity', 'question', 'todo', 'note', 'briefing'];
const MAX_TEXT = 300;

export const dateKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hhmm = (iso) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const okCwd = (cwd) => typeof cwd === 'string' && path.isAbsolute(cwd) && fs.existsSync(cwd);
const okKey = (k) => /^\d{4}-\d{2}-\d{2}$/.test(String(k));
const SECRET = /(sk-[A-Za-z0-9]{8,}|ghp_[A-Za-z0-9]{10,}|AKIA[0-9A-Z]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY|(?:api[_-]?key|token|password|secret)\s*[:=]\s*\S+)/gi;
export const scrub = (s) => String(s || '').replace(SECRET, '[비밀값 가림]');

function fileOf(cwd, key) {
  if (!okKey(key)) throw new Error('날짜 형식은 YYYY-MM-DD / bad date');
  return path.join(cwd, JOURNAL_DIR, `${key}.json`);
}
function load(cwd, key) {
  try {
    const arr = JSON.parse(fs.readFileSync(fileOf(cwd, key), 'utf8'));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function save(cwd, key, events) {
  const f = fileOf(cwd, key);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  events.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const tmp = `${f}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(events, null, 2));
  fs.renameSync(tmp, f);
}

/** 기록. at 없으면 지금. 돌려주는 값 = 사건 */
export function record(cwd, { kind = 'activity', text, at = null, done = false, meta = {} }) {
  if (!okCwd(cwd)) throw new Error('폴더가 없습니다 / folder not found');
  if (!KINDS.includes(kind)) throw new Error('모르는 종류 / unknown kind: ' + kind);
  const clean = scrub(String(text || '').replace(/\s+/g, ' ').trim()).slice(0, MAX_TEXT);
  if (!clean) throw new Error('내용이 비었습니다 / empty');
  const when = at ? new Date(at) : new Date();
  if (Number.isNaN(when.getTime())) throw new Error('시각 형식 오류 / bad time');
  const ev = { id: randomUUID(), kind, text: clean, at: when.toISOString(), done: !!done, meta: meta && typeof meta === 'object' ? meta : {} };
  const key = dateKey(when);
  const events = load(cwd, key);
  events.push(ev);
  save(cwd, key, events);
  return ev;
}

export function setDone(cwd, id, done = true) {
  if (!okCwd(cwd)) return null;
  for (const key of recentKeys(cwd, 30, true)) {
    const events = load(cwd, key);
    const ev = events.find((e) => e.id === id);
    if (ev) { ev.done = !!done; save(cwd, key, events); return ev; }
  }
  return null;
}

/** 같은 업무(meta.task)에 대한 question 을 답함 처리 */
export function resolveQuestion(cwd, taskId) {
  if (!okCwd(cwd)) return 0;
  let n = 0;
  for (const key of recentKeys(cwd, 30, true)) {
    const events = load(cwd, key);
    let touched = false;
    for (const e of events) if (e.kind === 'question' && !e.done && e.meta && e.meta.task === taskId) { e.done = true; touched = true; n++; }
    if (touched) save(cwd, key, events);
  }
  return n;
}

export function getDay(cwd, key = dateKey(), kind = null) {
  if (!okKey(key)) throw new Error('날짜 형식은 YYYY-MM-DD / bad date');   // 경로 탈출은 삼키지 않고 거부(자비스 교훈)
  if (!okCwd(cwd)) return [];
  const events = load(cwd, key);
  return kind ? events.filter((e) => e.kind === kind) : events;
}

/** 오늘(포함) 이전 날짜 키 최근 N개(미래는 includeFuture 일 때만 앞에) */
export function recentKeys(cwd, days = 7, includeFuture = false) {
  let files = [];
  try { files = fs.readdirSync(path.join(cwd, JOURNAL_DIR)); } catch { return []; }
  const today = dateKey();
  const keys = files.filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10)).sort().reverse();
  const past = keys.filter((k) => k <= today).slice(0, days);
  return includeFuture ? [...keys.filter((k) => k > today), ...past] : past;
}

/** 미완료 할 일·답 안 한 질문(최근 N일) */
export function pending(cwd, days = 7) {
  const out = [];
  for (const key of recentKeys(cwd, days + 1)) for (const e of load(cwd, key)) if ((e.kind === 'todo' || e.kind === 'question') && !e.done) out.push({ ...e, date: key });
  return out;
}

/** Claude 에게 주입할 일지 요약 — 오늘 + 어제 + 밀린 것 */
export function toContext(cwd, { maxItems = 12 } = {}) {
  if (!okCwd(cwd)) return '';
  const keys = recentKeys(cwd, 2);
  const lines = [`[오늘] ${dateKey()} ${hhmm(new Date().toISOString())}`];
  for (const key of keys.slice().reverse()) {
    const evs = load(cwd, key).filter((e) => e.kind !== 'briefing');
    if (!evs.length) continue;
    lines.push(`[업무 일지 ${key}]`);
    for (const e of evs.slice(-maxItems)) lines.push(`- ${hhmm(e.at)} ${e.kind}${e.done ? '·완료' : ''}: ${e.text}`);
  }
  const carry = pending(cwd).filter((p) => p.date !== dateKey());
  if (carry.length) {
    lines.push('[밀린 것]');
    for (const p of carry.slice(0, maxItems)) lines.push(`- (${p.date}) ${p.kind}: ${p.text}`);
  }
  return lines.length > 1 ? lines.join('\n') : '';
}

/** 규칙 기반 브리핑(자비스 ruleBasedBriefing) — LLM 없이도 반드시 나온다 */
export function briefing(cwd, type = 'morning', who = '') {
  const today = getDay(cwd);
  const yKeys = recentKeys(cwd, 2).filter((k) => k !== dateKey());
  const yesterday = yKeys.length ? load(cwd, yKeys[0]) : [];
  const pend = pending(cwd);
  const name = who || path.basename(cwd);
  const lines = [];
  if (type === 'morning') {
    lines.push(`${name} 아침 브리핑`);
    const acts = yesterday.filter((e) => e.kind === 'activity');
    lines.push(acts.length ? `■ 어제 한 일 ${acts.length}건` : '■ 어제 기록 없음');
    for (const e of acts.slice(-6)) lines.push(`  - ${e.text}`);
    const qs = pend.filter((p) => p.kind === 'question');
    lines.push(qs.length ? `■ 답을 기다리는 질문 ${qs.length}건` : '■ 기다리는 질문 없음');
    for (const q of qs.slice(0, 5)) lines.push(`  - ${q.text}`);
    const todos = pend.filter((p) => p.kind === 'todo');
    if (todos.length) { lines.push(`■ 밀린 할 일 ${todos.length}건`); for (const t of todos.slice(0, 5)) lines.push(`  - ${t.text}`); }
  } else {
    lines.push(`${name} 퇴근 전 정리`);
    const acts = today.filter((e) => e.kind === 'activity');
    lines.push(acts.length ? `■ 오늘 한 일 ${acts.length}건` : '■ 오늘 한 일 없음');
    for (const e of acts.slice(-8)) lines.push(`  - ${hhmm(e.at)} ${e.text}`);
    lines.push(pend.length ? `■ 내일로 넘어가는 것 ${pend.length}건` : '■ 남은 것 없음');
    for (const p of pend.slice(0, 6)) lines.push(`  - ${p.kind}: ${p.text}`);
  }
  return lines.join('\n');
}
