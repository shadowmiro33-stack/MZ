// 서버 — Host 검사, 경로조작, '_' 파일, 메서드, /api/* 형식, 데모, 실제 실행(포트 겹침·pid 파일).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createOfficeServer, scanWeb } from '../server/server.mjs';
import { createDemo } from '../server/demo.mjs';

const SERVER = fileURLToPath(new URL('../server/server.mjs', import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'office-server-'));
process.env.CLAUDE_CONFIG_DIR = path.join(tmp, 'cfg');
process.env.CLAUDE_OFFICE_HOME = path.join(tmp, 'home');
fs.mkdirSync(path.join(tmp, 'cfg', 'projects'), { recursive: true });

// 가짜 web/ — 다른 담당의 실제 화면 파일과 무관하게 시험한다
const web = path.join(tmp, 'web');
fs.mkdirSync(path.join(web, 'office'), { recursive: true });
fs.mkdirSync(path.join(web, '_private'), { recursive: true });
fs.writeFileSync(path.join(web, 'index.html'), '<!doctype html><title>t</title>');
fs.writeFileSync(path.join(web, 'app.js'), 'console.log(1)');
fs.writeFileSync(path.join(web, '_orig-office.js'), 'secret');
fs.writeFileSync(path.join(web, '.env'), 'X=1');
fs.writeFileSync(path.join(web, 'notes.unknownext'), 'x');
fs.writeFileSync(path.join(web, 'office', 'frog.webp'), Buffer.from('RIFF0000WEBP'));
fs.writeFileSync(path.join(web, '_private', 'a.js'), 'secret');
fs.writeFileSync(path.join(tmp, 'outside.txt'), 'outside');

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}
function req(port, rawPath, { host, method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, path: rawPath, method, headers: { Host: host ?? `127.0.0.1:${port}`, ...headers } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    r.on('error', reject);
    r.end(body);
  });
}
function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
}

