// 직원 명부(설정 staff·teams·homes·hide)를 Person 에 입힌다 — 표시 이름·직책·팀·캐릭터 종류·색·자리·숨김.
// 열쇠는 프로젝트 폴더 이름 또는 경로(윈도우는 대소문자 무시). 실제 스냅샷과 데모가 같은 함수를 쓴다.
import { IS_WIN, pathKey } from './paths.mjs';

const nameKey = (s) => (IS_WIN ? String(s).toLowerCase() : String(s));
const sameKey = (k, name, key) => nameKey(k) === nameKey(name) || pathKey(k) === key;

/** 명부에서 이 프로젝트 항목 — 경로로 적은 것이 폴더 이름으로 적은 것보다 우선 */
export function staffFor(cfg, name, key) {
  let byName = null;
  for (const [k, v] of Object.entries(cfg.staff || {})) {
    if (pathKey(k) === key) return v;
    if (!byName && nameKey(k) === nameKey(name)) byName = v;
  }
  return byName;
}

export function isHidden(cfg, name, key) {
  if ((cfg.hide || []).some((x) => sameKey(x, name, key))) return true;
  const s = staffFor(cfg, name, key);
  return !!(s && s.hidden);
}

export function homeOf(cfg, name, key) {
  for (const [k, v] of Object.entries(cfg.homes || {})) {
    if (v === 'server' && sameKey(k, name, key)) return 'server';
  }
  const s = staffFor(cfg, name, key);
  return s && s.home === 'server' ? 'server' : null;
}

/** Person 에 명부 칸을 더한다(없으면 빈 값). name 은 명부의 표시 이름으로 바꾸고 folder 에 폴더 이름을 남긴다 */
export function decorate(person, cfg, name, key) {
  const s = staffFor(cfg, name, key) || {};
  const team = s.team && cfg.teams && Object.hasOwn(cfg.teams, s.team) ? s.team : '';
  const teamColor = team ? cfg.teams[team].color || '' : '';
  return {
    ...person,
    name: s.name || person.name,
    folder: name,
    title: s.title || '',
    team,
    kind: s.kind || null,
    color: s.color || teamColor || null,
  };
}
