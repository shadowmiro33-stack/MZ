"use strict";
// 관리자 모드 — GET /api/admin/config 로 설정을 읽어 폼에 펼치고, 저장하면 POST /api/admin/config 로 보낸다.
// 서버가 같은 규칙(server/config.mjs normalizeConfig)으로 검증해 config.json 에 쓴다. 글은 전부 textContent/value 로만 넣는다.
// 옛 설정의 homes·hide 는 읽을 때 명부 줄로 합쳐 보여 주고, 저장할 때는 명부(staff)로만 쓴다(서버는 둘 다 알아듣는다).

(() => {
  const $ = id => document.getElementById(id);
  const KINDS = ["auto", "pomesable", "pomebw", "pome", "shiba", "corgi", "maltese", "poodle", "frog", "capy"];       // server/config.mjs KINDS · web/office-world.js OFFICE_SPECIES 와 같게
  const DEFAULT_COLOR = "#2E86DE";
  // 새 팀의 기본 색 — 아직 안 쓴 것부터 차례로(사무실 캐릭터 색과 같은 계열)
  const PALETTE = ["#2E86DE", "#E74C3C", "#27AE60", "#8E44AD", "#E67E22", "#16A085", "#E84393", "#F1C40F", "#3742FA", "#8D6E63", "#00B8D4", "#7CB342"];
  const nextColor = () => PALETTE.find(c => !S.teams.some(t => t.color === c)) || PALETTE[S.teams.length % PALETTE.length];

  const TEXT = {
    ko: {
      back: "← 사무실", title: "관리자 모드", demo: "데모 서버", reset: "되돌리기", save: "저장", saving: "저장 중…",
      saved: "저장됨 — 사무실 화면에 3초 안에 반영됩니다", dirty: "저장하지 않은 변경이 있습니다", loading: "설정 읽는 중…",
      loadFail: "설정을 읽지 못했습니다 — 서버가 켜져 있나요?", saveFail: "저장하지 못했습니다", portNote: " · 포트를 바꿨으니 서버를 다시 켜 주세요",
      lead: "여기서 고친 내용은 설정 파일(~/.claude-office/config.json)에 저장되고, 사무실 화면에 3초 안에 반영됩니다. 터미널은 필요 없습니다.",
      office: "사무실", "office.title": "사무실 이름", "office.lang": "언어", "lang.auto": "자동",
      "office.layout": "사무실 지도", "layout.image": "그림 사무실 (팀 방 4개, 사진풍)", "layout.generated": "자동 생성 (팀 수대로 방, 일러스트풍)",
      "office.kid": "꼬마 기준 커밋 수", "office.kid.hint": "이보다 커밋이 적은 저장소는 꼬마 직원",
      "office.port": "포트", "office.port.hint": "바꾸면 서버를 다시 켜야 합니다",
      "office.auto": "Claude 세션이 시작될 때 서버가 꺼져 있으면 자동으로 켜기", "office.adv": "고급",
      "office.fallback": "훅 없는 세션 찾기(분)", "office.stale": "조용하면 퇴근(시간)",
      teams: "팀", "teams.hint": "팀마다 사무실에 방이 하나 생기고, 팀 색은 그 방과 직원의 모자·가디건 색이 됩니다", "teams.add": "+ 팀 추가", "teams.empty": "아직 팀이 없습니다",
      "teams.name": "팀 이름", "teams.n": "{n}명", "teams.del": "삭제",
      staff: "직원 명부", "staff.hint": "프로젝트 폴더 하나 = 직원 한 명. 폴더 이름(또는 전체 경로)으로 찾습니다",
      "staff.seen": "지금 사무실에 있는 프로젝트:", "staff.add": "+ 직원 추가", "staff.empty": "명부가 비어 있습니다 — 폴더 이름이 그대로 명찰이 됩니다",
      "col.key": "폴더", "col.path": "경로", "col.name": "표시 이름", "col.title": "직책", "col.team": "팀", "col.kind": "캐릭터",
      "col.home": "자리", "col.color": "색", "col.hidden": "숨김",
      "kind.auto": "자동(팀 대표 → 몽실이·별이)", "kind.pomesable": "몽실이(갈색 포메)", "kind.pomebw": "별이(흰 포메)", "kind.pome": "포메(주황)", "kind.shiba": "시바", "kind.corgi": "웰시코기", "kind.maltese": "말티즈", "kind.poodle": "푸들", "teams.kind": "팀 캐릭터", "kind.team": "자동(몽실이·별이)", "kind.frog": "개구리", "kind.capy": "카피바라", "home.desk": "책상", "home.server": "서버실",
      "team.none": "(없음)", "color.team": "팀 색", "color.own": "직접", json: "저장될 설정(JSON) 미리보기",
      "ph.key": "폴더 이름 또는 C:\\경로", "ph.name": "폴더 이름 그대로", "ph.title": "예: 프론트엔드",
      dup: "같은 폴더가 두 번 있습니다", confirmLeave: "저장하지 않은 변경이 있습니다. 나갈까요?",
      "ph.path": "C:\\work\\프로젝트",
      "tab.work": "업무", "tab.people": "직원·팀", "tab.office": "사무실 설정", "col.more": "더",
      "work.step1": "1. 누구에게?", "work.step1.hint": "사무실에 켜져 있는 프로젝트는 바로 고를 수 있습니다. 다른 폴더는 아래에 경로를 적으세요.",
      "work.step2": "2. 무슨 일을?", "work.other": "다른 폴더", "work.task.ph": "예: README 를 읽고 프로젝트 구조를 docs/STRUCTURE.md 에 정리해줘",
      "work.send": "업무 보내기", "work.list": "업무 목록", "work.live": "켜져 있음", "work.listed": "명부",
      "work.none": "사무실에 켜진 프로젝트가 없습니다 — 아래에 폴더 경로를 적거나, 직원·팀 탭에서 직원에게 경로를 적어 두세요",
      "work.sent": "보냈습니다 — 사무실 탭에서 캐릭터가 일하는 걸 보세요",
      "work.needWho": "먼저 직원을 고르거나 폴더 경로를 적으세요", "work.needTask": "업무 내용을 적으세요",
      "work.fail": "보내지 못했습니다", "work.empty": "아직 보낸 업무가 없습니다", "work.stop": "중지", "work.log": "출력 보기", "work.hide": "출력 닫기",
      "work.demo": "데모 서버에서는 업무를 보낼 수 없습니다 — 실제 서버(127.0.0.1:4777)에서 하세요",
      "work.noBin": "claude 실행 파일을 찾지 못했습니다 — Claude Code 가 설치돼 있고 PATH 에 있는지 확인하세요",
      "work.noDir": "그 폴더가 없습니다",
      "mode.acceptEdits": "파일만 고치기", "mode.acceptEdits.d": "코드를 읽고 고칩니다. 명령 실행(빌드·테스트·git)은 하지 않습니다 — 가장 안전",
      "mode.auto": "명령도 실행", "mode.auto.d": "빌드·테스트처럼 안전한 명령은 알아서 실행합니다(자동 모드)",
      "mode.plan": "계획만", "mode.plan.d": "파일을 건드리지 않고 무엇을 할지만 정리합니다",
      "mode.bypass": "전부 자동 승인", "mode.bypass.d": "모든 명령을 묻지 않고 실행 — 믿을 수 있는 폴더에서만",
      "st.running": "일하는 중", "st.done": "완료", "st.failed": "실패", "st.error": "오류",
    },
    en: {
      back: "← Office", title: "Admin mode", demo: "Demo server", reset: "Revert", save: "Save", saving: "Saving…",
      saved: "Saved — the office picks it up within 3 seconds", dirty: "Unsaved changes", loading: "Loading settings…",
      loadFail: "Couldn't load settings — is the server running?", saveFail: "Couldn't save", portNote: " · you changed the port: restart the server",
      lead: "Changes here are written to ~/.claude-office/config.json and the office picks them up within 3 seconds. No terminal needed.",
      office: "Office", "office.title": "Office name", "office.lang": "Language", "lang.auto": "Auto",
      "office.layout": "Office map", "layout.image": "Picture office (4 team rooms, photo style)", "layout.generated": "Generated (a room per team, illustration style)",
      "office.kid": "Junior threshold (commits)", "office.kid.hint": "Repos with fewer commits appear as juniors",
      "office.port": "Port", "office.port.hint": "Changing it requires a server restart",
      "office.auto": "Start the server automatically when a Claude session starts", "office.adv": "Advanced",
      "office.fallback": "Find hook-less sessions (minutes)", "office.stale": "Clock out after quiet (hours)",
      teams: "Teams", "teams.hint": "Each team gets its own room; the team color tints the room and its members' hats and cardigans", "teams.add": "+ Add team", "teams.empty": "No teams yet",
      "teams.name": "Team name", "teams.n": "{n}", "teams.del": "Delete",
      staff: "Staff", "staff.hint": "One project folder = one employee. Matched by folder name (or full path)",
      "staff.seen": "In the office right now:", "staff.add": "+ Add employee", "staff.empty": "Nobody listed yet — folder names are used as name tags",
      "col.key": "Folder", "col.path": "Path", "col.name": "Display name", "col.title": "Title", "col.team": "Team", "col.kind": "Character",
      "col.home": "Seat", "col.color": "Color", "col.hidden": "Hide",
      "kind.auto": "Auto (team → Mongsil/Byeol)", "kind.pomesable": "Mongsil (sable pom)", "kind.pomebw": "Byeol (white pom)", "kind.pome": "Pom (orange)", "kind.shiba": "Shiba", "kind.corgi": "Corgi", "kind.maltese": "Maltese", "kind.poodle": "Poodle", "teams.kind": "Team character", "kind.team": "Auto (Mongsil/Byeol)", "kind.frog": "Frog", "kind.capy": "Capybara", "home.desk": "Desk", "home.server": "Server room",
      "team.none": "(none)", "color.team": "Team", "color.own": "Custom", json: "Preview of the config that will be saved (JSON)",
      "ph.key": "folder name or full path", "ph.name": "same as folder", "ph.title": "e.g. Frontend",
      dup: "This folder appears twice", confirmLeave: "You have unsaved changes. Leave anyway?",
      "ph.path": "/abs/path/to/project",
      "tab.work": "Work", "tab.people": "People & teams", "tab.office": "Office settings", "col.more": "More",
      "work.step1": "1. Who?", "work.step1.hint": "Projects currently open in the office can be picked directly. For another folder, type its path below.",
      "work.step2": "2. What?", "work.other": "Other folder", "work.task.ph": "e.g. Read README and write the project structure to docs/STRUCTURE.md",
      "work.send": "Send task", "work.list": "Tasks", "work.live": "online", "work.listed": "listed",
      "work.none": "No project is open in the office — type a folder path below, or give an employee a path in People & teams",
      "work.sent": "Sent — watch the character work in the office tab",
      "work.needWho": "Pick an employee or type a folder path first", "work.needTask": "Write the task",
      "work.fail": "Could not send", "work.empty": "No tasks yet", "work.stop": "Stop", "work.log": "Show output", "work.hide": "Hide output",
      "work.demo": "The demo server cannot run tasks — use the real server (127.0.0.1:4777)",
      "work.noBin": "Could not find the claude executable — check that Claude Code is installed and on PATH",
      "work.noDir": "That folder does not exist",
      "mode.acceptEdits": "Edit files only", "mode.acceptEdits.d": "Reads and edits code. No commands (build, test, git) — safest",
      "mode.auto": "Also run commands", "mode.auto.d": "Runs safe commands like builds and tests on its own (auto mode)",
      "mode.plan": "Plan only", "mode.plan.d": "Touches nothing; writes up what it would do",
      "mode.bypass": "Approve everything", "mode.bypass.d": "Runs every command without asking — only in folders you trust",
      "st.running": "Working", "st.done": "Done", "st.failed": "Failed", "st.error": "Error",
    },
  };
  const lang = () => (I18N.lang === "ko" ? "ko" : "en");
  const t = (k, v) => String(TEXT[lang()][k] ?? TEXT.ko[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => (v && v[n] != null ? v[n] : ""));

  // ---------- 상태 ----------
  const S = { loaded: null, cfg: null, teams: [], staff: [], seen: [], dirty: false, saving: false };
  let seq = 0;
  const uid = () => `r${++seq}`;

  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function status(msg, cls) { const s = $("a-status"); s.textContent = msg || ""; s.className = "a-status" + (cls ? " " + cls : ""); }
  function markDirty() { if (!S.dirty) { S.dirty = true; status(t("dirty"), "dirty"); } preview(); }

  // ---------- 설정 ↔ 폼 모양 ----------
  // 서버 설정 → 편집용 줄 목록. homes·hide 는 명부 줄로 합친다.
  function fromConfig(cfg) {
    S.cfg = cfg;
    S.teams = Object.entries(cfg.teams || {}).map(([name, v]) => ({ id: uid(), name, color: (v && v.color) || "", kind: (v && v.kind) || "" }));
    S.staff = Object.entries(cfg.staff || {}).map(([key, v]) => ({
      id: uid(), key, name: v.name || "", title: v.title || "", team: v.team || "", kind: v.kind || "auto",
      home: v.home === "server" ? "server" : "desk", color: v.color || "", hidden: !!v.hidden, path: v.path || "",
    }));
    const find = key => S.staff.find(r => r.key === key);
    for (const [k, v] of Object.entries(cfg.homes || {})) {
      if (v !== "server") continue;
      const r = find(k);
      if (r) r.home = "server";
      else S.staff.push({ id: uid(), key: k, name: "", title: "", team: "", kind: "auto", home: "server", color: "", hidden: false, path: "" });
    }
    for (const k of cfg.hide || []) {
      const r = find(k);
      if (r) r.hidden = true;
      else S.staff.push({ id: uid(), key: k, name: "", title: "", team: "", kind: "auto", home: "desk", color: "", hidden: true, path: "" });
    }
    $("f-title").value = cfg.title || "";
    $("f-lang").value = cfg.lang || "auto";
    $("f-layout").value = cfg.layout === "generated" ? "generated" : "image";
    $("f-kid").value = cfg.kidCommits;
    $("f-port").value = cfg.port;
    $("f-auto").checked = cfg.autoStart !== false;
    $("f-fallback").value = cfg.fallbackMinutes;
    $("f-stale").value = cfg.staleHours;
  }
  // 폼 → 서버에 보낼 설정
  function toConfig() {
    const num = (v, def) => { const n = Number(v); return Number.isFinite(n) ? n : def; };
    const teams = {};
    for (const r of S.teams) {
      const name = r.name.trim();
      if (!name) continue;
      teams[name] = r.color ? { color: r.color } : {};
      if (r.kind) teams[name].kind = r.kind;
    }
    const staff = {};
    for (const r of S.staff) {
      const key = r.key.trim();
      if (!key) continue;
      const s = {};
      if (r.name.trim()) s.name = r.name.trim();
      if (r.title.trim()) s.title = r.title.trim();
      if (r.team && Object.hasOwn(teams, r.team)) s.team = r.team;
      if (r.kind !== "auto") s.kind = r.kind;
      if (r.home === "server") s.home = "server";
      if (r.color) s.color = r.color;
      if (r.hidden) s.hidden = true;
      if (r.path.trim()) s.path = r.path.trim();
      staff[key] = s;
    }
    return {
      port: Math.round(num($("f-port").value, S.cfg.port)),
      autoStart: $("f-auto").checked,
      title: $("f-title").value.trim(),
      homes: {}, hide: [],                 // 전부 명부로 옮겼다
      teams, staff,
      fallbackMinutes: num($("f-fallback").value, S.cfg.fallbackMinutes),
      staleHours: num($("f-stale").value, S.cfg.staleHours),
      kidCommits: Math.round(num($("f-kid").value, S.cfg.kidCommits)),
      lang: $("f-lang").value,
      layout: $("f-layout").value,
    };
  }
  function preview() { $("preview").textContent = JSON.stringify(toConfig(), null, 2); }

  // ---------- 팀 ----------
  function renderTeams() {
    const box = $("teams");
    box.replaceChildren();
    if (!S.teams.length) box.append(el("p", "a-empty", t("teams.empty")));
    for (const r of S.teams) {
      const row = el("div", "a-row");
      const name = el("input"); name.type = "text"; name.maxLength = 24; name.placeholder = t("teams.name"); name.value = r.name;
      // 팀 이름을 고치면 그 팀 직원도 따라간다 — 빈 이름(방금 만든 팀)은 아무도 속하지 않으므로 건너뛴다
      name.oninput = () => { const old = r.name; r.name = name.value; if (old) for (const s of S.staff) if (s.team === old) s.team = r.name; markDirty(); renderStaff(); };
      const color = el("input"); color.type = "color"; color.value = r.color || DEFAULT_COLOR; color.title = t("col.color");
      color.oninput = () => { r.color = color.value.toUpperCase(); markDirty(); renderStaff(); };
      const kind = select([["", t("kind.team")], ...KINDS.slice(1).map(k => [k, t("kind." + k)])], r.kind, v => { r.kind = v; markDirty(); });
      kind.title = t("teams.kind");
      const n = el("span", "a-count", t("teams.n", { n: S.staff.filter(s => s.team === r.name).length }));
      const del = el("button", "a-btn danger", t("teams.del")); del.type = "button";
      del.onclick = () => { S.teams = S.teams.filter(x => x !== r); for (const s of S.staff) if (s.team === r.name) s.team = ""; markDirty(); renderTeams(); renderStaff(); };
      row.append(name, color, kind, n, del);
      box.append(row);
    }
  }
  $("team-add").onclick = () => { S.teams.push({ id: uid(), name: "", color: nextColor(), kind: "" }); markDirty(); renderTeams(); $("teams").querySelector(".a-row:last-child input")?.focus(); };

  // ---------- 직원 명부 ----------
  const keyOf = k => (navigator.platform.startsWith("Win") ? k.trim().toLowerCase() : k.trim());
  function renderSeen() {
    const box = $("seen-box"), list = $("seen");
    list.replaceChildren();
    box.hidden = !S.seen.length;
    const have = new Set(S.staff.map(r => keyOf(r.key)));
    for (const p of S.seen) {
      const b = el("button", null, p.folder); b.type = "button"; b.title = p.path || "";
      const key = p.folder;
      if (have.has(keyOf(key)) || (p.path && have.has(keyOf(p.path)))) b.classList.add("in");
      else b.onclick = () => { addStaff({ key, path: p.path || "" }); };
      list.append(b);
    }
  }
  function addStaff(init = {}) {
    S.staff.push({ id: uid(), key: "", name: "", title: "", team: "", kind: "auto", home: "desk", color: "", hidden: false, path: "", ...init });
    markDirty(); renderStaff();
    const last = $("staff").querySelector("tbody tr:last-child");
    (last?.querySelector(init.key ? "td.name input" : "td.key input"))?.focus();
  }
  function select(opts, value, onchange) {
    const s = el("select");
    for (const [v, label] of opts) { const o = el("option", null, label); o.value = v; s.append(o); }
    s.value = value;
    s.onchange = () => onchange(s.value);
    return s;
  }
  function renderStaff() {
    const body = $("staff").querySelector("tbody");
    body.replaceChildren();
    const counts = new Map();
    for (const r of S.staff) if (r.key.trim()) counts.set(keyOf(r.key), (counts.get(keyOf(r.key)) || 0) + 1);
    if (!S.staff.length) {
      const tr = el("tr"); const td = el("td", "a-empty", t("staff.empty")); td.colSpan = 8; tr.append(td); body.append(tr);
    }
    for (const r of S.staff) {
      const tr = el("tr", (r.hidden ? "hidden-row" : "") + (counts.get(keyOf(r.key)) > 1 ? " dup" : ""));
      const text = (cls, prop, ph, max = 24) => {
        const td = el("td", cls), i = el("input"); i.type = "text"; i.maxLength = max; i.placeholder = ph; i.value = r[prop];
        if (cls === "key" && counts.get(keyOf(r.key)) > 1) i.title = t("dup");
        i.oninput = () => { r[prop] = i.value; markDirty(); if (cls === "key") { renderSeen(); } };
        i.onblur = () => { if (cls === "key") renderStaff(); };
        td.append(i); return td;
      };
      tr.append(text("key", "key", t("ph.key"), 512), text("name", "name", t("ph.name")), text("title", "title", t("ph.title")));
      const teamTd = el("td");
      teamTd.append(select([["", t("team.none")], ...S.teams.filter(x => x.name.trim()).map(x => [x.name, x.name])], r.team, v => { r.team = v; markDirty(); renderTeams(); renderStaff(); }));
      tr.append(teamTd);
      const kindTd = el("td");
      kindTd.append(select(KINDS.map(k => [k, t("kind." + k)]), r.kind, v => { r.kind = v; markDirty(); }));
      tr.append(kindTd);
      tr.append(text("path", "path", t("ph.path"), 512));
      // 더: 자리·색·숨김 — 한 칸에 작게
      const moreTd = el("td", "more");
      moreTd.append(select([["desk", t("home.desk")], ["server", t("home.server")]], r.home, v => { r.home = v; markDirty(); }));
      const teamColor = S.teams.find(x => x.name === r.team)?.color || "";
      const cSel = select([["", teamColor ? t("color.team") : t("kind.auto")], ["own", t("color.own")]], r.color ? "own" : "", v => {
        r.color = v === "own" ? (teamColor || DEFAULT_COLOR) : ""; markDirty(); renderStaff();
      });
      moreTd.append(cSel);
      if (r.color) { const c = el("input"); c.type = "color"; c.value = r.color; c.oninput = () => { r.color = c.value.toUpperCase(); markDirty(); }; moreTd.append(c); }
      const hl = el("label", "a-check-sm"); const h = el("input"); h.type = "checkbox"; h.checked = r.hidden;
      h.onchange = () => { r.hidden = h.checked; markDirty(); renderStaff(); };
      hl.append(h, el("span", null, t("col.hidden"))); moreTd.append(hl);
      tr.append(moreTd);
      const xTd = el("td", "c"); const x = el("button", "x", "×"); x.type = "button"; x.title = t("teams.del");
      x.onclick = () => { S.staff = S.staff.filter(y => y !== r); markDirty(); renderStaff(); renderTeams(); };
      xTd.append(x); tr.append(xTd);
      body.append(tr);
    }
    renderSeen();
  }
  $("staff-add").onclick = () => addStaff();

  // ---------- 읽기·저장 ----------
  async function load() {
    status(t("loading"));
    try {
      const res = await fetch("/api/admin/config", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const body = await res.json();
      S.loaded = body.config;
      S.seen = Array.isArray(body.seen) ? body.seen : [];
      $("a-demo").hidden = !body.demo;
      W.demo = !!body.demo;
      fromConfig(body.config);
      S.dirty = false;
      renderTeams(); renderStaff(); preview();
      renderPeople(); loadTasks();
      status("");
    } catch {
      status(t("loadFail"), "err");
    }
  }
  async function save() {
    if (S.saving) return;
    S.saving = true; $("a-save").disabled = true; status(t("saving"));
    const cfg = toConfig();
    const portChanged = S.loaded && cfg.port !== S.loaded.port;
    try {
      const res = await fetch("/api/admin/config", {
        method: "POST", cache: "no-store",
        headers: { "Content-Type": "application/json", "X-Office-Admin": "1" },
        body: JSON.stringify(cfg),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body.error || String(res.status));
      S.loaded = body.config;
      fromConfig(body.config);               // 서버가 닫은 값(잘린 이름 등)으로 다시 그린다
      S.dirty = false;
      renderTeams(); renderStaff(); preview(); renderPeople();
      status(t("saved") + (portChanged ? t("portNote") : ""), "ok");
    } catch (e) {
      status(`${t("saveFail")} — ${e.message}`, "err");
    } finally {
      S.saving = false; $("a-save").disabled = false;
    }
  }
  // ---------- 업무 지시 ----------
  // 고를 수 있는 사람 = 사무실에 켜진 프로젝트(경로를 안다) + 명부에서 경로를 적어 둔 직원. 둘 다 없으면 직접 폴더 경로.
  const W = { tasks: [], open: new Set(), timer: 0, demo: false, pick: null };
  function candidates() {
    const out = [];
    for (const p of S.seen) {
      if (!p.path) continue;
      const r = S.staff.find(x => keyOf(x.key) === keyOf(p.folder) || (x.path && x.path.trim() === p.path));
      out.push({ id: "seen:" + p.path, name: r?.name.trim() || p.name, folder: p.folder, path: p.path, live: true,
                 team: r?.team || "", color: S.teams.find(x => x.name === r?.team)?.color || "" });
    }
    for (const r of S.staff) {
      if (!r.path.trim() || !r.key.trim() || out.some(o => o.path === r.path.trim())) continue;
      out.push({ id: "staff:" + r.key, name: r.name.trim() || r.key, folder: r.key, path: r.path.trim(), live: false,
                 team: r.team, color: S.teams.find(x => x.name === r.team)?.color || "" });
    }
    return out;
  }
  function renderPeople() {
    const box = $("w-people");
    box.replaceChildren();
    const list = candidates();
    if (!list.length) { box.append(el("p", "a-empty", t("work.none"))); W.pick = null; return; }
    if (!W.pick || !list.some(c => c.id === W.pick)) W.pick = list[0].id;
    for (const c of list) {
      const b = el("button", "a-person" + (c.id === W.pick ? " on" : "")); b.type = "button";
      const dot = el("i", "o-dot"); dot.style.background = c.color || "#9AA5B1";
      const name = el("b", null, c.name);
      const meta = el("small", null, [c.team, c.live ? t("work.live") : t("work.listed")].filter(Boolean).join(" · "));
      const pth = el("span", "a-mono", c.path);
      b.append(dot, name, meta, pth);
      b.title = c.path;
      b.onclick = () => { W.pick = c.id; $("w-cwd").value = ""; renderPeople(); };
      box.append(b);
    }
  }
  $("w-cwd").addEventListener("input", () => { if ($("w-cwd").value.trim()) { W.pick = null; renderPeople(); } });
  function picked() {
    const typed = $("w-cwd").value.trim();
    if (typed) return { who: typed.split(/[\\/]/).filter(Boolean).pop() || typed, cwd: typed };
    const c = candidates().find(x => x.id === W.pick);
    return c ? { who: c.name, cwd: c.path, key: c.folder } : null;
  }
  async function sendWork() {
    const who = picked(), task = $("w-task").value.trim();
    if (!who) return wstatus(t("work.needWho"), "err");
    if (!task) { wstatus(t("work.needTask"), "err"); $("w-task").focus(); return; }
    if (W.demo) return wstatus(t("work.demo"), "err");
    const mode = document.querySelector("input[name=w-mode]:checked")?.value || "acceptEdits";
    $("w-send").disabled = true; wstatus("…");
    try {
      const res = await fetch("/api/admin/task", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json", "X-Office-Admin": "1" },
        body: JSON.stringify({ who: who.who, cwd: who.cwd, key: who.key || "", task, mode }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body.error || String(res.status));
      $("w-task").value = "";
      wstatus(t("work.sent"), "ok");
      W.open.add(body.task.id);
      await loadTasks();
      $("w-tasks").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      const m = String(e.message || "");
      wstatus(`${t("work.fail")} — ${/folder not found/.test(m) ? t("work.noDir") + ": " + who.cwd : m}`, "err");
    } finally {
      $("w-send").disabled = false;
    }
  }
  function wstatus(msg, cls) { const s = $("w-status"); s.textContent = msg || ""; s.className = "a-status" + (cls ? " " + cls : ""); }
  async function loadTasks() {
    try {
      const res = await fetch("/api/admin/tasks", { cache: "no-store" });
      if (!res.ok) return;
      W.tasks = (await res.json()).tasks || [];
      renderTasks();
    } catch { /* 다음 번에 */ }
    clearTimeout(W.timer);
    if (W.tasks.some(x => x.status === "running")) W.timer = setTimeout(loadTasks, 3000);
  }
  function renderTasks() {
    const box = $("w-tasks");
    box.replaceChildren();
    const running = W.tasks.filter(x => x.status === "running").length;
    $("w-count").textContent = W.tasks.length ? `${W.tasks.length}` + (running ? ` · ${t("st.running")} ${running}` : "") : "";
    if (!W.tasks.length) { box.append(el("li", "a-empty", t("work.empty"))); return; }
    for (const x of W.tasks) {
      const li = el("li", "a-task " + x.status);
      const h = el("div", "h");
      h.append(el("span", `a-chip ${x.status}`, t("st." + x.status)), el("b", null, x.who), el("time", null, x.startedAt.replace("T", " ").slice(5, 16)));
      const open = W.open.has(x.id) || x.status === "running";
      const toggle = el("button", "a-btn", open ? t("work.hide") : t("work.log")); toggle.type = "button";
      toggle.onclick = () => { if (open) { W.open.delete(x.id); if (x.status === "running") W.open.add("!" + x.id); } else { W.open.add(x.id); W.open.delete("!" + x.id); } renderTasks(); };
      h.append(toggle);
      if (x.status === "running") {
        const stop = el("button", "a-btn danger x", t("work.stop")); stop.type = "button";
        stop.onclick = async () => { await fetch("/api/admin/task/stop", { method: "POST", headers: { "Content-Type": "application/json", "X-Office-Admin": "1" }, body: JSON.stringify({ id: x.id }) }); loadTasks(); };
        h.append(stop);
      }
      li.append(h, el("p", "t", x.task.length > 300 ? x.task.slice(0, 300) + "…" : x.task));
      const show = open && !W.open.has("!" + x.id);
      if (show) {
        const err = x.error ? `[error] ${/ENOENT/.test(x.error) ? t("work.noBin") + " (" + x.bin + ")" : x.error}\n` : "";
        li.append(el("pre", null, err + (x.log || "") + (x.status === "running" ? "\n…" : "")));
      }
      box.append(li);
    }
  }
  $("w-send").onclick = sendWork;
  $("w-task").addEventListener("keydown", e => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") sendWork(); });

  // ---------- 탭 ----------
  function showTab(name) {
    for (const b of document.querySelectorAll("#tabs button")) b.classList.toggle("on", b.dataset.tab === name);
    for (const sec of document.querySelectorAll(".a-tab")) sec.hidden = sec.dataset.tab !== name;
    $("a-save-box").hidden = name === "work";
    try { localStorage.setItem("office.admin.tab", name); } catch { /* 무시 */ }
    if (name === "work") { renderPeople(); loadTasks(); }
  }
  for (const b of document.querySelectorAll("#tabs button")) b.onclick = () => showTab(b.dataset.tab);

  $("a-save").onclick = save;
  $("a-reset").onclick = () => { if (S.loaded) { fromConfig(S.loaded); S.dirty = false; renderTeams(); renderStaff(); preview(); status(""); } };
  for (const id of ["f-title", "f-lang", "f-layout", "f-kid", "f-port", "f-auto", "f-fallback", "f-stale"]) $(id).addEventListener("input", markDirty);
  window.addEventListener("beforeunload", e => { if (S.dirty) { e.preventDefault(); e.returnValue = ""; } });
  document.addEventListener("keydown", e => { if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); save(); } });

  // ---------- 고정 문구 ----------
  function applyText() {
    for (const e of document.querySelectorAll("[data-t]")) e.textContent = t(e.dataset.t);
    for (const e of document.querySelectorAll("[data-t-ph]")) e.placeholder = t(e.dataset.tPh);
    document.title = `${t("title")} — ${I18N.t("title")}`;
    document.documentElement.lang = lang();
  }

  (async () => {
    await I18N.init();
    applyText();
    let tab = "work";
    try { tab = localStorage.getItem("office.admin.tab") || "work"; } catch { /* 무시 */ }
    showTab(["work", "people", "office"].includes(tab) ? tab : "work");
    await load();
  })();
})();
