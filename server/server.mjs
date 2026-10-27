#!/usr/bin/env node
// 로컬 HTTP 서버 — 127.0.0.1 에만 붙는 보기 전용 화면. 사용법: node server/server.mjs [--port N] [--demo] [--open]
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WEB_DIR, officeHome, pidFile, startingLock } from './paths.mjs';
import { VERSION, demoPort, loadConfig, resolvePort, saveConfig } from './config.mjs';
import { buildSnapshot } from './snapshot.mjs';
import { createDemo } from './demo.mjs';
import { decorate, homeOf, isHidden } from './staff.mjs';
import { REPO_DIR, pathKey } from './paths.mjs';
import { APP, health, openBrowser, removePidFile, urlOf } from './control.mjs';
import { listTasks, startTask, stopTask } from './tasks.mjs';
import { staffFor } from './staff.mjs';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.map': 'application/json',
};
const STARTED_AT = new Date().toISOString(); // health 에 실어 보낸다 — 코드가 이보다 나중에 바뀌었으면 setup 이 재시작
const SNAPSHOT_MEMO_MS = 1000; // 탭 여러 개가 동시에 물어도 1초에 한 번만 조립
const MAX_STATIC = 5000;
const MAX_BODY = 256 * 1024; // 관리자 저장 본문 상한
const ADMIN_HEADER = 'x-office-admin'; // 관리자 쓰기는 이 헤더가 있어야 한다 — 다른 사이트의 폼·fetch 는 못 붙인다(CSRF 방어)

/** 데모 사람들에게도 명부를 입힌다 — 관리자 화면을 데모로 시험해 볼 수 있게 */
function decorateDemo(snap) {
  const cfg = loadConfig();
  const people = [];
  for (const p of snap.people) {
    const name = p.name, key = pathKey(p.path);
    if (isHidden(cfg, name, key)) continue;
    people.push(decorate({ ...p, home: homeOf(cfg, name, key) || p.home || null }, cfg, name, key));
  }
  return { ...snap, people };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** 시작 때 web/ 를 훑어 내줄 파일 목록을 만든다. '_'·'.' 로 시작하는 이름과 링크는 뺀다 */
export function scanWeb(webDir = WEB_DIR) {
  const files = new Map(); // '/office/frog.webp' → 절대경로
  const walk = (dir, prefix) => {
    let ents;
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      if (files.size >= MAX_STATIC) return;
      if (e.name.startsWith('_') || e.name.startsWith('.')) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs, `${prefix}${e.name}/`);
      else if (e.isFile() && TYPES[path.extname(e.name).toLowerCase()]) files.set(`${prefix}${e.name}`, abs);
    }
  };
  walk(webDir, '/');
  return files;
}

const BASE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

function send(res, code, body, type = 'text/plain; charset=utf-8', extra = {}) {
  res.writeHead(code, { ...BASE_HEADERS, 'Content-Type': type, 'Cache-Control': 'no-store', ...extra });
  res.end(body);
}
const sendJson = (res, code, obj) => send(res, code, JSON.stringify(obj), 'application/json; charset=utf-8');

function sendFile(req, res, abs) {
  let st;
  try {
    st = fs.statSync(abs);
  } catch {
    return send(res, 404, 'not found');
  }
  const etag = `W/"${st.size}-${Math.floor(st.mtimeMs)}"`;
  const headers = { ...BASE_HEADERS, 'Content-Type': TYPES[path.extname(abs).toLowerCase()], 'Cache-Control': 'no-cache', ETag: etag };
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers);
    return res.end();
  }
  res.writeHead(200, { ...headers, 'Content-Length': st.size });
  const stream = fs.createReadStream(abs);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

