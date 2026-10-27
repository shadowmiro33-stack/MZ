// 직원 명부(설정 staff·teams·homes·hide)를 Person 에 입힌다 — 표시 이름·직책·팀·캐릭터 종류·색·자리·숨김.
// 열쇠는 프로젝트 폴더 이름 또는 경로(윈도우는 대소문자 무시). 실제 스냅샷과 데모가 같은 함수를 쓴다.
import { IS_WIN, pathKey } from './paths.mjs';
import { toContext } from './journal.mjs';

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
    kind: s.kind || (team && cfg.teams[team].kind) || null,   // 개인 > 팀 대표 > 자동
    color: s.color || teamColor || null,
  };
}

/** 직원 프로필 → Claude 시스템 프롬프트에 덧붙일 글. 명부에 없으면 '' */
export function profilePrompt(cfg, key) {
  const s = (cfg.staff && cfg.staff[key]) || staffFor(cfg, key, pathKey(key)) || null;
  if (!s) return '';
  const who = [s.name, s.title, s.team ? `${s.team} 팀` : ''].filter(Boolean).join(' · ');
  const office = cfg.title ? ` ${cfg.title}의` : '';
  const lines = [];
  if (who) lines.push(`너는${office} 팀원 "${who}"이다. 이 프로젝트 폴더의 담당자로서 일한다.`);
  if (s.role) lines.push('담당 업무와 일하는 방식:', s.role);
  lines.push('보고는 한국어로, 결론부터 짧게. 막히는 것이 있으면 추측하지 말고 "질문:" 으로 시작하는 줄에 물어본다.');
  return lines.join('\n');
}

/** 프로필 + 그 폴더의 업무 일지(최근) — 업무마다 시스템 프롬프트에 붙는다 */
export function staffContext(cfg, key, cwd) {
  const parts = [profilePrompt(cfg, key)];
  let j = '';
  try { j = cwd ? toContext(cwd) : ''; } catch { j = ''; }
  if (j) parts.push('아래는 네 최근 업무 일지다. 이미 한 일은 되풀이하지 말고 이어서 한다.', j);
  return parts.filter(Boolean).join('\n\n');
}
