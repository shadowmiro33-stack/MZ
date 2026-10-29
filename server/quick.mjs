// 빠른 지시 칩 — 자주 보내는 업무(글 + 절차서 + 권한 모드)를 이름 붙여 저장. ~/.claude-office/quick.json
// 관리자 설정(config.json)과 따로 두어 관리자 저장이 덮어쓰지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import { officeHome } from './paths.mjs';
import { MODES } from './tasks.mjs';

const MAX = 30;
const file = () => path.join(officeHome(), 'quick.json');
const text = (v, n) => String(v ?? '').replace(/\r\n?/g, '\n').trim().slice(0, n);

export function normalizeQuick(raw) {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw && raw.quick) ? raw.quick : [];
  const out = [];
  const ids = new Set();
  for (const q of list) {
    if (!q || typeof q !== 'object') continue;
    const name = text(q.name, 30);
    const task = text(q.task, 2000);
    const procedure = /^[a-z0-9-]{0,60}$/.test(String(q.procedure || '')) ? String(q.procedure || '') : '';
    if (!name || (!task && !procedure)) continue;
    let id = /^[a-z0-9]{4,20}$/.test(String(q.id || '')) ? String(q.id) : Math.random().toString(36).slice(2, 10);
    while (ids.has(id)) id = Math.random().toString(36).slice(2, 10);
    ids.add(id);
    out.push({ id, name, task, procedure, mode: Object.hasOwn(MODES, q.mode) ? q.mode : 'acceptEdits', cont: q.cont !== false, team: text(q.team, 40) });
    if (out.length >= MAX) break;
  }
  return out;
}

export function listQuick() {
  try {
    return normalizeQuick(JSON.parse(fs.readFileSync(file(), 'utf8')));
  } catch {
    return [];
  }
}

export function saveQuick(raw) {
  const list = normalizeQuick(raw);
  fs.mkdirSync(officeHome(), { recursive: true });
  const tmp = file() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2));
  fs.renameSync(tmp, file());
  return list;
}
