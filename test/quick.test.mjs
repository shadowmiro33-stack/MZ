import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'office-quick-'));
process.env.CLAUDE_OFFICE_HOME = home;
const { normalizeQuick, saveQuick, listQuick } = await import('../server/quick.mjs');

test('normalizeQuick — 이름·내용 없는 것은 버리고, 모드·절차서는 검사, id 는 채운다', () => {
  const out = normalizeQuick({ quick: [
    { name: '매거진 발행', task: '매거진 자동 발행', mode: 'auto', cont: false },
    { name: '절차만', procedure: 'publish-mag' },
    { name: '', task: 'x' }, { name: '빈 것' }, { name: '나쁜 모드', task: 't', mode: 'root', procedure: 'Bad Slug!' },
  ] });
  assert.equal(out.length, 3);
  assert.equal(out[0].mode, 'auto'); assert.equal(out[0].cont, false); assert.match(out[0].id, /^[a-z0-9]{4,20}$/);
  assert.equal(out[1].procedure, 'publish-mag'); assert.equal(out[1].task, '');
  assert.equal(out[2].mode, 'acceptEdits'); assert.equal(out[2].procedure, '');
});

test('saveQuick/listQuick — quick.json 에 저장되고 다시 읽힌다, 30개 상한', () => {
  const many = Array.from({ length: 40 }, (_, i) => ({ name: 'q' + i, task: 't' + i }));
  const saved = saveQuick({ quick: many });
  assert.equal(saved.length, 30);
  assert.deepEqual(listQuick().map((q) => q.name).slice(0, 2), ['q0', 'q1']);
  assert.ok(fs.existsSync(path.join(home, 'quick.json')));
});
