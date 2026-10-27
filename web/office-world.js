"use strict";
// 사무실 지도 — 팀 목록으로 자동 생성한다(OfficeWorld.build). 그림 파일이 아니라 코드로 그린 아이소메트릭 사무실이라
// 관리자 모드에서 팀을 더하면 방이 하나 늘어난다. 좌표는 전부 '사무실 픽셀'(화면이 한 번 더 줄여 그린다).
//
// 평면(격자 단위 u·v → iso): 위쪽 줄 = 팀 방들(팀마다 하나 + 팀 없는 사람의 '공용' 방), 가운데 = 복도(출입문은 왼쪽 끝),
// 아래 줄 = 공용 시설(탕비실·라운지·회의실·서버실).
// 대사·화면 문구는 i18n.js, 길 찾기·충돌은 office-path.js, 그리기는 office-view.js(drawFloor).
//
// 아래 전역 이름은 다른 파일이 그대로 쓰므로 build() 가 값만 바꿔 끼운다(let).

let OFFICE_W = 1536, OFFICE_H = 1024;
let OFFICE_NODES = {}, OFFICE_EDGES = [], OFFICE_WALLS = [], OFFICE_BLOCKS = [], OFFICE_FLOOR = [];
let OFFICE_DESKS = [], OFFICE_OVERFLOW = [], OFFICE_SPOTS = {}, OFFICE_HOMES = {}, OFFICE_CHATS = [];
let OFFICE_ROOMS = [], OFFICE_FURNITURE = [], OFFICE_LABELS = [];   // 그리기용 — 방·가구·바닥 글씨
let OFFICE_VERSION = 0;                                              // build 할 때마다 +1 (길 찾기 캐시 갱신)

// 캐릭터 종류 — 시트 이름 앞머리(web/office/<종>*.webp). AUTO = 명부에 종류가 없을 때 이름으로 고르는 후보(강아지 품종).
// 새 품종을 더하면 tools/sprites/dog.py 로 시트를 만들고 여기와 server/config.mjs KINDS·admin.js 에 같이 적는다.
const OFFICE_SPECIES = ["pome", "frog", "capy"];
const OFFICE_AUTO_SPECIES = ["pome"];

// 코딩할 때 머리 위로 떠오르는 기호(언어와 무관)
const OFFICE_CODE = ["{ }", "</>", "( );", "=>", "01", "git", "fn", "#"];

// 프로젝트별 모자·가디건 색 — 이름으로 고정(켜고 꺼도 같은 색). 서로 잘 갈리는 16색.
const OFFICE_COLORS = [
  "#E74C3C", "#E67E22", "#F1C40F", "#27AE60", "#16A085", "#2E86DE", "#3742FA", "#8E44AD",
  "#E84393", "#8D6E63", "#2C3E50", "#00B8D4", "#7CB342", "#FF7043", "#5F27CD", "#C0392B",
];

