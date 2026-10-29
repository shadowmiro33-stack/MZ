"use strict";
// 화면 문구·대사 — 한국어(ko)·영어(en).
// 언어 = 주소의 ?lang= > 저장해 둔 선택(localStorage office.lang) > /api/config 의 lang(auto 가 아니면)
//      > 브라우저 언어(ko 로 시작하면 ko, 아니면 en).

const I18N = (() => {
  const STORE = "office.lang";

  const TEXT = {
    ko: {
      title: "3D 사무실",
      admin: "⚙ 관리자",
      "admin.label": "관리자 모드 — 직원 명부·팀·사무실 이름 설정",
      "room.common": "공용", "ask.badge": "❓ 답변 필요 {n}", "ask.open": "답하기",
      "dock.tab.chat": "대화", "dock.tab.today": "오늘", "dock.tab.all": "전체", "inbox": "📥 받은편지함", "inbox.title": "받은편지함",
      "inbox.ask": "답변 필요", "inbox.run": "진행 중", "inbox.done": "최근 보고", "inbox.empty": "조용합니다 — 질문도, 도는 일도 없어요", "inbox.fail": "실패",
      "fwd": "전달", "fwd.to": "받을 직원", "fwd.note": "덧붙일 지시 (예: 이 보고대로 구현해줘)", "fwd.send": "전달하기", "fwd.from": "↪ {a} 의 보고에서", "fwd.none": "전달할 다른 직원이 사무실에 없어요",
      "gate.run": "▶ 이대로 실행", "gate.ran": "✓ 실행함", "gate.plan": "📝 계획", "gate.task": "방금 세운 계획대로 그대로 실행해라. 계획에 없던 결정이 필요하면 멈추고 ## 질문 으로 물어라.",
      "quick.add": "＋ 저장", "quick.addTitle": "지금 적은 업무·절차서·모드를 빠른 지시로 저장", "quick.name": "빠른 지시 이름 (예: 매거진 발행)", "quick.del": "'{a}' 빠른 지시를 지울까요?", "quick.hint": "누르면 채우기 · Shift+누르면 바로 보내기 · 오른쪽 × 로 지우기", "quick.empty": "먼저 업무를 적거나 절차서를 고르세요", "dock.admin": "⚙", "dock.ph": "업무를 적어 보내세요 — Ctrl+Enter. 질문에 답할 때도 여기에",
      "dock.proc.none": "절차서 없음", "dock.cont": "이어서", "dock.send": "보내기", "dock.empty": "아직 대화가 없습니다. 첫 업무를 적어 보세요.",
      "dock.working": "일하는 중…", "dock.noReport": "(보고 없음 — 출력 보기)", "dock.answered": "답함", "dock.reply": "답하기", "dock.log": "출력", "dock.hide": "닫기", "dock.stop": "중지",
      "dock.demo": "데모 서버에서는 업무를 보낼 수 없습니다 — 실제 서버(127.0.0.1:4777)에서 하세요", "dock.open": "💬 대화", "work.noDir": "그 폴더가 없습니다",
      "mode.acceptEdits": "파일만 고치기", "mode.auto": "명령도 실행", "mode.plan": "계획만", "mode.bypass": "전부 자동 승인",
      "st.running": "일하는 중", "st.done": "완료", "st.failed": "실패", "st.error": "오류",
      today: "오늘", "today.pending": "밀린 것", "j.todo": "할 일", "j.note": "메모", "j.ph": "할 일·메모 입력 후 Enter", "j.morning": "☀️ 아침 브리핑", "j.wrapup": "🌙 퇴근 전 정리",
      "j.empty": "오늘 기록이 없습니다 — 업무가 끝나면 자동으로 적힙니다", "j.kind.activity": "한 일", "j.kind.question": "질문", "j.kind.todo": "할 일", "j.kind.note": "메모", "j.kind.briefing": "브리핑",
      "lang.label": "언어",
      "side.people": "사무실 사람들",
      "side.log": "활동 로그",
      "side.hint": "캐릭터나 이름을 누르면 자세히 봅니다",
      "canvas.label": "사무실 — 캐릭터를 누르면 오른쪽 목록에서 자세히 봅니다",
      sum: "일하는 중 {w} · 승인 대기 {d} · 쉬는 중 {r}",
      "sum.subs": " · 서브에이전트 {n}",
      count: "{n}명 · 일하는 중 {w}",
      demo: "데모 데이터",
      "note.loading": "사무실 불 켜는 중…",
      "note.img": "사무실 그림을 불러오지 못했습니다 — 새로고침해 보세요",
      "note.net": "로컬 서버에 연결하지 못했습니다 — 잠시 뒤 다시 읽습니다",
      "note.empty": "켜진 Claude 세션이 없습니다 — 아무 폴더에서 claude 를 실행하면 사무실로 출근합니다",
      "note.hooks": "훅 미설치 — 대화 기록만으로 표시 중(승인 대기는 감지 안 됨)",
      "status.decision": "승인 대기", "status.working": "일하는 중", "status.rest": "쉬는 중",
      "chip.subs": "서브에이전트 {n}",
      needs: "승인 대기",
      "ask.tool": "{a} 사용 승인 대기",
      "ask.input": "입력 대기",
      "doing.subs": "서브에이전트에게 일을 맡겨 둠",
      "doing.work": "일하는 중…",
      "d.now": "지금", "d.path": "경로", "d.sessions": "세션 {n}개", "d.commits": "커밋 {n}",
      "d.transcript": "대화 기록으로 감지", "d.pending": "승인 대기 {n}건", "d.subs": "서브에이전트",
      "d.more": "외 {n}명", "d.idle": "지금은 쉬는 중", "d.subIdle": "대기 중",
      "ev.in": "출근했습니다", "ev.out": "퇴근했습니다", "ev.work": "일을 시작했습니다",
      "ev.ask": "승인을 기다립니다 — {a}", "ev.subwork": "서브에이전트와 일하는 중", "ev.done": "일을 마쳤습니다",
      "ev.subIn": "서브에이전트 출근 — {a}", "ev.subOut": "서브에이전트 퇴근 — {a}",
      "ev.check": "확인 필요", "ev.task": "일 받음", "ev.end": "일 끝",
    },
    en: {
      title: "3D Office",
      admin: "⚙ Admin",
      "admin.label": "Admin mode — staff, teams and office name",
      "room.common": "Common", "ask.badge": "❓ {n} need an answer", "ask.open": "Answer",
      "dock.tab.chat": "Chat", "dock.tab.today": "Today", "dock.tab.all": "All", "inbox": "📥 Inbox", "inbox.title": "Inbox",
      "inbox.ask": "Needs an answer", "inbox.run": "In progress", "inbox.done": "Recent reports", "inbox.empty": "All quiet — no questions, nothing running", "inbox.fail": "failed",
      "fwd": "Forward", "fwd.to": "To", "fwd.note": "Instruction to add (e.g. implement this report)", "fwd.send": "Forward", "fwd.from": "↪ from {a}'s report", "fwd.none": "No other staff in the office to forward to",
      "gate.run": "▶ Run this plan", "gate.ran": "✓ ran", "gate.plan": "📝 plan", "gate.task": "Execute the plan you just made, exactly as written. If a decision not covered by the plan comes up, stop and ask under ## 질문.",
      "quick.add": "＋ Save", "quick.addTitle": "Save the current task, procedure and mode as a quick instruction", "quick.name": "Name for this quick instruction (e.g. Publish magazine)", "quick.del": "Delete quick instruction '{a}'?", "quick.hint": "Click to fill · Shift+click to send now · × to delete", "quick.empty": "Write a task or pick a procedure first", "dock.admin": "⚙", "dock.ph": "Write a task — Ctrl+Enter. Answer questions here too",
      "dock.proc.none": "No procedure", "dock.cont": "Continue", "dock.send": "Send", "dock.empty": "No conversation yet. Write the first task.",
      "dock.working": "working…", "dock.noReport": "(no report — show output)", "dock.answered": "answered", "dock.reply": "Reply", "dock.log": "Output", "dock.hide": "Hide", "dock.stop": "Stop",
      "dock.demo": "The demo server cannot run tasks — use the real server (127.0.0.1:4777)", "dock.open": "💬 Chat", "work.noDir": "That folder does not exist",
      "mode.acceptEdits": "Edit files only", "mode.auto": "Also run commands", "mode.plan": "Plan only", "mode.bypass": "Approve everything",
      "st.running": "Working", "st.done": "Done", "st.failed": "Failed", "st.error": "Error",
      today: "Today", "today.pending": "Carried over", "j.todo": "To-do", "j.note": "Note", "j.ph": "Add a to-do or note, Enter", "j.morning": "☀️ Morning brief", "j.wrapup": "🌙 Wrap-up",
      "j.empty": "Nothing today yet — finished tasks are logged automatically", "j.kind.activity": "done", "j.kind.question": "question", "j.kind.todo": "to-do", "j.kind.note": "note", "j.kind.briefing": "brief",
      "lang.label": "Language",
      "side.people": "People in the office",
      "side.log": "Activity",
      "side.hint": "Click a character or a name for details",
      "canvas.label": "Office — click a character to see details in the list on the right",
      sum: "Working {w} · Needs you {d} · Idle {r}",
      "sum.subs": " · Subagents {n}",
      count: "{n} · {w} working",
      demo: "Demo data",
      "note.loading": "Turning on the lights…",
      "note.img": "Couldn't load the office images — try reloading",
      "note.net": "Can't reach the local server — retrying shortly",
      "note.empty": "No Claude sessions running — run claude in any folder and it shows up for work",
      "note.hooks": "Hooks not installed — showing transcripts only (approval waits aren't detected)",
      "status.decision": "Needs you", "status.working": "Working", "status.rest": "Idle",
      "chip.subs": "{n} subagent(s)",
      needs: "Needs you",
      "ask.tool": "Allow {a}?",
      "ask.input": "Needs your input",
      "doing.subs": "Subagents are on it",
      "doing.work": "Working…",
      "d.now": "Now", "d.path": "Path", "d.sessions": "{n} session(s)", "d.commits": "{n} commits",
      "d.transcript": "Detected from transcript", "d.pending": "{n} waiting for approval", "d.subs": "Subagents",
      "d.more": "+{n} more", "d.idle": "Taking a break", "d.subIdle": "Standing by",
      "ev.in": "Clocked in", "ev.out": "Clocked out", "ev.work": "Started working",
      "ev.ask": "Needs you — {a}", "ev.subwork": "Working with subagents", "ev.done": "Finished",
      "ev.subIn": "Subagent joined — {a}", "ev.subOut": "Subagent done — {a}",
      "ev.check": "check needed", "ev.task": "new task", "ev.end": "done",
    },
  };

  // 활동(Act) 한 줄 — {k, a}. CONTRACT 4절 표의 k 목록.
  const ACT = {
    ko: {
      text: "💬 {a}", read: "📖 {a} 읽는 중", edit: "✏️ {a} 고치는 중", write: "📝 {a} 쓰는 중", bash: "🔧 {a}",
      grep: "🔍 '{a}' 찾는 중", glob: "🔍 {a} 파일 찾는 중", fetch: "🌐 {a} 읽는 중", search: "🌐 '{a}' 검색 중",
      agent: "🐣 서브에이전트에게 맡김: {a}", todo: "🗒️ 할 일 정리 중", skill: "📚 {a} 펼치는 중",
      mcp: "🔌 {a} 쓰는 중", tool: "⚙️ {a} 쓰는 중",
    },
    en: {
      text: "💬 {a}", read: "📖 Reading {a}", edit: "✏️ Editing {a}", write: "📝 Writing {a}", bash: "🔧 {a}",
      grep: "🔍 Searching '{a}'", glob: "🔍 Finding files {a}", fetch: "🌐 Reading {a}", search: "🌐 Searching '{a}'",
      agent: "🐣 Delegated: {a}", todo: "🗒️ Updating the to-do list", skill: "📚 Opening skill {a}",
      mcp: "🔌 Using {a}", tool: "⚙️ Using {a}",
    },
  };
  // 인자가 비었을 때 대신 넣는 말
  const ACT_EMPTY = {
    ko: { read: "파일", edit: "파일", write: "파일", fetch: "웹", bash: "명령 실행 중", agent: "일", tool: "도구", mcp: "도구" },
    en: { read: "a file", edit: "a file", write: "a file", fetch: "the web", bash: "Running a command", agent: "a task",
          tool: "a tool", mcp: "a tool" },
  };

  // 대사 — 말풍선 한 줄. 수다는 주고받는 맛이 나게 묻고 답하는 말을 섞는다.
  const LINES = {
    ko: {
      talk: ["커피 한 잔 할래?", "빌드 됐어?", "테스트 다 통과!", "깃 충돌 났어…", "리뷰 좀 부탁해", "점심 뭐 먹지",
             "배포는 내일 하자", "토큰 아껴 써야지", "버그 하나 잡았다", "그거 커밋했어?", "ㅋㅋㅋㅋ", "승인 좀 눌러줘",
             "회의 언제야?", "로그 봤어?", "오늘 일 많네", "서버 괜찮아?", "PR 올렸어", "새로고침 해봐",
             "됐다 됐다!", "그거 내가 할게", "오 진짜?", "대박ㅋㅋ", "아 맞다", "그건 좀…", "천재인데?",
             "주말에 뭐 해?", "고양이 사진 볼래?", "어제 그 영상 봤어?", "다이어트는 내일부터", "졸려…"],
      phone: ["여보세요~", "지금 확인할게요", "네네 바로요", "아 그거요?", "네, 말씀하세요"],
      scroll: ["📱 쇼츠 하나만…", "📱 뉴스 보는 중", "알림 왔네", "📱 고양이 영상", "오 이거 괜찮네", "📱 맛집 검색"],
      texting: ["답장 중…", "📱 톡톡", "ㅇㅋㅇㅋ", "지금 가는 중~", "단톡 폭발"],
      lol: ["ㅋㅋㅋㅋ", "아 웃겨ㅋㅋ", "이거 봐ㅋㅋ", "ㅋㅋ 미쳤다"],
      think: ["배고프다…", "커피 땡긴다", "오늘 칼퇴 가능?", "음…", "뭐 하더라", "♪~", "졸려"],
      greet: ["안녕!", "하이~", "수고해!", "좋은 아침~", "오 왔어?"],
      work: ["타닥타닥…", "코드 짜는 중", "생각 중…", "확인 중…"],
      rack: ["🖥️ 랙 불빛 이상 무", "서버 온도 좋고", "백업 확인"],
      rackOk: ["🖥️ 랙 불빛 이상 무"],
      brew: ["☕ 커피 내리는 중"],
      sip: ["캬~", "아 좋다", "☕ 후루룩"],
      reading: ["📚 읽는 중"],
      stretch: ["으아아~"],
      meeting: ["자, 회의 시작합니다"],
      bye: ["또 봐~", "고고!", "ㅂㅂ", "나중에 봐"],
      cheer: ["됐다!", "통과!", "오예~"],
      askWave: ["여기요~!", "확인 부탁해요!", "승인해 주세요~"],
      miniIn: ["출근!", "넵!", "왔습니다"],
      miniBye: ["퇴근합니다! 👋"],
      miniIdle: ["넵!", "확인 중…", "보고드립니다", "뭐 하지?"],
    },
    en: {
      talk: ["Coffee?", "Did the build pass?", "All tests green!", "Merge conflict…", "Can you review this?", "Lunch?",
             "Ship it tomorrow", "Save some tokens", "Squashed a bug", "Did you commit that?", "lol", "Approve my PR?",
             "When's the meeting?", "Seen the logs?", "Busy day", "Server OK?", "PR is up", "Try a refresh",
             "It works!", "I'll take that", "Oh really?", "haha nice", "Oh right", "Hmm, not sure…", "Genius!",
             "Weekend plans?", "Wanna see a cat pic?", "Saw that video?", "Diet starts tomorrow", "Sleepy…"],
      phone: ["Hello~", "Checking now", "Yep, on it", "Oh, that one?", "Go ahead"],
      scroll: ["📱 One more short…", "📱 Reading news", "Got a ping", "📱 Cat videos", "Oh, this is nice", "📱 Food spots"],
      texting: ["Replying…", "📱 tap tap", "ok ok", "On my way~", "Group chat is wild"],
      lol: ["lol", "haha so funny", "look at this lol", "lmao"],
      think: ["Hungry…", "Need coffee", "Leave on time today?", "Hmm…", "What was I doing", "♪~", "Sleepy"],
      greet: ["Hi!", "Hey~", "Keep it up!", "Morning~", "Oh, you're here?"],
      work: ["tap tap tap…", "Writing code", "Thinking…", "Checking…"],
      rack: ["🖥️ Rack lights OK", "Temps look good", "Backups checked"],
      rackOk: ["🖥️ Rack lights OK"],
      brew: ["☕ Brewing coffee"],
      sip: ["Ahh~", "So good", "☕ sip sip"],
      reading: ["📚 Reading"],
      stretch: ["Stretch~"],
      meeting: ["OK, let's start"],
      bye: ["See ya~", "Let's go!", "bye bye", "Later!"],
      cheer: ["Done!", "Passed!", "Yay~"],
      askWave: ["Over here!", "Need your OK!", "Approve me~"],
      miniIn: ["Reporting!", "Yes sir!", "I'm here"],
      miniBye: ["Signing off! 👋"],
      miniIdle: ["On it!", "Checking…", "Reporting back", "What next?"],
    },
  };

  const norm = v => { const s = String(v || "").toLowerCase(); return s.startsWith("ko") ? "ko" : s.startsWith("en") ? "en" : ""; };
  const fill = (tpl, vars) => String(tpl).replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] != null ? String(vars[k]) : ""));
  const cut = (text, n) => { const a = Array.from(text || ""); return a.length > n ? a.slice(0, n).join("") + "…" : a.join(""); };
  const listeners = [];
  let lang = "en", fixed = false;
  let officeTitle = "";                          // 설정(title)의 사무실 이름 — 있으면 두 언어 모두 그것

  (function detect() {
    const q = norm(new URLSearchParams(location.search).get("lang"));
    if (q) { lang = q; fixed = true; return; }
    let saved = "";
    try { saved = norm(localStorage.getItem(STORE)); } catch { /* 저장소를 못 쓰면 다음 순서로 */ }
    if (saved) { lang = saved; fixed = true; return; }
    lang = norm(navigator.language) === "ko" ? "ko" : "en";
  })();

  // 설정 파일의 lang 은 서버에서 받아 온다(주소·저장값이 없을 때만). 서버가 없으면 브라우저 언어 그대로.
  async function init() {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 1500);
      const res = await fetch("/api/config", { signal: ctl.signal, cache: "no-store" });
      clearTimeout(timer);
      if (res.ok) {
        const c = await res.json();
        if (!fixed) { const l = norm(c && c.lang); if (l) lang = l; }
        officeTitle = typeof c?.title === "string" ? c.title.trim() : "";
      }
    } catch { /* 설정을 못 읽어도 화면은 뜬다 */ }
    document.documentElement.lang = lang;
  }
  function setLang(next) {
    next = norm(next);
    if (!next || next === lang) return;
    lang = next;
    try { localStorage.setItem(STORE, lang); } catch { /* 저장 못 해도 지금 화면은 바뀐다 */ }
    const url = new URL(location.href);
    if (url.searchParams.has("lang")) { url.searchParams.set("lang", lang); history.replaceState(null, "", url); }
    document.documentElement.lang = lang;
    for (const f of listeners) f(lang);
  }

  const t = (key, vars) => (key === "title" && officeTitle ? officeTitle : fill(TEXT[lang][key] ?? TEXT.ko[key] ?? key, vars));
  const lines = name => LINES[lang][name] || LINES.ko[name] || [""];
  function act(x) {
    if (!x) return "";
    if (typeof x === "string") return x;                     // 옛 형식(이미 글)이면 그대로
    const k = String(x.k || ""), a = String(x.a ?? "").trim();
    if (k === "text" && !a) return "";
    const tpl = Object.hasOwn(ACT[lang], k) ? ACT[lang][k] : "";   // 모르는 k 는 인자만
    if (!tpl) return a ? `⚙️ ${a}` : "";
    return fill(tpl, { a: a || (Object.hasOwn(ACT_EMPTY[lang], k) ? ACT_EMPTY[lang][k] : "") });
  }
  // 승인 문구 — Claude 의 영어 알림을 한국어 화면에서는 짧게 바꾼다. 영어 화면은 원문 그대로,
  // short(말풍선·로그)일 때만 짧게("Allow Bash?"). 모르는 문구는 그대로.
  function ask(text, short) {
    const s = String(text || "").replace(/\s+/g, " ").trim();
    if (!s) return "";
    const tool = s.match(/^Claude needs your permission to use (.+?)\.?$/i);
    if (tool) return lang === "ko" || short ? t("ask.tool", { a: tool[1] }) : s;
    if (/^Claude (needs your input|is waiting for your input)\.?$/i.test(s)) return lang === "ko" || short ? t("ask.input") : s;
    if (/^[A-Za-z][\w.:-]{0,39}$/.test(s)) return t("ask.tool", { a: s });   // 도구 이름만 왔다(PermissionRequest)
    return s;
  }
  function ev(key, arg) {
    if (key === "ask") return t("ev.ask", { a: cut(ask(arg, true) || t("ev.check"), 24) });
    if (key === "subIn") return t("ev.subIn", { a: cut(arg || t("ev.task"), 22) });
    if (key === "subOut") return t("ev.subOut", { a: cut(arg || t("ev.end"), 22) });
    return t("ev." + key);
  }
  // 로그 시각 — 보는 사람의 시간대
  const time = ms => new Date(ms).toLocaleTimeString(lang === "ko" ? "ko-KR" : "en-GB",
    { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return {
    get lang() { return lang; },
    init, setLang, onChange: f => listeners.push(f),
    t, lines, act, ask, ev, time, cut,
  };
})();
