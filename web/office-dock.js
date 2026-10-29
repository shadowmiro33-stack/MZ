"use strict";
// 업무 관제 독(dock) — 사무실 화면 오른쪽에 붙는 직원 대화창. 캐릭터를 누르면 열린다(관리자 페이지와 같은 API).
// 탭: 대화(업무 보내기·보고·질문·답하기) · 오늘(업무 일지·할 일·브리핑). 설정(명부·절차·반복)은 관리자 페이지.
// 글은 전부 textContent 로만 넣는다.

const OfficeDock = (() => {
  const $ = id => document.getElementById(id);
  const t = (k, v) => I18N.t(k, v);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const post = (url, body) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-Office-Admin": "1" }, body: JSON.stringify(body) });
  const samePath = (a, b) => String(a || "").replace(/[\\/]+$/, "").toLowerCase() === String(b || "").replace(/[\\/]+$/, "").toLowerCase();
  const local = iso => (iso && !Number.isNaN(Date.parse(iso)) ? new Date(iso).toLocaleString("sv").slice(5, 16) : "—");
  const D = { open: false, who: null, tab: "chat", tasks: [], showLog: new Set(), replyTo: "", timer: 0, procs: [], demo: false };

  // ---------- 열고 닫기 ----------
  function open(person, tab) {
    D.who = person ? { name: person.name, path: person.path, color: person.color || "#9AA5B1", team: person.team || "", title: person.title || "" } : D.who;
    if (tab) D.tab = tab;
    D.open = true; D.replyTo = "";
    $("dock").hidden = false;
    document.body.classList.add("dock-open");
    head(); tabs(); refresh();
  }
  function close() {
    D.open = false; $("dock").hidden = true; document.body.classList.remove("dock-open"); clearTimeout(D.timer);
  }
  function head() {
    const w = D.who;
    $("dock-dot").style.background = w ? w.color : "#9AA5B1";
    $("dock-name").textContent = w ? w.name : "—";
    $("dock-meta").textContent = w ? [w.title, w.team].filter(Boolean).join(" · ") : "";
    $("dock-path").textContent = w ? w.path : "";
  }
  function tabs() {
    for (const b of document.querySelectorAll("#dock-tabs button")) b.classList.toggle("on", b.dataset.tab === D.tab);
    $("dock-chat").hidden = D.tab !== "chat";
    $("dock-today").hidden = D.tab !== "today";
  }
  function refresh() {
    if (!D.open || !D.who) return;
    if (D.tab === "chat") { loadTasks(); loadProcs(); } else loadJournal();
  }

  // ---------- 대화 ----------
  async function loadTasks() {
    try {
      const r = await fetch("/api/admin/tasks", { cache: "no-store" });
      if (!r.ok) return;
      const before = D.tasks.filter(x => x.status === "running").length;
      D.tasks = (await r.json()).tasks || [];
      renderChat();
      if (D.tasks.filter(x => x.status === "running").length < before && D.tab === "today") loadJournal();
    } catch { /* 다음에 */ }
    clearTimeout(D.timer);
    if (D.open && D.tasks.some(x => x.status === "running")) D.timer = setTimeout(loadTasks, 3000);
  }
  async function loadProcs() {
    const sel = $("dock-proc");
    const cur = sel.value;
    sel.replaceChildren(Object.assign(el("option", null, t("dock.proc.none")), { value: "" }));
    try {
      const r = await fetch("/api/admin/procedures?cwd=" + encodeURIComponent(D.who.path), { cache: "no-store" });
      for (const p of (await r.json()).procedures || []) { const o = el("option", null, `📋 ${p.name}`); o.value = p.slug; sel.append(o); }
      sel.value = [...sel.options].some(o => o.value === cur) ? cur : "";
    } catch { /* 없음 */ }
  }
  function renderChat() {
    const box = $("dock-msgs");
    box.replaceChildren();
    const mine = D.tasks.filter(x => samePath(x.cwd, D.who.path)).sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1));
    if (!mine.length) { box.append(el("li", "d-empty", t("dock.empty"))); return; }
    for (const x of mine) {
      const me = el("li", "d-msg me");
      const text = x.task.replace(/^먼저 이 폴더의 \.claude\/procedures\/(.+?)\.md 절차서를 읽어라[^\n]*\n*/, "📋 $1\n").trim();
      me.append(el("div", "b", text.length > 500 ? text.slice(0, 500) + "…" : text));
      me.append(el("div", "m", local(x.startedAt) + (x.schedule ? " · ⏰" : "") + (x.replyTo ? " · ↩" : "")));
      box.append(me);
      const them = el("li", "d-msg them" + (x.question && !x.answeredBy ? " q" : "") + (x.status === "failed" || x.status === "error" ? " fail" : ""));
      let body = "";
      if (x.status === "running") body = t("dock.working");
      else if (x.question) body = (x.report ? x.report + "\n\n" : "") + x.question;
      else if (x.report) body = x.report;
      else if (x.status === "error") body = `[error] ${x.error || ""}`;
      else body = (x.log || "").trim().split("\n").slice(-6).join("\n") || t("dock.noReport");
      const bb = el("div", "b", body);
      if (x.status === "running") bb.classList.add("typing");
      them.append(bb);
      const m = el("div", "m");
      m.append(el("span", `d-chip ${x.status}`, t("st." + x.status)));
      if (x.question && x.answeredBy) m.append(el("span", null, "✓ " + t("dock.answered")));
      if (x.question && !x.answeredBy && x.status !== "running") { const r = el("button", null, t("dock.reply")); r.onclick = () => { D.replyTo = x.id; $("dock-input").placeholder = "↩ " + t("dock.reply"); $("dock-input").focus(); }; m.append(r); }
      const lg = el("button", null, D.showLog.has(x.id) ? t("dock.hide") : t("dock.log")); lg.onclick = () => { if (D.showLog.has(x.id)) D.showLog.delete(x.id); else D.showLog.add(x.id); renderChat(); }; m.append(lg);
      if (x.status === "running") { const s = el("button", null, t("dock.stop")); s.onclick = async () => { await post("/api/admin/task/stop", { id: x.id }); loadTasks(); }; m.append(s); }
      them.append(m);
      if (D.showLog.has(x.id)) them.append(el("pre", null, (x.log || "") + (x.status === "running" ? "\n…" : "")));
      box.append(them);
    }
    box.scrollTop = box.scrollHeight;
  }
  async function send() {
    const task = $("dock-input").value.trim();
    const procedure = $("dock-proc").value;
    if (!task && !procedure) { $("dock-input").focus(); return; }
    if (D.demo) { note(t("dock.demo"), true); return; }
    const mode = $("dock-mode").value;
    $("dock-send").disabled = true; note("…");
    try {
      const r = await post("/api/admin/task", { who: D.who.name, cwd: D.who.path, key: D.who.folder || "", task, mode, procedure, continueSession: $("dock-cont").checked, replyTo: D.replyTo });
      const b = await r.json().catch(() => ({}));
      if (!r.ok || !b.ok) throw new Error(b.code === "noDir" ? t("work.noDir") + ": " + D.who.path : b.code === "demo" ? t("dock.demo") : (b.error || String(r.status)));
      $("dock-input").value = ""; D.replyTo = ""; $("dock-input").placeholder = t("dock.ph"); note("");
      await loadTasks();
    } catch (e) {
      note(e.message, true); alert(e.message);
    } finally {
      $("dock-send").disabled = false;
    }
  }
  function note(msg, err) { const s = $("dock-status"); s.textContent = msg || ""; s.className = "d-status" + (err ? " err" : ""); }

  // ---------- 오늘(업무 일지) ----------
  async function loadJournal() {
    const list = $("dock-jlist"), pend = $("dock-jpend");
    list.replaceChildren(); pend.replaceChildren(); $("dock-jpend-wrap").hidden = true;
    $("dock-jdate").textContent = new Date().toLocaleDateString("sv");
    try {
      const r = await fetch("/api/admin/journal?cwd=" + encodeURIComponent(D.who.path), { cache: "no-store" });
      if (!r.ok) return;
      const b = await r.json();
      const row = (e, withDate) => {
        const li = el("li", (e.done ? "done " : "") + (e.kind === "todo" || e.kind === "question" ? "clickable" : ""));
        li.append(el("time", null, withDate ? e.date.slice(5) : new Date(e.at).toLocaleTimeString("sv").slice(0, 5)), el("span", "k " + e.kind, t("j.kind." + e.kind)), el("span", null, e.text));
        if (li.classList.contains("clickable")) li.onclick = async () => { await post("/api/admin/journal", { cwd: D.who.path, id: e.id, done: !e.done }); loadJournal(); };
        return li;
      };
      const evs = (b.events || []).filter(e => e.kind !== "briefing");
      if (!evs.length) list.append(el("li", "d-empty", t("j.empty")));
      for (const e of evs) list.append(row(e, false));
      const today = new Date().toLocaleDateString("sv");
      const carry = (b.pending || []).filter(p => p.date !== today);
      if (carry.length) { $("dock-jpend-wrap").hidden = false; for (const p of carry) pend.append(row(p, true)); }
    } catch { /* 다음에 */ }
  }
  async function brief(type) {
    const r = await post("/api/admin/briefing", { cwd: D.who.path, type, who: D.who.name });
    const b = await r.json().catch(() => ({}));
    const box = $("dock-brief"); box.textContent = b.text || b.error || ""; box.hidden = !box.textContent;
  }

  // ---------- 알림(아침·퇴근 브리핑) ----------
  async function pollNotices() {
    try {
      const r = await fetch("/api/admin/notices", { cache: "no-store" });
      for (const n of ((await r.json()).notices || [])) {
        const d = el("div", "d-notice"); d.append(el("b", null, n.title), document.createTextNode(n.body));
        d.onclick = () => d.remove(); document.body.append(d); setTimeout(() => d.remove(), 20000);
      }
    } catch { /* 다음에 */ }
  }

  function applyText() {
    for (const e of document.querySelectorAll("#dock [data-i18n]")) e.textContent = t(e.dataset.i18n);
    for (const e of document.querySelectorAll("#dock [data-i18n-ph]")) e.placeholder = t(e.dataset.i18nPh);
  }
  function init({ demo }) {
    D.demo = !!demo;
    applyText();
    $("dock-close").onclick = close;
    for (const b of document.querySelectorAll("#dock-tabs button")) b.onclick = () => { D.tab = b.dataset.tab; tabs(); refresh(); };
    $("dock-send").onclick = send;
    $("dock-input").addEventListener("keydown", e => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send(); });
    $("dock-jform").onsubmit = async e => { e.preventDefault(); const v = $("dock-jtext").value.trim(); if (!v) return; await post("/api/admin/journal", { cwd: D.who.path, kind: $("dock-jkind").value, text: v }); $("dock-jtext").value = ""; loadJournal(); };
    $("dock-morning").onclick = () => brief("morning");
    $("dock-wrapup").onclick = () => brief("wrapup");
    setInterval(pollNotices, 60000);
    setTimeout(pollNotices, 2500);
  }
  return { init, open, close, applyText, refresh, setDemo: v => { D.demo = !!v; }, isOpen: () => D.open, who: () => D.who };
})();
