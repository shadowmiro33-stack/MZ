// 서버 켜기·끄기·상태 확인 — scripts/* 와 훅(SessionStart 자동 시작)이 함께 쓴다.
import fs from 'node:fs';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { IS_WIN, REPO_DIR, SERVER_FILE, logFile, officeHome, pathKey, pidFile, startingLock } from './paths.mjs';
import { VERSION, demoPort, loadConfig, resolvePort } from './config.mjs';
import { pidAlive } from './liveness.mjs';

export const APP = 'claude-3d-frog-office';
export const LOCK_MAX_AGE_MS = 30 * 1000;
const LOG_MAX = 1024 * 1024; // 로그가 1MB 넘으면 .old 로 돌린다

export const urlOf = (port) => `http://127.0.0.1:${port}/`;

/** GET /api/health — 응답이 없거나 우리 서버가 아니면 null */
export function health(port, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/health', timeout: timeoutMs }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { if (body.length < 4096) body += c; });
      res.on('end', () => {
        try {
          const j = JSON.parse(body);
          resolve(j && j.ok === true && j.app === APP ? j : null);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
  });
}

/** 포트에 뭔가 듣고 있나(우리 것이든 아니든) */
export function portBusy(port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('timeout', () => { req.destroy(); resolve(true); });
    req.on('error', (e) => resolve(e.code !== 'ECONNREFUSED'));
  });
}

