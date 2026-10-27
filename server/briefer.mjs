// 능동 비서(자비스 ProactiveDaemon) — 경로가 있는 직원마다 아침(09:00)·퇴근 전(17:30) 브리핑을 하루 한 번 일지에 적고 알림 큐에 넣는다.
// 규칙 기반만 쓴다(외부 LLM 전송 없음). 관리자 화면이 /api/admin/notices 로 가져간다.
import path from 'node:path';
import { loadConfig } from './config.mjs';
import { briefing, getDay, record } from './journal.mjs';

export const TICK_MS = 60 * 1000;
const MAX_NOTICES = 50;
let notices = [];
let timer = null;
const fired = new Set(); // `${date}:${cwd}:${type}`

const minutesOf = (hm) => { const [h, m] = String(hm || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const dateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function pushNotice(n) {
  const item = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: new Date().toISOString(), ...n };
  notices.push(item);
  if (notices.length > MAX_NOTICES) notices.shift();
  return item;
}
export function drainNotices() {
  const out = notices; notices = []; return out;
}

/** 한 바퀴 — 시험에서 now·cfg 를 넣어 부른다 */
export function tick(now = new Date(), cfg = loadConfig()) {
  const date = dateKey(now), nowMin = now.getHours() * 60 + now.getMinutes();
  const morning = minutesOf(process.env.CLAUDE_OFFICE_MORNING_AT || '09:00'), wrap = minutesOf(process.env.CLAUDE_OFFICE_WRAPUP_AT || '17:30');
  const ran = [];
  for (const [key, s] of Object.entries(cfg.staff || {})) {
    if (!s.path) continue;
    for (const [type, at] of [['morning', morning], ['wrapup', wrap]]) {
      const k = `${date}:${s.path}:${type}`;
      if (fired.has(k) || nowMin < at) continue;
      fired.add(k);
      if (type === 'morning' && nowMin >= wrap) continue;                                   // 저녁에 켜졌으면 '좋은 아침' 생략
      let already = false;
      try { already = getDay(s.path, date, 'briefing').some((e) => e.meta && e.meta.type === type && !e.meta.manual); } catch { already = true; }
      if (already) continue;                                                                  // 재시작 뒤 중복 방지
      try {
        const who = s.name || key;
        const text = briefing(s.path, type, who);
        record(s.path, { kind: 'briefing', text: text.slice(0, 300), meta: { type } });
        pushNotice({ type, who, cwd: s.path, title: type === 'morning' ? `☀️ ${who} 아침 브리핑` : `🌙 ${who} 퇴근 전 정리`, body: text });
        ran.push(k);
      } catch { /* 폴더가 사라졌거나 쓰기 실패 — 다음 날 다시 */ }
    }
  }
  return ran;
}

export function startBriefer() {
  if (timer) return;
  timer = setInterval(() => { try { tick(); } catch (e) { console.error('briefer tick failed:', e.message); } }, TICK_MS);
  if (timer.unref) timer.unref();
  setTimeout(() => { try { tick(); } catch { /* 무시 */ } }, 3000);
}
export function _resetForTest() { notices = []; fired.clear(); }