const fakeSnap = async () => ({ version: 1, now: new Date().toISOString(), hooks: false, demo: false, people: [] });
const server = createOfficeServer({ webDir: web, snapshot: fakeSnap });
let port;
test.before(async () => {
  port = await listen(server);
});
test.after(() => {
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('scanWeb: _·. 로 시작하는 이름과 모르는 확장자는 목록에 없다', () => {
  assert.deepEqual([...scanWeb(web).keys()].sort(), ['/app.js', '/index.html', '/office/frog.webp']);
});

test('Host 검사: 127.0.0.1·localhost·[::1] + 포트만, 나머지 403', async () => {
  for (const h of [`127.0.0.1:${port}`, `localhost:${port}`, `LOCALHOST:${port}`, `[::1]:${port}`]) {
    assert.equal((await req(port, '/', { host: h })).status, 200, h);
  }
  for (const h of ['evil.com', `evil.com:${port}`, '127.0.0.1', `127.0.0.1:${port + 1}`, `localhost.evil.com:${port}`, `0.0.0.0:${port}`]) {
    assert.equal((await req(port, '/api/office', { host: h })).status, 403, h);
  }
});

test('GET 외 405, CORS 헤더 없음', async () => {
  for (const m of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
    const r = await req(port, '/api/office', { method: m });
    assert.equal(r.status, 405, m);
  }
  const r = await req(port, '/api/office', { headers: { Origin: 'http://evil.com' } });
  assert.equal(r.status, 200);
  assert.equal(r.headers['access-control-allow-origin'], undefined);
});

test('정적 파일: 목록에 있는 것만, 경로조작·_ 파일·숨김 파일은 404', async () => {
  const ok = await req(port, '/office/frog.webp');
  assert.equal(ok.status, 200);
  assert.equal(ok.headers['content-type'], 'image/webp');
  assert.equal((await req(port, '/')).headers['content-type'], 'text/html; charset=utf-8');
  assert.equal((await req(port, '/app.js?v=3')).status, 200);
  const etag = ok.headers.etag;
  assert.equal((await req(port, '/office/frog.webp', { headers: { 'If-None-Match': etag } })).status, 304);
  for (const p of ['/../outside.txt', '/%2e%2e/outside.txt', '/%2E%2E%2Foutside.txt', '/office/..%5c..%5coutside.txt',
    '/office\\..\\..\\outside.txt', '/_orig-office.js', '/_private/a.js', '/.env', '/notes.unknownext', '/index.html%00',
    '/%E0%A4%A', '/nope.js', '/office/']) {
    const r = await req(port, p);
    assert.equal(r.status, 404, p);
    assert.ok(!r.body.includes('secret') && !r.body.includes('outside'), p);
  }
});

test('/api/office·/api/config·/api/health 형식', async () => {
  const o = await req(port, '/api/office');
  assert.equal(o.headers['content-type'], 'application/json; charset=utf-8');
  assert.equal(o.headers['cache-control'], 'no-store');
  assert.deepEqual(Object.keys(JSON.parse(o.body)).sort(), ['demo', 'hooks', 'now', 'people', 'version']);
  const c = JSON.parse((await req(port, '/api/config')).body);
  assert.equal(c.lang, 'auto');
  assert.equal(typeof c.version, 'string');
  const h = JSON.parse((await req(port, '/api/health')).body);
  assert.equal(h.ok, true);
  assert.equal(h.app, 'claude-3d-frog-office');
  assert.equal(h.demo, false);
  assert.equal(h.pid, process.pid);
});

test('관리자 API: 헤더·출처·JSON 검사, 저장하면 config.json 이 바뀌고 /api/config 에 보인다', async () => {
  const good = { 'Content-Type': 'application/json', 'X-Office-Admin': '1' };
  const body = JSON.stringify({ title: 'RGA 오피스', teams: { 개발: { color: '#2e86de' } }, staff: { app: { name: '개굴', team: '개발' } }, port: 4777 });
  // 읽기 — 설정 + 지금 보이는 프로젝트
  const g = JSON.parse((await req(port, '/api/admin/config')).body);
  assert.deepEqual(Object.keys(g).sort(), ['config', 'demo', 'seen', 'version']);
  assert.equal(g.config.title, '');
  // 막히는 것들: 관리자 헤더 없음, 다른 출처, JSON 아님, 깨진 JSON, 다른 경로에 POST
  assert.equal((await req(port, '/api/admin/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })).status, 403);
  assert.equal((await req(port, '/api/admin/config', { method: 'POST', headers: { ...good, Origin: 'http://evil.com' }, body })).status, 403);
  assert.equal((await req(port, '/api/admin/config', { method: 'POST', headers: { 'X-Office-Admin': '1', 'Content-Type': 'text/plain' }, body })).status, 403);
  assert.equal((await req(port, '/api/admin/config', { method: 'POST', headers: good, body: '{bad' })).status, 400);
  assert.equal((await req(port, '/api/config', { method: 'POST', headers: good, body })).status, 405);
  assert.ok(!fs.existsSync(path.join(tmp, 'home', 'config.json')));
  // 저장
  const ok = await req(port, '/api/admin/config', { method: 'POST', headers: { ...good, Origin: `http://127.0.0.1:${port}` }, body });
  assert.equal(ok.status, 200);
  const saved = JSON.parse(ok.body);
  assert.equal(saved.ok, true);
  assert.equal(saved.config.title, 'RGA 오피스');
  assert.deepEqual(saved.config.staff, { app: { name: '개굴', team: '개발' } });
  const onDisk = JSON.parse(fs.readFileSync(path.join(tmp, 'home', 'config.json'), 'utf8'));
  assert.equal(onDisk.title, 'RGA 오피스');
  assert.equal(onDisk.port, 4777);
  const c = JSON.parse((await req(port, '/api/config')).body);
  assert.equal(c.title, 'RGA 오피스');
  assert.deepEqual(c.teams, { 개발: { color: '#2E86DE' } });
  fs.rmSync(path.join(tmp, 'home', 'config.json'), { force: true });
});

test('실제 스냅샷 경로(주입 없음)도 서버에서 돈다', async () => {
  const real = createOfficeServer({ webDir: web });
  const p = await listen(real);
  try {
    const r = await req(p, '/api/office');
    assert.equal(r.status, 200);
    const j = JSON.parse(r.body);
    assert.equal(j.version, 1);
    assert.equal(j.demo, false);
    assert.ok(Array.isArray(j.people));
  } finally {
    real.close();
  }
});

test('스냅샷이 터지면 500 JSON, 서버는 산다', async () => {
  const bad = createOfficeServer({ webDir: web, snapshot: async () => { throw new Error('boom'); } });
  const p = await listen(bad);
  const origError = console.error;
  console.error = () => {};
  try {
    const r = await req(p, '/api/office');
    assert.equal(r.status, 500);
    assert.deepEqual(JSON.parse(r.body), { error: 'snapshot failed' });
    assert.equal((await req(p, '/api/health')).status, 200);
  } finally {
    console.error = origError;
    bad.close();
  }
});

test('데모: 6~8명, 승인 대기·꼬마·서브에이전트·서버실 1명, demo:true', async () => {
  const demo = createOfficeServer({ webDir: web, demo: true });
  const p = await listen(demo);
  try {
    const j = JSON.parse((await req(p, '/api/office')).body);
    assert.equal(j.demo, true);
    assert.ok(j.people.length >= 6 && j.people.length <= 8);
    assert.equal(new Set(j.people.map((x) => x.name)).size, j.people.length);
    assert.ok(j.people.some((x) => x.status === 'decision' && x.ask && x.pending === 1));
    assert.ok(j.people.some((x) => x.kid));
    assert.ok(j.people.some((x) => x.subCount > 0 && x.subs.length === x.subCount));
    assert.equal(j.people.filter((x) => x.home === 'server').length, 1);
    assert.equal(JSON.parse((await req(p, '/api/health')).body).demo, true);
  } finally {
    demo.close();
  }
});

test('데모: 시간이 가면 상태가 바뀌고 로그가 자란다', () => {
  const t0 = Date.parse('2026-10-22T00:00:00Z');
  const snap = createDemo(7, t0);
  const a = snap(t0);
  const b = snap(t0 + 120000);
  const statuses = (s) => s.people.map((x) => x.status).join();
  assert.notEqual(statuses(a), statuses(b));
  const lastAt = (s) => s.people.map((x) => x.log.at(-1).at).sort().at(-1);
  assert.ok(lastAt(b) > lastAt(a));
  for (const x of b.people) assert.ok(x.log.length <= 8);
});

test('실행: pid 파일, 같은 포트 두 번째는 "이미 떠 있음" 0, 남의 포트면 1, 끄면 pid 파일 정리', async () => {
  const p = await freePort();
  const env = { ...process.env };
  const child = spawn(process.execPath, [SERVER, '--port', String(p)], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await new Promise((resolve, reject) => {
      child.stdout.on('data', (d) => { if (String(d).includes('listening')) resolve(); });
      child.on('exit', (c) => reject(new Error(`exit ${c}`)));
    });
    const pidFile = path.join(process.env.CLAUDE_OFFICE_HOME, 'server.pid');
    assert.equal(JSON.parse(fs.readFileSync(pidFile, 'utf8')).pid, child.pid);
    const again = spawnSync(process.execPath, [SERVER, '--port', String(p)], { env, encoding: 'utf8', timeout: 15000 });
    assert.equal(again.status, 0);
    assert.match(again.stdout, /already running/);
    assert.equal(JSON.parse(fs.readFileSync(pidFile, 'utf8')).pid, child.pid); // 남의 기록을 지우지 않는다

    const foreign = http.createServer((q, s) => s.end('hi'));
    const fp = await listen(foreign);
    const clash = spawnSync(process.execPath, [SERVER, '--port', String(fp)], { env, encoding: 'utf8', timeout: 15000 });
    foreign.close();
    assert.equal(clash.status, 1);
    assert.match(clash.stderr, /used by another program/);

    const exited = new Promise((resolve) => child.on('exit', resolve));
    child.kill('SIGTERM');
    await exited;
    if (process.platform !== 'win32') assert.ok(!fs.existsSync(pidFile)); // 윈도우 kill 은 종료 처리기를 안 부른다
  } finally {
    if (child.exitCode === null) child.kill('SIGKILL');
  }
});

test('업무 지시: claude -p 를 그 폴더에서 띄우고 stdin 으로 업무를 넘긴다, 목록·로그·중지', async () => {
  // 가짜 claude — 인자와 stdin 을 받아 찍고 끝난다
  const fake = path.join(tmp, 'fake-claude.mjs');
  fs.writeFileSync(fake, `let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log('ARGS',JSON.stringify(process.argv.slice(2)));console.log('CWD',process.cwd());console.log('TASK',s.trim());setTimeout(()=>process.exit(0),300)});`);
  const bin = path.join(tmp, process.platform === 'win32' ? 'claude.cmd' : 'claude');
  fs.writeFileSync(bin, process.platform === 'win32' ? `@echo off\r\n"${process.execPath}" "${fake}" %*\r\n` : `#!/bin/sh\nexec "${process.execPath}" "${fake}" "$@"\n`);
  if (process.platform !== 'win32') fs.chmodSync(bin, 0o755);
  process.env.CLAUDE_BIN = bin;
  const proj = path.join(tmp, 'proj'); fs.mkdirSync(proj, { recursive: true });
  const good = { 'Content-Type': 'application/json', 'X-Office-Admin': '1' };
  const bad = await req(port, '/api/admin/task', { method: 'POST', headers: good, body: JSON.stringify({ cwd: path.join(tmp, 'nope'), task: 'x' }) });
  assert.equal(bad.status, 400);
  const r = await req(port, '/api/admin/task', { method: 'POST', headers: good, body: JSON.stringify({ cwd: proj, who: '몽실이', task: 'README 정리해줘', mode: 'acceptEdits' }) });
  assert.equal(r.status, 200, r.body);
  const { task } = JSON.parse(r.body);
  assert.equal(task.cwd, proj);
  assert.equal(task.mode, 'acceptEdits');
  let list;
  for (let i = 0; i < 40; i++) {
    await new Promise((res) => setTimeout(res, 100));
    list = JSON.parse((await req(port, '/api/admin/tasks')).body).tasks;
    if (list[0] && list[0].status !== 'running') break;
  }
  assert.equal(list[0].id, task.id);
  assert.equal(list[0].status, 'done', JSON.stringify(list[0]));
  assert.match(list[0].log, /TASK README 정리해줘/);
  assert.match(list[0].log, /--permission-mode","acceptEdits","--permission-prompts","none"/);
  assert.ok(list[0].log.includes(`CWD ${fs.realpathSync(proj)}`) || list[0].log.includes(`CWD ${proj}`));
  assert.equal(list[0].who, '몽실이');
  assert.equal((await req(port, '/api/admin/task/stop', { method: 'POST', headers: good, body: JSON.stringify({ id: task.id }) })).status, 404); // 이미 끝남
  delete process.env.CLAUDE_BIN;
});

test('업무 절차: 저장하면 .claude/procedures/<slug>.md·.json·그림이 생기고, 목록·읽기·그림·삭제', async () => {
  const proj = path.join(tmp, 'proj2'); fs.mkdirSync(proj, { recursive: true });
  const good = { 'Content-Type': 'application/json', 'X-Office-Admin': '1' };
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const r = await req(port, '/api/admin/procedure', { method: 'POST', headers: good, body: JSON.stringify({ cwd: `"${proj}"`, name: '매거진 수집/발행', memo: '아침마다', steps: [{ text: '수집기 실행', image: png }, { text: '발행 버튼' }] }) });
  assert.equal(r.status, 200, r.body);
  const { procedure } = JSON.parse(r.body);
  assert.equal(procedure.slug, '매거진-수집발행');
  const dir = path.join(proj, '.claude', 'procedures');
  assert.ok(fs.existsSync(path.join(dir, '매거진-수집발행.md')));
  assert.ok(fs.existsSync(path.join(dir, '매거진-수집발행', '01.png')));
  const md = fs.readFileSync(path.join(dir, '매거진-수집발행.md'), 'utf8');
  assert.match(md, /1\. 수집기 실행\n   !\[단계 1\]\(매거진-수집발행\/01\.png\)/);
  assert.match(md, /2\. 발행 버튼/);
  const list = JSON.parse((await req(port, '/api/admin/procedures?cwd=' + encodeURIComponent(proj))).body).procedures;
  assert.equal(list.length, 1); assert.equal(list[0].steps, 2);
  const one = JSON.parse((await req(port, `/api/admin/procedure?cwd=${encodeURIComponent(proj)}&slug=${encodeURIComponent('매거진-수집발행')}`)).body).procedure;
  assert.equal(one.steps[0].image, '01.png');
  const img = await req(port, `/api/admin/procedure/image?cwd=${encodeURIComponent(proj)}&slug=${encodeURIComponent('매거진-수집발행')}&file=01.png`);
  assert.equal(img.status, 200); assert.equal(img.headers['content-type'], 'image/png');
  // 순서 바꿔 다시 저장 — 그림 번호가 따라간다
  const r2 = await req(port, '/api/admin/procedure', { method: 'POST', headers: good, body: JSON.stringify({ cwd: proj, slug: '매거진-수집발행', name: '매거진 수집/발행', steps: [{ text: '발행 버튼' }, { text: '수집기 실행', image: '01.png' }] }) });
  assert.equal(JSON.parse(r2.body).procedure.steps[1].image, '02.png');
  assert.ok(!fs.existsSync(path.join(dir, '매거진-수집발행', '01.png')));
  // 업무에 절차 붙이기 (가짜 claude)
  const fake = path.join(tmp, 'fake-claude.mjs');
  if (fs.existsSync(fake)) {
    process.env.CLAUDE_BIN = path.join(tmp, process.platform === 'win32' ? 'claude.cmd' : 'claude');
    const t = await req(port, '/api/admin/task', { method: 'POST', headers: good, body: JSON.stringify({ cwd: proj, task: '오늘 기사만', procedure: '매거진-수집발행', mode: 'auto', continueSession: true }) });
    assert.equal(t.status, 200, t.body);
    const task = JSON.parse(t.body).task;
    assert.match(task.task, /\.claude\/procedures\/매거진-수집발행\.md 절차서/);
    assert.ok(task.continueSession);
    delete process.env.CLAUDE_BIN;
  }
  assert.equal(JSON.parse((await req(port, '/api/admin/procedure/delete', { method: 'POST', headers: good, body: JSON.stringify({ cwd: proj, slug: '매거진-수집발행' }) })).body).ok, true);
  assert.ok(!fs.existsSync(path.join(dir, '매거진-수집발행.md')));
});

test('반복 업무: 등록·다음 실행 시각·지금 실행·끄기·삭제', async () => {
  const { nextRunOf, normalizeSchedule, tick } = await import('../server/schedules.mjs');
  const proj = path.join(tmp, 'proj3'); fs.mkdirSync(proj, { recursive: true });
  const good = { 'Content-Type': 'application/json', 'X-Office-Admin': '1' };
  const now = new Date('2026-10-27T10:00:00').getTime();
  const d = normalizeSchedule({ cwd: proj, task: 'x', every: 'daily', time: '07:00' });
  assert.equal(new Date(nextRunOf(d, now)).getHours(), 7);
  assert.ok(Date.parse(nextRunOf(d, now)) > now);
  const h = normalizeSchedule({ cwd: proj, task: 'x', every: 'minutes', minutes: 1 });
  assert.equal(h.minutes, 5);
  assert.throws(() => normalizeSchedule({ cwd: proj }), /need a task/);
  const r = await req(port, '/api/admin/schedule', { method: 'POST', headers: good, body: JSON.stringify({ cwd: proj, who: '별이', task: 'TODO 하나 진행', every: 'hourly', mode: 'auto' }) });
  assert.equal(r.status, 200, r.body);
  const s = JSON.parse(r.body).schedule;
  assert.equal(s.every, 'hourly'); assert.ok(s.enabled); assert.ok(s.nextRun);
  let list = JSON.parse((await req(port, '/api/admin/schedules')).body).schedules;
  assert.equal(list.length, 1);
  assert.deepEqual(tick(Date.now()), []); // 아직 때가 안 됨
  if (fs.existsSync(path.join(tmp, 'fake-claude.mjs'))) {
    process.env.CLAUDE_BIN = path.join(tmp, process.platform === 'win32' ? 'claude.cmd' : 'claude');
    const run = await req(port, '/api/admin/schedule/run', { method: 'POST', headers: good, body: JSON.stringify({ id: s.id }) });
    assert.equal(run.status, 200, run.body);
    assert.equal(JSON.parse(run.body).task.schedule, s.id);
    list = JSON.parse((await req(port, '/api/admin/schedules')).body).schedules;
    assert.equal(list[0].runs, 1); assert.ok(list[0].lastRun);
    delete process.env.CLAUDE_BIN;
  }
  const off = await req(port, '/api/admin/schedule', { method: 'POST', headers: good, body: JSON.stringify({ ...s, enabled: false }) });
  assert.equal(JSON.parse(off.body).schedule.enabled, false);
  assert.equal(JSON.parse((await req(port, '/api/admin/schedule/delete', { method: 'POST', headers: good, body: JSON.stringify({ id: s.id }) })).body).ok, true);
  assert.equal(JSON.parse((await req(port, '/api/admin/schedules')).body).schedules.length, 0);
});

test('업무 삭제·비우기: 끝난 것만 지우고 실행 중은 남긴다', async () => {
  const { tasksDir } = await import('../server/tasks.mjs');
  const dir = tasksDir(); fs.mkdirSync(dir, { recursive: true });
  const mk = (id, ended) => fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({ id, who: 'x', cwd: tmp, task: 't', startedAt: '2026-01-01T00:00:00Z', endedAt: ended ? '2026-01-01T00:01:00Z' : null, exitCode: ended ? 0 : null, pid: ended ? 1 : process.pid }));
  mk('20260101-000000-done', true); mk('20260101-000001-live', false);
  const good = { 'Content-Type': 'application/json', 'X-Office-Admin': '1' };
  assert.equal(JSON.parse((await req(port, '/api/admin/task/delete', { method: 'POST', headers: good, body: JSON.stringify({ id: '20260101-000000-done' }) })).body).ok, true);
  assert.ok(!fs.existsSync(path.join(dir, '20260101-000000-done.json')));
  assert.equal(JSON.parse((await req(port, '/api/admin/task/delete', { method: 'POST', headers: good, body: JSON.stringify({ id: '../x' }) })).body).ok, false);
  mk('20260101-000002-done2', true);
  const r = JSON.parse((await req(port, '/api/admin/tasks/clear', { method: 'POST', headers: good, body: '{}' })).body);
  assert.ok(r.removed >= 1);
  assert.ok(fs.existsSync(path.join(dir, '20260101-000001-live.json'))); // 살아 있는 pid = 남긴다
  fs.rmSync(path.join(dir, '20260101-000001-live.json'), { force: true });
});

test('직원 프로필: role 이 시스템 프롬프트로 claude 에 붙는다', async () => {
  const { profilePrompt } = await import('../server/staff.mjs');
  const { normalizeConfig } = await import('../server/config.mjs');
  const cfg = normalizeConfig({ title: 'RGA 오피스', teams: { 개발: {} }, staff: { app: { name: '개굴 대리', title: '프론트엔드', team: '개발', role: '- 항상 npm test\n- 세 줄 보고' } } });
  const p = profilePrompt(cfg, 'app');
  assert.match(p, /RGA 오피스의 팀원 "개굴 대리 · 프론트엔드 · 개발 팀"/);
  assert.match(p, /항상 npm test/);
  assert.match(p, /질문:/);
  assert.equal(profilePrompt(cfg, 'nobody'), '');
  if (fs.existsSync(path.join(tmp, 'fake-claude.mjs'))) {
    process.env.CLAUDE_BIN = path.join(tmp, process.platform === 'win32' ? 'claude.cmd' : 'claude');
    fs.writeFileSync(path.join(tmp, 'home', 'config.json'), JSON.stringify({ staff: { proj: { name: '개굴 대리', role: '항상 npm test' } } }));
    const proj = path.join(tmp, 'proj'); fs.mkdirSync(proj, { recursive: true });
    const good = { 'Content-Type': 'application/json', 'X-Office-Admin': '1' };
    const r = await req(port, '/api/admin/task', { method: 'POST', headers: good, body: JSON.stringify({ cwd: proj, key: 'proj', task: 'x' }) });
    const task = JSON.parse(r.body).task;
    assert.ok(task.profile);
    let log = '';
    for (let i = 0; i < 40 && !/ARGS/.test(log); i++) { await new Promise((res) => setTimeout(res, 100)); try { log = fs.readFileSync(path.join(tmp, 'home', 'tasks', `${task.id}.log`), 'utf8'); } catch { /* 아직 */ } }
    assert.match(log, /--append-system-prompt",".*개굴 대리.*항상 npm test/);
    fs.rmSync(path.join(tmp, 'home', 'config.json'), { force: true });
    delete process.env.CLAUDE_BIN;
  }
});

test('보고·질문 파싱과 답장 연결', async () => {
  const { parseReport } = await import('../server/tasks.mjs');
  const r = parseReport('작업…\n## 보고\n했다.\n결과는 docs/.\n\n## 질문\n1. 한국어?\n2. 커밋?\n');
  assert.equal(r.report, '했다.\n결과는 docs/.');
  assert.equal(r.question, '1. 한국어?\n2. 커밋?');
  assert.deepEqual(parseReport('## 보고\n끝.'), { report: '끝.', question: '' });
  assert.deepEqual(parseReport('아무 형식 없음'), { report: '', question: '' });
  if (fs.existsSync(path.join(tmp, 'fake-claude.mjs'))) {
    process.env.CLAUDE_BIN = path.join(tmp, process.platform === 'win32' ? 'claude.cmd' : 'claude');
    const proj = path.join(tmp, 'proj'); fs.mkdirSync(proj, { recursive: true });
    const good = { 'Content-Type': 'application/json', 'X-Office-Admin': '1' };
    const a = JSON.parse((await req(port, '/api/admin/task', { method: 'POST', headers: good, body: JSON.stringify({ cwd: proj, task: 'q' }) })).body).task;
    const b = JSON.parse((await req(port, '/api/admin/task', { method: 'POST', headers: good, body: JSON.stringify({ cwd: proj, task: 'a', replyTo: a.id, continueSession: true }) })).body).task;
    assert.equal(b.replyTo, a.id); assert.ok(b.continueSession);
    const list = JSON.parse((await req(port, '/api/admin/tasks')).body).tasks;
    assert.equal(list.find((x) => x.id === a.id).answeredBy, b.id);
    delete process.env.CLAUDE_BIN;
  }
});
