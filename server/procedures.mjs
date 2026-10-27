// 업무 절차(SOP) — 프로젝트 폴더의 .claude/procedures/<slug>.md (+ <slug>/NN.png 스크린샷) 로 저장한다.
// Claude Code 가 그 폴더에서 일할 때 절차서를 읽고 따라 한다. 편집용 원본은 같은 자리의 <slug>.json.
import fs from 'node:fs';
import path from 'node:path';

export const PROC_DIR = path.join('.claude', 'procedures');
export const MAX_STEPS = 60;
export const MAX_IMAGE = 8 * 1024 * 1024; // 스크린샷 한 장 상한(디코딩 후)

const text = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max) : '');

/** 절차 이름 → 파일 이름. 한글·영숫자·-_ 만 남긴다 */
export function slugOf(name) {
  const s = text(name, 60).replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '-').replace(/^\.+/, '');
  return s || 'procedure';
}
const dirOf = (cwd) => path.join(cwd, PROC_DIR);
const okCwd = (cwd) => typeof cwd === 'string' && cwd && path.isAbsolute(cwd) && fs.existsSync(cwd) && fs.statSync(cwd).isDirectory();
const okSlug = (slug) => typeof slug === 'string' && /^[^\\/:*?"<>|]{1,80}$/.test(slug) && !slug.startsWith('.');

/** 절차 목록 — [{ slug, name, steps, updatedAt }] */
export function listProcedures(cwd) {
  if (!okCwd(cwd)) return [];
  let files = [];
  try {
    files = fs.readdirSync(dirOf(cwd)).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  return files.map((f) => {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(dirOf(cwd), f), 'utf8'));
      return { slug: f.slice(0, -5), name: j.name || f.slice(0, -5), steps: Array.isArray(j.steps) ? j.steps.length : 0, updatedAt: j.updatedAt || '' };
    } catch {
      return null;
    }
  }).filter(Boolean).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

/** 절차 하나(편집용) — 이미지는 파일 이름만 돌려주고, 화면이 /api/admin/procedure/image 로 받아 간다 */
export function readProcedure(cwd, slug) {
  if (!okCwd(cwd) || !okSlug(slug)) return null;
  try {
    const j = JSON.parse(fs.readFileSync(path.join(dirOf(cwd), `${slug}.json`), 'utf8'));
    return { slug, name: j.name || slug, memo: j.memo || '', steps: (j.steps || []).map((s) => ({ text: s.text || '', image: s.image || '' })), updatedAt: j.updatedAt || '' };
  } catch {
    return null;
  }
}

export function imagePath(cwd, slug, file) {
  if (!okCwd(cwd) || !okSlug(slug) || !/^\d{2}\.(png|jpe?g|webp)$/.test(String(file))) return null;
  const p = path.join(dirOf(cwd), slug, file);
  return fs.existsSync(p) ? p : null;
}

/** 저장 — steps[].image 는 data:image/...;base64 (새 그림) 또는 기존 파일 이름(그대로) 또는 '' */
export function saveProcedure(cwd, { slug, name, memo, steps }) {
  if (!okCwd(cwd)) throw new Error('폴더가 없습니다 / folder not found: ' + cwd);
  const nm = text(name, 60);
  if (!nm) throw new Error('절차 이름이 비었습니다 / empty name');
  const sl = okSlug(slug) ? slug : slugOf(nm);
  if (!Array.isArray(steps) || !steps.length) throw new Error('단계가 없습니다 / no steps');
  if (steps.length > MAX_STEPS) throw new Error(`단계가 너무 많습니다(최대 ${MAX_STEPS}) / too many steps`);
  const dir = dirOf(cwd), imgDir = path.join(dir, sl);
  fs.mkdirSync(imgDir, { recursive: true });
  const kept = new Set();
  const out = steps.map((s, i) => {
    const n = String(i + 1).padStart(2, '0');
    let image = '';
    const img = typeof s.image === 'string' ? s.image : '';
    const m = img.match(/^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (m) {
      const buf = Buffer.from(m[2], 'base64');
      if (buf.length > MAX_IMAGE) throw new Error(`스크린샷이 너무 큽니다(단계 ${i + 1}) / image too large`);
      image = `${n}.${m[1] === 'jpg' ? 'jpeg' : m[1]}`;
      fs.writeFileSync(path.join(imgDir, image), buf);
    } else if (/^\d{2}\.(png|jpe?g|webp)$/.test(img) && fs.existsSync(path.join(imgDir, img))) {
      image = img;
      if (!img.startsWith(n)) {                        // 순서가 바뀌었다 — 번호를 맞춰 다시 이름 짓는다
        const to = `${n}.${img.split('.').pop()}`;
        fs.copyFileSync(path.join(imgDir, img), path.join(imgDir, `tmp-${to}`));
        image = `tmp-${to}`;
      }
    }
    return { text: text(s.text, 2000), image };
  });
  for (const s of out) {                               // tmp- 이름을 제자리로
    if (s.image.startsWith('tmp-')) {
      const to = s.image.slice(4);
      fs.renameSync(path.join(imgDir, s.image), path.join(imgDir, to));
      s.image = to;
    }
    if (s.image) kept.add(s.image);
  }
  for (const f of fs.readdirSync(imgDir)) if (!kept.has(f)) fs.rmSync(path.join(imgDir, f), { force: true });   // 안 쓰는 그림 정리
  const rec = { name: nm, memo: text(memo, 4000), steps: out, updatedAt: new Date().toISOString() };
  fs.writeFileSync(path.join(dir, `${sl}.json`), JSON.stringify(rec, null, 2));
  fs.writeFileSync(path.join(dir, `${sl}.md`), toMarkdown(sl, rec));
  return { slug: sl, ...rec };
}

export function deleteProcedure(cwd, slug) {
  if (!okCwd(cwd) || !okSlug(slug)) return false;
  const dir = dirOf(cwd);
  let any = false;
  for (const f of [`${slug}.json`, `${slug}.md`]) {
    const p = path.join(dir, f);
    if (fs.existsSync(p)) { fs.rmSync(p, { force: true }); any = true; }
  }
  fs.rmSync(path.join(dir, slug), { recursive: true, force: true });
  return any;
}

/** Claude 가 읽는 절차서 */
export function toMarkdown(slug, rec) {
  const lines = [`# 업무 절차: ${rec.name}`, ''];
  if (rec.memo) lines.push(rec.memo, '');
  lines.push('이 절차서는 사람이 하던 일을 단계별로 적은 것이다. 순서대로 수행하고, 스크린샷이 있으면 그 화면을 참고한다.',
    '어떤 단계를 할 수 없으면(프로그램이 없음, 권한 없음 등) 거기서 멈추고 무엇이 막혔는지 보고한다.', '', '## 단계', '');
  rec.steps.forEach((s, i) => {
    lines.push(`${i + 1}. ${s.text || '(설명 없음)'}`);
    if (s.image) lines.push(`   ![단계 ${i + 1}](${slug}/${s.image})`);
    lines.push('');
  });
  lines.push('## 끝났을 때', '', '- 무엇을 했고 결과가 어디에 있는지 한국어로 짧게 정리한다.', '- 절차서와 실제가 달랐던 점이 있으면 적는다.', '');
  return lines.join('\n');
}

/** 업무에 붙일 머리말 — 절차서 경로를 알려 준다 */
export function procedurePrompt(slug) {
  return `먼저 이 폴더의 ${PROC_DIR}/${slug}.md 절차서를 읽어라(스크린샷은 같은 폴더 ${slug}/ 안에 있다). 그 절차대로 수행하라.`;
}
