// 설정(config.json) 읽기·쓰기 — 없거나 깨져도 기본값으로 선다. 손으로 고친 이상한 값은 기본값으로 닫는다.
// 관리자 화면(/admin.html)이 같은 규칙(normalizeConfig)으로 검증해 saveConfig 로 저장한다.
import fs from 'node:fs';
import path from 'node:path';
import { REPO_DIR, configFile, officeHome } from './paths.mjs';

export const DEFAULT_PORT = 4777;
export const DEFAULTS = Object.freeze({
  port: DEFAULT_PORT,
  autoStart: true,
  title: '',
  homes: {},
  hide: [],
  teams: {},
  staff: {},
  fallbackMinutes: 20,
  staleHours: 6,
  kidCommits: 50,
  lang: 'auto',
  layout: 'image',
});

export const LAYOUTS = Object.freeze(['image', 'generated']); // image = 그림 위 고정 방 4개, generated = 팀 수대로 방 생성
export const KINDS = Object.freeze(['auto', 'pomesable', 'pomebw', 'pome', 'shiba', 'corgi', 'maltese', 'poodle', 'frog', 'capy']); // web/office-world.js OFFICE_SPECIES 와 같게
export const HOMES = Object.freeze(['server']);
export const MAX_TITLE = 40;
export const MAX_NAME = 24;
export const MAX_TEAMS = 32;
export const MAX_STAFF = 200;

export const VERSION = (() => {
  try {
    return String(JSON.parse(fs.readFileSync(path.join(REPO_DIR, 'package.json'), 'utf8')).version || '0.0.0');
  } catch {
    return '0.0.0';
  }
})();

const num = (v, lo, hi, def) => (Number.isFinite(v) && v >= lo && v <= hi ? v : def);
const plainObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
/** 한 줄 문자열 — 제어문자 제거, 길이 제한. 비면 '' */
const text = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : '');
const color = (v) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim()) ? v.trim().toUpperCase() : '');

/** 팀 목록 { 이름: { color, kind } } — 이름은 24자, 색은 #RRGGBB 만, kind 는 KINDS 중 하나(팀 대표 캐릭터) */
function normalizeTeams(raw) {
  const out = {};
  if (!plainObj(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    const name = text(k, MAX_NAME);
    if (!name || Object.keys(out).length >= MAX_TEAMS) continue;
    const c = plainObj(v) ? color(v.color) : color(v);
    out[name] = c ? { color: c } : {};
    if (plainObj(v) && KINDS.includes(v.kind) && v.kind !== 'auto') out[name].kind = v.kind;   // 팀 대표 캐릭터
  }
  return out;
}

/** 직원 명부 { 폴더이름|경로: { name, title, team, kind, home, hidden } } — 빈 칸은 뺀다 */
function normalizeStaff(raw, teams) {
  const out = {};
  if (!plainObj(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    const key = text(k, 512);
    if (!key || !plainObj(v) || Object.keys(out).length >= MAX_STAFF) continue;
    const s = {};
    const name = text(v.name, MAX_NAME);
    const title = text(v.title, MAX_NAME);
    const team = text(v.team, MAX_NAME);
    if (name) s.name = name;
    if (title) s.title = title;
    if (team && Object.hasOwn(teams, team)) s.team = team;
    if (KINDS.includes(v.kind) && v.kind !== 'auto') s.kind = v.kind;
    if (HOMES.includes(v.home)) s.home = v.home;
    if (v.hidden === true) s.hidden = true;
    const c = color(v.color);
    if (c) s.color = c;
    out[key] = s;
  }
  return out;
}

/** 읽은 값 → 검증된 설정. 모르는 키는 버린다. */
export function normalizeConfig(raw) {
  const c = plainObj(raw) ? raw : {};
  const homes = {};
  if (plainObj(c.homes)) {
    for (const [k, v] of Object.entries(c.homes)) if (typeof v === 'string') homes[k] = v;
  }
  const teams = normalizeTeams(c.teams);
  return {
    port: Number.isInteger(c.port) ? num(c.port, 1, 65535, DEFAULT_PORT) : DEFAULT_PORT,
    autoStart: c.autoStart !== false,
    title: text(c.title, MAX_TITLE),
    homes,
    hide: Array.isArray(c.hide) ? c.hide.filter((x) => typeof x === 'string' && x) : [],
    teams,
    staff: normalizeStaff(c.staff, teams),
    fallbackMinutes: num(c.fallbackMinutes, 0, 24 * 60, DEFAULTS.fallbackMinutes),
    staleHours: num(c.staleHours, 0.05, 24 * 30, DEFAULTS.staleHours),
    kidCommits: num(c.kidCommits, 0, 1e9, DEFAULTS.kidCommits),
    lang: ['auto', 'ko', 'en'].includes(c.lang) ? c.lang : 'auto',
    layout: LAYOUTS.includes(c.layout) ? c.layout : 'image',
  };
}

let cache = null; // { file, mtimeMs, cfg } — 폴링마다 파일을 다시 파싱하지 않게

export function loadConfig() {
  const file = configFile();
  let mtimeMs = -1;
  try {
    mtimeMs = fs.statSync(file).mtimeMs;
  } catch {
    /* 없음 = 기본값 */
  }
  if (cache && cache.file === file && cache.mtimeMs === mtimeMs) return cache.cfg;
  let raw = {};
  if (mtimeMs >= 0) {
    try {
      raw = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
    } catch {
      raw = {};
    }
  }
  const cfg = normalizeConfig(raw);
  cache = { file, mtimeMs, cfg };
  return cfg;
}

/** 관리자 화면이 보낸 설정을 검증해 config.json 에 저장(원자적 쓰기). 돌려주는 값 = 저장된(정규화된) 설정 */
export function saveConfig(raw) {
  const cfg = normalizeConfig(raw);
  const file = configFile();
  fs.mkdirSync(officeHome(), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n');
  fs.renameSync(tmp, file);
  cache = null; // 다음 loadConfig 가 새 파일을 읽는다
  return cfg;
}

/** 포트 — 환경변수 CLAUDE_OFFICE_PORT 가 설정보다 우선 */
export function resolvePort(cfg = loadConfig()) {
  const env = Number(process.env.CLAUDE_OFFICE_PORT);
  if (Number.isInteger(env) && env >= 1 && env <= 65535) return env;
  return cfg.port;
}

/** 데모 서버 포트 — 실제 서버와 헷갈리지 않게 한 칸 옆 */
export function demoPort(cfg = loadConfig()) {
  const p = resolvePort(cfg);
  return p >= 65535 ? p - 1 : p + 1;
}

/** setup 이 처음 만들어 두는 config.json 내용 */
export function defaultConfigText() {
  return JSON.stringify({ ...DEFAULTS }, null, 2) + '\n';
}