/** http.Server 를 만든다(listen 은 호출자가). opts: webDir·demo·snapshot(시험용 주입) */
export function createOfficeServer({ webDir = WEB_DIR, demo = false, snapshot } = {}) {
  const files = scanWeb(webDir);
  const demoSnap = demo ? createDemo() : null;
  const make = snapshot || (demo ? async () => decorateDemo(demoSnap(Date.now())) : () => buildSnapshot());
  let memo = { at: 0, promise: null };
  const getSnapshot = () => {
    const now = Date.now();
    if (!memo.promise || now - memo.at >= SNAPSHOT_MEMO_MS) memo = { at: now, promise: Promise.resolve().then(make) };
    return memo.promise;
  };

  const server = http.createServer(async (req, res) => {
    try {
      // DNS 리바인딩 방지 — 남의 도메인 이름으로 들어온 요청은 거절한다
      const port = server.address() && server.address().port;
      const host = String(req.headers.host || '').toLowerCase();
      if (![`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`].includes(host)) return send(res, 403, 'forbidden');
      const raw = String(req.url || '/');
      const q = raw.indexOf('?');
      const p = q >= 0 ? raw.slice(0, q) : raw;
      if (/\.\.|%2e|\\|%5c|%00/i.test(p)) return send(res, 404, 'not found'); // 경로조작
      let route;
      try {
        route = decodeURIComponent(p);
      } catch {
        return send(res, 404, 'not found');
      }
      // 관리자 쓰기(설정 저장·업무 지시·업무 중지) — 같은 출처(브라우저 주소가 이 서버)에서 관리자 헤더를 붙인 JSON 만 받는다.
      const adminWrite = route.startsWith('/api/admin/') && req.method === 'POST';
      let body = null;
      if (adminWrite) {
        const origin = String(req.headers.origin || '').toLowerCase();
        const okOrigin = !origin || [`http://127.0.0.1:${port}`, `http://localhost:${port}`, `http://[::1]:${port}`].includes(origin);
        if (!okOrigin || req.headers[ADMIN_HEADER] !== '1' || !/^application\/json/i.test(String(req.headers['content-type'] || ''))) {
          return send(res, 403, 'forbidden');
        }
        try {
          body = JSON.parse(await readBody(req));
        } catch {
          return sendJson(res, 400, { error: 'bad json' });
        }
      }
      if (adminWrite && route === '/api/admin/task') {
        // 업무 지시 — 명부의 직원(key) 또는 경로(cwd)로 폴더를 정하고 claude -p 를 그 폴더에서 띄운다
        if (demo) return sendJson(res, 400, { error: 'demo server cannot run tasks', code: 'demo' });
        const cfg = loadConfig();
        let cwd = typeof body.cwd === 'string' ? body.cwd.trim() : '';
        const key = typeof body.key === 'string' ? body.key.trim() : '';
        if (!cwd && key) {
          const s = cfg.staff[key] || staffFor(cfg, key, pathKey(key));
          cwd = (s && s.path) || (path.isAbsolute(key) ? key : '');
        }
        try {
          const rec = startTask({ who: body.who || key, cwd, task: body.task, mode: body.mode, model: body.model });
          return sendJson(res, 200, { ok: true, task: rec });
        } catch (e) {
          return sendJson(res, 400, { error: e.message, code: e.code || 'bad', parent: e.parent || '' });
        }
      }
      if (adminWrite && route === '/api/admin/task/stop') {
        const r = stopTask(String(body.id || ''));
        return sendJson(res, r.ok ? 200 : 404, r);
      }
      if (adminWrite && route === '/api/admin/config') {
        try {
          const cfg = saveConfig(body);
          memo = { at: 0, promise: null }; // 다음 폴링이 새 설정으로 조립하게
          return sendJson(res, 200, { ok: true, config: cfg });
        } catch (e) {
          console.error(new Date().toISOString(), 'config save failed:', e && e.message ? e.message : e);
          return sendJson(res, 500, { error: 'save failed' });
        }
      }
      if (req.method !== 'GET') return send(res, 405, 'method not allowed', undefined, { Allow: 'GET' });
      if (route === '/api/admin/tasks') return sendJson(res, 200, { tasks: listTasks() });
      if (route === '/api/admin/config') {
        // 관리자 화면이 읽는다: 지금 설정 + 지금 사무실에 있는 프로젝트(명부에 넣기 쉽게)
        let seen = [];
        try {
          const snap = await getSnapshot();
          seen = (snap.people || []).map((x) => ({ folder: x.folder || x.name, path: x.path, name: x.name }));
        } catch {
          /* 스냅샷이 없어도 설정은 보여 준다 */
        }
        return sendJson(res, 200, { config: loadConfig(), seen, demo, version: VERSION });
      }
      if (route === '/api/office') {
        try {
          return sendJson(res, 200, await getSnapshot());
        } catch (e) {
          console.error(new Date().toISOString(), 'snapshot failed:', e && e.stack ? e.stack : e);
          return sendJson(res, 500, { error: 'snapshot failed' });
        }
      }
      if (route === '/api/config') {
        const c = loadConfig();
        return sendJson(res, 200, { lang: c.lang, title: c.title, teams: c.teams, layout: c.layout, version: VERSION });
      }
      if (route === '/api/health') return sendJson(res, 200, { ok: true, app: APP, version: VERSION, demo, pid: process.pid, repo: REPO_DIR, startedAt: STARTED_AT });
      const abs = files.get(route === '/' ? '/index.html' : route);
      if (!abs) return send(res, 404, 'not found');
      return sendFile(req, res, abs);
    } catch (e) {
      console.error(new Date().toISOString(), 'request failed:', e && e.stack ? e.stack : e);
      if (!res.headersSent) send(res, 500, 'error');
      else res.destroy();
    }
  });
  return server;
}