export async function waitHealth(port, totalMs = 8000) {
  const until = Date.now() + totalMs;
  while (Date.now() < until) {
    const h = await health(port, 700);
    if (h) return h;
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

/** server.pid → { pid, port } (없거나 깨졌으면 null) */
export function readPidInfo(demo = false) {
  try {
    const text = fs.readFileSync(pidFile(demo), 'utf8');
    let j;
    try {
      j = JSON.parse(text);
    } catch {
      j = { pid: parseInt(text, 10) };
    }
    return Number.isInteger(j.pid) && j.pid > 0 ? { pid: j.pid, port: Number.isInteger(j.port) ? j.port : null } : null;
  } catch {
    return null;
  }
}

function rotateLog() {
  try {
    if (fs.statSync(logFile()).size > LOG_MAX) fs.renameSync(logFile(), `${logFile()}.old`);
  } catch {
    /* 없음 */
  }
}

/**
 * 서버를 백그라운드로 띄운다(분리·창 숨김). 출력은 server.log 로 — 훅의 stdout 파이프를 물려받으면
 * Claude 가 그 파이프가 닫히길 기다리며 멈출 수 있어 절대 상속하지 않는다.
 */
export function startDetached({ demo = false, port = null } = {}) {
  fs.mkdirSync(officeHome(), { recursive: true });
  rotateLog();
  const fd = fs.openSync(logFile(), 'a');
  const args = [SERVER_FILE];
  if (demo) args.push('--demo');
  if (port) args.push('--port', String(port));
  try {
    const child = spawn(process.execPath, args, {
      cwd: REPO_DIR,
      detached: true,
      stdio: ['ignore', fd, fd],
      windowsHide: true,
    });
    child.on('error', () => {});
    child.unref();
    return child.pid || null;
  } finally {
    fs.closeSync(fd);
  }
}

/** 잠금 파일 — 동시에 뜬 SessionStart 여럿이 서버를 여럿 띄우지 않게. 잡으면 true */
export function takeStartLock(now = Date.now()) {
  const lock = startingLock();
  fs.mkdirSync(officeHome(), { recursive: true });
  try {
    if (now - fs.statSync(lock).mtimeMs < LOCK_MAX_AGE_MS) return false;
    fs.unlinkSync(lock); // 30초 넘은 잠금 = 시작하다 죽은 것
  } catch {
    /* 잠금 없음 */
  }
  try {
    fs.writeFileSync(lock, String(now), { flag: 'wx' });
    return true;
  } catch {
    return false; // 그새 다른 훅이 잡았다
  }
}

/**
 * 훅(SessionStart)이 부른다 — 서버가 꺼져 있으면 띄운다.
 * pid 만 보지 않고 health 까지 본다: 재부팅 뒤엔 옛 pid 번호를 남의 프로세스가 쓰고 있을 수 있다.
 */
export async function ensureServer() {
  const cfg = loadConfig();
  if (!cfg.autoStart) return 'off';
  const port = resolvePort(cfg);
  const h = await health(port, 400);
  if (h && !isStale(h)) return 'running';
  if (!takeStartLock()) return 'starting';
  if (h) await stopServer();                                // 옛 폴더·옛 버전의 서버 — 끄고 이 저장소 것으로
  startDetached();
  return 'started';
}

/** 떠 있는 서버가 이 저장소·이 버전의 것인가 — 옛 폴더에서 뜬 서버는 새 코드를 안 보여 준다 */
export function isStale(h) {
  if (!h) return false;
  if (h.version !== VERSION) return true;
  if (typeof h.repo !== 'string') return true;            // repo 를 안 알려 주는 옛 버전
  if (pathKey(h.repo) !== pathKey(REPO_DIR)) return true;
  // 같은 폴더·같은 버전이어도 git pull 로 서버 코드가 바뀌었으면(파일이 서버 시작보다 나중) 옛 프로세스다
  const started = Date.parse(String(h.startedAt || '')) || 0;
  return started > 0 && codeMtime() > started + 1000;
}

/** server/*.mjs 와 hooks/*.mjs 중 가장 최근 수정 시각 */
export function codeMtime() {
  let latest = 0;
  for (const dir of ['server', 'hooks']) {
    try {
      for (const f of fs.readdirSync(`${REPO_DIR}/${dir}`)) {
        if (!f.endsWith('.mjs')) continue;
        const m = fs.statSync(`${REPO_DIR}/${dir}/${f}`).mtimeMs;
        if (m > latest) latest = m;
      }
    } catch { /* 폴더가 없으면 건너뜀 */ }
  }
  return latest;
}

/** 서버 끄기 — health 가 알려 준 pid 만 죽인다(남의 프로세스를 죽이지 않게) */
export async function stopServer({ demo = false } = {}) {
  const cfg = loadConfig();
  const info = readPidInfo(demo);
  const ports = [...new Set([info && info.port, demo ? demoPort(cfg) : resolvePort(cfg)].filter(Boolean))];
  for (const port of ports) {
    const h = await health(port, 800);
    if (!h || !!h.demo !== demo || !Number.isInteger(h.pid)) continue;
    try {
      process.kill(h.pid, 'SIGTERM');
    } catch {
      /* 이미 죽었다 */
    }
    const until = Date.now() + 3000;
    while (Date.now() < until && pidAlive(h.pid)) await new Promise((r) => setTimeout(r, 100));
    if (pidAlive(h.pid) && !IS_WIN) {
      try { process.kill(h.pid, 'SIGKILL'); } catch { /* 무시 */ }
    }
    removePidFile(demo, h.pid);
    return { stopped: true, pid: h.pid, port };
  }
  if (info) removePidFile(demo, info.pid); // 응답 없는 기록 = 낡은 파일
  return { stopped: false, stale: !!info };
}

export function removePidFile(demo, pid) {
  const info = readPidInfo(demo);
  if (info && pid && info.pid !== pid) return; // 그새 다른 서버가 쓴 기록이면 둔다
  try {
    fs.unlinkSync(pidFile(demo));
  } catch {
    /* 없음 */
  }
}

/** 기본 브라우저로 열기 — 실패해도 조용히(주소는 호출자가 화면에 찍는다) */
export function openBrowser(url) {
  let cmd;
  let args;
  if (process.platform === 'darwin') [cmd, args] = ['open', [url]];
  else if (IS_WIN) [cmd, args] = ['rundll32', ['url.dll,FileProtocolHandler', url]];
  else [cmd, args] = ['xdg-open', [url]];
  try {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}
