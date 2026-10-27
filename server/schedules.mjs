// 반복 업무 — ~/.claude-office/schedules.json. 서버가 30초마다 돌며 때가 된 업무를 startTask 로 띄운다.
// every: "daily"(time "HH:MM") | "hourly" | "minutes"(minutes N) | "once"(at ISO)
import fs from 'node:fs';
import path from 'node:path';
import { officeHome } from './paths.mjs';
import { MODES, startTask } from './tasks.mjs';
import { procedurePrompt } from './procedures.mjs';
import { loadConfig } from './config.mjs';
import { profilePrompt } from './staff.mjs';

export const TICK_MS = 30 * 1000;
const MAX = 50;
const file = () => path.join(officeHome(), 'schedules.json');
const text = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : '');

export function readSchedules() {
  try {
    const arr = JSON.parse(fs.readFileSync(file(), 'utf8'));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function write(list) {
  fs.mkdirSync(officeHome(), { recursive: true });
  const tmp = `${file()}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2));
  fs.renameSync(tmp, file());
}

/** 한 건 정리·검증. 돌려주는 값 = 저장할 모양(이상하면 throw) */
export function normalizeSchedule(raw, old = null) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const every = ['daily', 'hourly', 'minutes', 'once'].includes(s.every) ? s.every : 'daily';
  const out = {
    id: old ? old.id : `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    who: text(s.who, 60), cwd: text(s.cwd, 512).replace(/^["']+|["']+$/g, ''), key: text(s.key, 512),
    task: text(s.task, 20000), procedure: text(s.procedure, 80),
    mode: Object.hasOwn(MODES, s.mode) ? s.mode : 'acceptEdits',
    every, time: /^\d{2}:\d{2}$/.test(s.time) ? s.time : '07:00',
    minutes: Math.max(5, Math.min(24 * 60, Number.isFinite(+s.minutes) ? Math.round(+s.minutes) : 60)),
    at: every === 'once' && Date.parse(s.at) ? new Date(s.at).toISOString() : '',
    continueSession: !!s.continueSession,
    enabled: s.enabled !== false,
    createdAt: old ? old.createdAt : new Date().toISOString(),
    lastRun: old ? old.lastRun || '' : '', lastTaskId: old ? old.lastTaskId || '' : '', runs: old ? old.runs || 0 : 0,
  };
  if (!out.cwd) throw new Error('폴더가 없습니다 / no folder');
  if (!out.task && !out.procedure) throw new Error('업무 내용이나 절차가 있어야 합니다 / need a task or a procedure');
  out.nextRun = nextRunOf(out, Date.now());
  return out;
}

/** 다음 실행 시각(ISO). 지역 시간 기준(서버가 도는 PC 시간) */
export function nextRunOf(s, nowMs) {
  const now = new Date(nowMs);
  if (s.every === 'once') return s.at && Date.parse(s.at) > nowMs ? s.at : '';
  if (s.every === 'daily') {
    const [h, m] = s.time.split(':').map(Number);
    const d = new Date(now); d.setHours(h, m, 0, 0);
    if (d.getTime() <= nowMs) d.setDate(d.getDate() + 1);
    return d.toISOString();
  }
  const base = s.lastRun && Date.parse(s.lastRun) ? Date.parse(s.lastRun) : nowMs;
  const step = (s.every === 'hourly' ? 60 : s.minutes) * 60 * 1000;
  let t = base + step;
  while (t <= nowMs) t += step;
  return new Date(t).toISOString();
}

export function listSchedules() {
  return readSchedules();
}
export function upsertSchedule(raw) {
  const list = readSchedules();
  const i = list.findIndex((x) => x.id === raw.id);
  const rec = normalizeSchedule(raw, i >= 0 ? list[i] : null);
  if (i >= 0) list[i] = rec; else { if (list.length >= MAX) throw new Error('반복 업무가 너무 많습니다 / too many'); list.push(rec); }
  write(list);
  return rec;
}
export function deleteSchedule(id) {
  const list = readSchedules();
  const next = list.filter((x) => x.id !== id);
  if (next.length === list.length) return false;
  write(next);
  return true;
}

/** 지금 실행(수동 또는 때가 됨) */
export function runSchedule(id) {
  const list = readSchedules();
  const s = list.find((x) => x.id === id);
  if (!s) throw new Error('not found');
  const parts = [];
  if (s.procedure) parts.push(procedurePrompt(s.procedure));
  if (s.task) parts.push(s.task);
  const rec = startTask({ who: s.who || path.basename(s.cwd), cwd: s.cwd, task: parts.join('\n\n'), mode: s.mode, continueSession: s.continueSession, schedule: s.id,
    systemPrompt: profilePrompt(loadConfig(), s.key || path.basename(s.cwd)) });
  s.lastRun = new Date().toISOString(); s.lastTaskId = rec.id; s.runs = (s.runs || 0) + 1;
  s.nextRun = nextRunOf(s, Date.now());
  if (s.every === 'once') s.enabled = false;
  write(list);
  return rec;
}

/** 때가 된 것들을 띄운다 — 서버 타이머가 부른다. 돌려주는 값 = 띄운 id 들 */
export function tick(nowMs = Date.now()) {
  const list = readSchedules();
  const ran = [];
  for (const s of list) {
    if (!s.enabled || !s.nextRun || Date.parse(s.nextRun) > nowMs) continue;
    try {
      runSchedule(s.id);
      ran.push(s.id);
    } catch (e) {
      s.lastError = e.message; s.nextRun = nextRunOf({ ...s, lastRun: new Date().toISOString() }, nowMs); write(list);
    }
  }
  return ran;
}

let timer = null;
export function startScheduler() {
  if (timer) return;
  timer = setInterval(() => { try { tick(); } catch (e) { console.error('schedule tick failed:', e.message); } }, TICK_MS);
  if (timer.unref) timer.unref();
}