const OfficeWorld = (() => {
  // 격자 한 칸: 가로 반폭 TX, 세로 반높이 TY (iso 2:1)
  const TX = 54, TY = 27;
  const WALL_H = 86;                 // 벽 높이(픽셀) — 그리기용
  const SIT = 18;                    // 의자 앉는 점 → 앉은 그림 발끝(office-life SIT_DESK 와 같다)
  let ORG = [0, 0];                  // iso 원점(화면) — build 가 정한다
  let SIZE = { U: 0, V: 0 };         // 건물 크기(격자)
  const iso = (u, v) => [ORG[0] + (u - v) * TX, ORG[1] + (u + v) * TY];
  const uv = ([x, y]) => [((x - ORG[0]) / TX + (y - ORG[1]) / TY) / 2, ((y - ORG[1]) / TY - (x - ORG[0]) / TX) / 2];
  const rect = (u0, v0, u1, v1) => [iso(u0, v0), iso(u1, v0), iso(u1, v1), iso(u0, v1)];

  // 방 크기(격자 단위)
  const ROOM_V = 8;                  // 팀 방 깊이
  const HALL_V = 3;                  // 복도 폭
  const DESK_U = 3;                  // 책상 간격
  const COMMON = "__common__";       // 팀 없는 사람의 방

  /** teams = [{ name, color, size }] (size = 명부에 있는 인원). 돌려주는 값 = 요약(방 수·크기) */
  /** teams = [{ name, color, size }] (size = 명부에 있는 인원). 돌려주는 값 = 요약(방 수·크기) */
  function build(teams) {
    OFFICE_VERSION++;
    const list = [...teams.map(t => ({ ...t })), { name: COMMON, color: "#9AA5B1", size: 0, common: true }];
    for (const t of list) t.desks = Math.max(3, Math.min(6, (t.size || 0) + 1));
    for (const t of list) t.ru = t.desks * DESK_U + 2;                   // 방 너비(u)

    // 복도 위쪽(v 0..ROOM_V): 회의실·서버실 + 짝수 번째 팀 방. 아래쪽: 탕비실·라운지 + 홀수 번째 팀 방.
    const TOP = [["meeting", 9], ["server", 5]], BOT = [["kitchen", 7], ["lounge", 7]];
    list.forEach((t, i) => (i % 2 ? BOT : TOP).push([t, t.ru]));
    const span = row => row.reduce((n, r) => n + r[1], 0);
    const U = Math.max(span(TOP), span(BOT));
    const V0 = ROOM_V, V1 = ROOM_V + HALL_V, V = V1 + ROOM_V;
    SIZE = { U, V };
    const PAD = 40;
    OFFICE_W = Math.round((U + V + 3.2) * TX + PAD * 2);
    OFFICE_H = Math.round((U + V) * TY + WALL_H + PAD * 2 + 20);
    ORG = [PAD + (V + 3.2) * TX, PAD + WALL_H + 10];

    const N = {}, E = [], W = [], B = [], D = [], OF = [], R = [], F = [], LB = [], CH = [], CHATS = [];
    const S = { sofa: [], coffee: [], cafe: [], meeting: [], board: [], server: [], stroll: [], armchair: [] };
    const addNode = (k, u, v) => { N[k] = iso(u, v); return k; };
    const link = (a, b) => E.push([a, b]);
    const wall = (u0, v0, u1, v1) => W.push([iso(u0, v0), iso(u1, v1)]);
    const wallWithDoor = (u0, v, u1, gap = 2.4) => { const m = (u0 + u1) / 2; wall(u0, v, m - gap / 2, v); wall(m + gap / 2, v, u1, v); };
    const chairAt = (u, v) => {
      const s = iso(u, v).map(Math.round);
      CH.push({ box: [s[0] - 24, s[1] - 20, 48, 46], seat: s, kid: 12 });
      return { seat: s, idx: CH.length - 1 };
    };

    // ---------- 바닥 — 건물 + 출입문 앞 현관(바깥 통로 점 out 이 바닥 안에 있어야 걸어 나간다) ----------
    OFFICE_FLOOR = [iso(0, 0), iso(U, 0), iso(U, V), iso(0, V), iso(0, V1), iso(-3.2, V1), iso(-3.2, V0), iso(0, V0)];
    wall(0, 0, 0, V0); wall(0, V1, 0, V); wall(0, 0, U, 0); wall(U, 0, U, V); wall(0, V, U, V);   // 바깥벽(왼쪽은 출입문 자리 비움)
    wall(-3.2, V0, 0, V0); wall(-3.2, V1, 0, V1);                                               // 현관 난간

    // ---------- 복도 ----------
    const hv = (V0 + V1) / 2;
    addNode("out", -2.6, hv); addNode("door", -0.3, hv); addNode("inner", 1.2, hv);
    link("out", "door"); link("door", "inner");
    R.push({ kind: "hall", poly: rect(0, V0, U, V1), color: "#DCDFE4" });
    const hall = ["inner"];
    for (let u = 4; u < U - 1; u += 4) hall.push(addNode(`h${u}`, u, hv));
    hall.push(addNode("hEnd", U - 1.2, hv));
    for (let i = 1; i < hall.length; i++) link(hall[i - 1], hall[i]);
    const hallAt = u => hall.reduce((a, b) => (Math.abs(N[b][0] - iso(u, hv)[0]) < Math.abs(N[a][0] - iso(u, hv)[0]) ? b : a));
    for (let u = 3; u < U - 1; u += 7) S.stroll.push({ at: iso(u, hv + (u % 2 ? 0.5 : -0.5)), via: hallAt(u) });

    // ---------- 방 하나(팀 방 또는 시설) — side: 1 = 위쪽(문이 아래 벽), -1 = 아래쪽(문이 위 벽) ----------
    let ti = 0;
    function room(item, u0, u1, side) {
      const [what, w] = item, cu = (u0 + u1) / 2;
      const v0 = side > 0 ? 0 : V1, v1 = side > 0 ? V0 : V;                // 방의 v 범위
      const doorV = side > 0 ? V0 : V1;                                     // 복도 쪽 벽
      const inV = doorV - side * 1.3;                                       // 문 안쪽 점
      const far = k => doorV - side * k;                                    // 문에서 방 안쪽으로 k 만큼
      const id = typeof what === "string" ? `f_${what}` : `r${ti++}`;
      if (u0 > 0) wall(u0, v0, u0, v1);
      wallWithDoor(u0, doorV, u1, 2.4);
      const door = addNode(`${id}d`, cu, doorV + side * 0.9), inn = addNode(`${id}i`, cu, inV);
      link(hallAt(cu), door); link(door, inn);
      if (typeof what !== "string") {                                       // ----- 팀 방 -----
        const t = what;
        R.push({ kind: "room", team: t.common ? "" : t.name, common: !!t.common, color: t.color, poly: rect(u0, v0, u1, v1) });
        // 책상 줄: 위쪽 방은 뒷벽(v≈2) 앞, 아래쪽 방은 앞벽 쪽(v≈V-3.5). 사람은 책상 아래(남쪽)에 등 보이고 앉는다.
        const rowV = side > 0 ? v0 + 2.2 : v1 - 3.6, seatV = rowV + 1.5, viaV = rowV + 3.1;
        const vias = [];
        for (let k = 0; k < t.desks; k++) {
          const du = u0 + 2 + k * DESK_U;
          vias.push(addNode(`${id}v${k}`, du, viaV));
          const poly = rect(du - 1.1, rowV - 0.7, du + 1.1, rowV + 0.6);
          F.push({ kind: "desk", poly, at: iso(du, rowV), y: iso(du, rowV + 0.6)[1] }); B.push(poly);
          const c = chairAt(du, seatV);
          D.push({ seat: c.seat, via: vias[k], row: id, team: t.common ? "" : t.name });
        }
        for (let i = 1; i < vias.length; i++) link(vias[i - 1], vias[i]);
        link(inn, vias[Math.floor(vias.length / 2)]);
        if (side < 0) link(inn, vias[0]);                                   // 아래쪽 방은 문에서 책상 줄까지 멀다 — 길 하나 더
        // 소파: 위쪽 방은 앞(복도 쪽) 오른쪽, 아래쪽 방은 뒤(복도 쪽) 오른쪽 — 어느 쪽이든 문 가까이
        const su = u1 - 2.2, sv = side > 0 ? v1 - 2.6 : v0 + 1.6;
        const sofaPoly = rect(su - 1.6, sv - 0.7, su + 1.6, sv + 0.5);
        F.push({ kind: "sofa", poly: sofaPoly, at: iso(su, sv), color: t.color, y: iso(su, sv + 0.5)[1] }); B.push(sofaPoly);
        const sVia = addNode(`${id}s`, su, sv + 1.6);
        link(inn, sVia);
        for (const [dx, face] of [[-0.75, 1], [0.75, -1]]) S.sofa.push({ at: iso(su + dx, sv + 0.35), via: sVia, face, team: t.common ? "" : t.name });
        CHATS.push({ pts: [iso(su - 0.75, sv + 0.35), iso(su + 0.75, sv + 0.35)], via: sVia, sit: true, team: t.common ? "" : t.name });
        const pu = u0 + 1, pv = side > 0 ? v1 - 1.2 : v0 + 1.2;
        F.push({ kind: "plant", at: iso(pu, pv), y: iso(pu, pv)[1] });
        CHATS.push({ pts: [iso(cu - 1.2, far(2.6)), iso(cu + 1.2, far(2.6))], via: inn, team: t.common ? "" : t.name });
        LB.push({ text: t.common ? "" : t.name, common: !!t.common, at: iso(cu, side > 0 ? doorV : v1), color: t.color, side });
        return;
      }
      const kind = what;
      R.push({ kind, poly: rect(u0, v0, u1, v1), color: { kitchen: "#F3EBDD", lounge: "#E6EEE6", meeting: "#E4E9F2", server: "#E3E3E8" }[kind] });
      if (kind === "meeting") {                                             // 위쪽: 긴 탁자 + 앞줄 의자 셋 + 화이트보드(뒷벽)
        const tu = cu, tv = v0 + 3.4;
        const table = rect(tu - 2.6, tv - 0.6, tu + 2.6, tv + 0.6);
        F.push({ kind: "mtable", poly: table, y: iso(tu + 2.6, tv + 0.6)[1] }); B.push(table);
        F.push({ kind: "board", at: iso(tu, v0 + 0.25), y: 0 });
        const mv = addNode("f_mtg", tu, tv + 2.5); link(inn, mv);
        [-1.7, 0, 1.7].forEach((du, k) => {
          const c = chairAt(tu + du, tv + 1.1);
          OF.push({ seat: c.seat, via: mv, chair: c.idx });
          if (k !== 1) S.meeting.push({ at: c.seat, via: mv, face: 1, chair: c.idx });
        });
        const bv = addNode("f_board", tu - 3.4, v0 + 1.8); link(inn, bv);
        S.board.push({ at: iso(tu - 3.4, v0 + 1.5), via: bv, face: 1 });
        CHATS.push({ pts: [iso(tu - 1.7, tv + 1.1), iso(tu, tv + 1.1), iso(tu + 1.7, tv + 1.1)], via: mv });
      } else if (kind === "server") {                                       // 위쪽: 랙 둘(뒷벽), 그 앞에 서서 일한다
        const rv = v0 + 1.2;
        for (let k = 0; k < 2; k++) {
          const ru = u0 + 1.4 + k * 2.1, rack = rect(ru - 0.8, rv - 0.5, ru + 0.8, rv + 0.5);
          F.push({ kind: "rack", poly: rack, at: iso(ru, rv), y: iso(ru, rv + 0.5)[1] }); B.push(rack);
        }
        const sv = addNode("f_rack", u0 + 2.5, rv + 2.4); link(inn, sv);
        const at = iso(u0 + 2.5, rv + 1.6);
        S.server.push({ at, via: sv, face: 1 });
        OFFICE_HOMES = { server: { work: { at, via: sv, face: 1 }, rest: 0.75, queue: -1 } };
        F.push({ kind: "plant", at: iso(u1 - 1, v1 - 1.2), y: iso(u1 - 1, v1 - 1.2)[1] });
      } else if (kind === "kitchen") {                                      // 아래쪽: 커피 카운터(앞벽), 둥근 탁자
        const counter = rect(u0 + 0.3, v1 - 1.4, u0 + 3.4, v1 - 0.2);
        F.push({ kind: "counter", poly: counter, y: iso(u0 + 3.4, v1 - 0.2)[1] }); B.push(counter);
        const cv = addNode("f_coffee", u0 + 2.4, v1 - 2.6); link(inn, cv);
        S.coffee.push({ at: iso(u0 + 1.4, v1 - 1.9), via: cv, face: -1 }, { at: iso(u0 + 2.7, v1 - 1.9), via: cv, face: -1 });
        const tu = u0 + 5, tv = v0 + 3.6;
        F.push({ kind: "table", at: iso(tu, tv), y: iso(tu, tv + 0.4)[1] }); B.push(ring(tu, tv, 1.0));
        const tvia = addNode("f_cafe", tu, tv + 2); link(inn, tvia);
        S.cafe.push({ at: iso(tu - 1.2, tv + 0.9), via: tvia, face: 1 }, { at: iso(tu + 1.2, tv + 0.9), via: tvia, face: -1 });
        CHATS.push({ pts: [iso(tu - 1.2, tv + 0.9), iso(tu + 1.2, tv + 0.9)], via: tvia, sit: true });
      } else if (kind === "lounge") {                                       // 아래쪽: 큰 소파(복도 쪽 벽 앞), 안락의자, 화분
        const su = cu, sv = v0 + 2.2;
        const sofaPoly = rect(su - 2, sv - 0.7, su + 2, sv + 0.5);
        F.push({ kind: "sofa", poly: sofaPoly, at: iso(su, sv), color: "#7FA68C", big: true, y: iso(su, sv + 0.5)[1] }); B.push(sofaPoly);
        const svia = addNode("f_sofa", su, sv + 1.8); link(inn, svia);
        S.sofa.push({ at: iso(su - 1.1, sv + 0.35), via: svia, face: 1 }, { at: iso(su + 1.1, sv + 0.35), via: svia, face: -1 });
        CHATS.push({ pts: [iso(su - 1.1, sv + 0.35), iso(su + 1.1, sv + 0.35)], via: svia, sit: true });
        const au = u0 + 1.6, av = v1 - 2.4;
        F.push({ kind: "armchair", at: iso(au, av), y: iso(au, av + 0.4)[1] });
        const avia = addNode("f_arm", au + 1.4, av + 0.8); link(inn, avia);
        S.armchair.push({ at: iso(au, av + 0.2), via: avia, face: 1 });
        F.push({ kind: "plant", at: iso(u1 - 1, v1 - 1.2), y: iso(u1 - 1, v1 - 1.2)[1] });
        S.stroll.push({ at: iso(cu + 1.6, v1 - 1.8), via: inn });
      }
    }
    const lay = (row, side) => { let u = 0; for (const it of row) { room(it, u, u + it[1], side); u += it[1]; } return u; };
    const topU = lay(TOP, 1), botU = lay(BOT, -1);
    for (const [used, side] of [[topU, 1], [botU, -1]]) {                   // 남는 자리 = 테라스(화분)
      if (used >= U - 0.5) continue;
      const v0 = side > 0 ? 0 : V1, v1 = side > 0 ? V0 : V;
      R.push({ kind: "terrace", poly: rect(used, v0, U, v1), color: "#E9EFE3" });
      wall(used, v0, used, v1); wallWithDoor(used, side > 0 ? V0 : V1, U, 2.4);
      const inn = addNode(`t${side > 0 ? "T" : "B"}`, (used + U) / 2, side > 0 ? V0 - 1.6 : V1 + 1.6); link(hallAt((used + U) / 2), inn);
      S.stroll.push({ at: iso((used + U) / 2, side > 0 ? V0 - 3 : V1 + 3), via: inn });
      for (let u = used + 1.2; u < U - 0.5; u += 2.5) F.push({ kind: "plant", at: iso(u, side > 0 ? v0 + 1 : v1 - 1), y: iso(u, side > 0 ? v0 + 1 : v1 - 1)[1] });
    }

    OFFICE_NODES = N; OFFICE_EDGES = E; OFFICE_WALLS = W; OFFICE_BLOCKS = B;
    OFFICE_DESKS = D; OFFICE_OVERFLOW = OF; OFFICE_SPOTS = S; OFFICE_CHATS = CHATS;
    OFFICE_ROOMS = R; OFFICE_FURNITURE = F; OFFICE_LABELS = LB;
    OFFICE_ATLAS.chairs = CH;                                            // 의자 등받이·앉는 점 — 화면과 길 찾기가 쓴다
    return { rooms: list.length, w: OFFICE_W, h: OFFICE_H };
  }
  function ring(cu, cv, r) {
    return Array.from({ length: 8 }, (_, i) => iso(cu + r * Math.cos(i * Math.PI / 4), cv + r * Math.sin(i * Math.PI / 4)));
  }

  /** 설정(teams·staff) → build 에 넣을 팀 목록. staff 로 팀별 인원을 센다 */
  function teamsFromConfig(cfg) {
    const teams = Object.entries(cfg?.teams || {}).map(([name, v]) => ({ name, color: (v && v.color) || "#8FA3B8", size: 0 }));
    for (const s of Object.values(cfg?.staff || {})) { const t = teams.find(x => x.name === s.team); if (t) t.size++; }
    return teams;
  }
  const key = teams => JSON.stringify(teams.map(t => [t.name, t.color, Math.max(3, Math.min(6, t.size + 1))]));

  return { build, teamsFromConfig, key, iso, uv, size: () => SIZE, TX, TY, WALL_H, SIT, COMMON };
})();