function parseArgs(argv) {
  const opts = { port: null, demo: false, open: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--demo') opts.demo = true;
    else if (a === '--open') opts.open = true;
    else if (a === '--port' || a.startsWith('--port=')) {
      const v = Number(a.includes('=') ? a.split('=')[1] : argv[++i]);
      if (!Number.isInteger(v) || v < 1 || v > 65535) throw new Error(`잘못된 포트 / bad port: ${a}`);
      opts.port = v;
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const port = opts.port || (opts.demo ? demoPort() : resolvePort());
  const url = urlOf(port);
  const server = createOfficeServer({ demo: opts.demo });
  server.on('error', async (e) => {
    if (e.code !== 'EADDRINUSE') {
      console.error(`서버를 못 띄웠습니다 / cannot start server: ${e.message}`);
      process.exit(1);
    }
    const h = await health(port);
    if (h) {
      console.log(`이미 떠 있습니다 / already running: ${url}${h.demo ? ' (demo)' : ''}`);
      if (opts.open) openBrowser(url);
      process.exit(0);
    }
    console.error(`포트 ${port} 를 다른 프로그램이 쓰고 있습니다 / port ${port} is used by another program. ` +
      `config.json 의 port 나 CLAUDE_OFFICE_PORT 로 바꾸세요 / change "port" in config.json or set CLAUDE_OFFICE_PORT.`);
    process.exit(1);
  });
  server.listen(port, '127.0.0.1', () => {
    try {
      fs.mkdirSync(officeHome(), { recursive: true });
      fs.writeFileSync(pidFile(opts.demo), JSON.stringify({ pid: process.pid, port, demo: opts.demo, startedAt: new Date().toISOString() }));
      if (!opts.demo) fs.rmSync(startingLock(), { force: true });
    } catch (e) {
      console.error('pid 파일을 못 썼습니다 / cannot write pid file:', e.message);
    }
    console.log(`${new Date().toISOString()} claude-3d-frog-office ${VERSION} ${opts.demo ? 'demo ' : ''}listening on ${url}`);
    if (opts.open) openBrowser(url);
  });
  const bye = () => {
    server.close();
    process.exit(0);
  };
  process.on('exit', () => removePidFile(opts.demo, process.pid));
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    try {
      process.on(sig, bye);
    } catch {
      /* 윈도우에 없는 신호 */
    }
  }
}

/** 직접 실행됐나 — 링크 경로로 불려도 맞게 실제 경로끼리 견준다 */
function isMain() {
  try {
    const a = fs.realpathSync(fileURLToPath(import.meta.url));
    const b = fs.realpathSync(path.resolve(process.argv[1] || ''));
    return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
  } catch {
    return false;
  }
}

if (isMain()) {
  main().catch((e) => {
    console.error(e && e.message ? e.message : e);
    process.exit(1);
  });
}
