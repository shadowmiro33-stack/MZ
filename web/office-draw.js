"use strict";
// 사무실 그리기 — 코드로 그리는 아이소메트릭 바닥·벽·가구(office-world.js 가 만든 OFFICE_ROOMS·OFFICE_WALLS·OFFICE_FURNITURE).
// 사람은 office-view.js 가 그린다(깊이 순). 여기 함수는 모두 사무실 좌표계(화면이 한 번 줄인 ctx)에서 그린다.

const OfficeDraw = (() => {
  const { TX, TY, WALL_H } = OfficeWorld;
  const INK = "rgba(40, 46, 52, .55)";

  function poly(ctx, pts) { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); }
  const up = (p, h) => [p[0], p[1] - h];
  // 색은 전부 #RRGGBB 로 주고받는다(shade 결과를 다시 shade 할 수 있게)
  const rgb = hex => { const n = parseInt(String(hex).slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const hex = (r, g, b) => "#" + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
  const shade = (c, k) => {                         // k<1 어둡게, k>1 밝게
    const [r, g, b] = rgb(c);
    const f = v => (k > 1 ? v + (255 - v) * (k - 1) : v * k);
    return hex(f(r), f(g), f(b));
  };
  const mix = (c, bg, a) => {                       // c 를 bg 위에 a 만큼 — 방 바닥 물들이기
    const [r, g, b] = rgb(c), [r2, g2, b2] = rgb(bg);
    return hex(r * a + r2 * (1 - a), g * a + g2 * (1 - a), b * a + b2 * (1 - a));
  };

  /** 상자(기둥): 바닥 사각형 pts(시계 방향: 뒤·오른쪽·앞·왼쪽) 를 h 만큼 올린 입체 */
  function box(ctx, pts, h, color, stroke = INK) {
    const [p0, p1, p2, p3] = pts;
    ctx.lineWidth = 1.2; ctx.strokeStyle = stroke; ctx.lineJoin = "round";
    ctx.fillStyle = shade(color, 0.72); poly(ctx, [p3, p2, up(p2, h), up(p3, h)]); ctx.fill(); ctx.stroke();   // 왼쪽 앞면
    ctx.fillStyle = shade(color, 0.86); poly(ctx, [p2, p1, up(p1, h), up(p2, h)]); ctx.fill(); ctx.stroke();   // 오른쪽 앞면
    ctx.fillStyle = color; poly(ctx, pts.map(p => up(p, h))); ctx.fill(); ctx.stroke();                         // 윗면
  }

  // ---------- 바닥·방 ----------
  function floor(ctx) {
    ctx.save();
    // 건물 바닥
    ctx.fillStyle = "#E4DFD6"; poly(ctx, OFFICE_FLOOR); ctx.fill();
    for (const r of OFFICE_ROOMS) {
      ctx.fillStyle = r.kind === "room" ? mix(r.color, "#F6F3EE", r.common ? 0.07 : 0.12) : r.color;
      poly(ctx, r.poly); ctx.fill();
    }
    // 격자(iso 타일) — 바닥 안에만
    poly(ctx, OFFICE_FLOOR); ctx.clip();
    ctx.strokeStyle = "rgba(60, 60, 70, .07)"; ctx.lineWidth = 1;
    const [x0, y0] = OFFICE_FLOOR[0], span = (OFFICE_W + OFFICE_H) / TX + 8;
    for (let k = -span; k < span; k++) {
      const ox = x0 + k * TX * 2;
      ctx.beginPath(); ctx.moveTo(ox - OFFICE_H * 2, y0 - OFFICE_H); ctx.lineTo(ox + OFFICE_H * 2, y0 + OFFICE_H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox + OFFICE_H * 2, y0 - OFFICE_H); ctx.lineTo(ox - OFFICE_H * 2, y0 + OFFICE_H); ctx.stroke();
    }
    ctx.restore();
    // 방 테두리(바닥 선)
    ctx.strokeStyle = "rgba(40, 46, 52, .18)"; ctx.lineWidth = 1.5;
    for (const r of OFFICE_ROOMS) { poly(ctx, r.poly); ctx.stroke(); }
  }

  // ---------- 벽 — 유리 칸막이. 바깥 뒷벽은 불투명, 나머지는 반투명(사람이 뒤에 있어도 보이게) ----------
  function walls(ctx) {
    const { U, V } = OfficeWorld.size();
    const near = (x, k) => Math.abs(x - k) < 0.05;
    for (const [a, b] of OFFICE_WALLS) {
      // 뒷벽 = u=0·v=0 선 위의 벽(왼쪽 뒤·오른쪽 뒤) — 불투명·높게. 앞 변(u=U·v=V)의 벽은 낮게(안을 가리지 않게)
      const [ua, va] = OfficeWorld.uv(a), [ub, vb] = OfficeWorld.uv(b);
      const isBack = (near(ua, 0) && near(ub, 0)) || (near(va, 0) && near(vb, 0));
      const front = !isBack && ((near(ua, U) && near(ub, U)) || (near(va, V) && near(vb, V)));
      const h = isBack ? WALL_H : front ? 30 : WALL_H * 0.78;
      const pts = [a, b, up(b, h), up(a, h)];
      ctx.lineWidth = 1.2; ctx.strokeStyle = "rgba(40,46,52,.45)";
      if (isBack) { ctx.fillStyle = "#F3F0EA"; }
      else { ctx.fillStyle = front ? "rgba(236, 240, 244, .55)" : "rgba(214, 228, 238, .42)"; }
      poly(ctx, pts); ctx.fill(); ctx.stroke();
      if (!isBack) {                                   // 유리 아래 난간
        ctx.fillStyle = "rgba(120, 130, 140, .5)"; poly(ctx, [a, b, up(b, 6), up(a, 6)]); ctx.fill();
      }
    }
    // 방 명판 — 복도 쪽 벽 위
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (const lb of OFFICE_LABELS) {
      const text = lb.common ? I18N.t("room.common") : lb.text;
      ctx.font = `700 20px -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", "Segoe UI", sans-serif`;
      const w = ctx.measureText(text).width + 30, h = 30;
      const x = lb.at[0], y = lb.at[1] - (lb.side < 0 ? 30 : WALL_H * 0.78) - 16;   // 아래쪽 방은 낮은 앞벽 위
      ctx.fillStyle = lb.common ? "#9AA5B1" : lb.color; ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, 6); ctx.fill();
      ctx.fillStyle = "#FFFFFF"; ctx.fillText(text, x, y + 1);
    }
  }
  // ---------- 가구 ----------
  function furniture(ctx, f) {
    if (f.kind === "desk") {
      box(ctx, f.poly, 36, "#D9B98C");
      const [p0, p1] = f.poly;                       // 뒷변 가운데에 모니터
      const mx = (p0[0] + p1[0]) / 2 + 6, my = (p0[1] + p1[1]) / 2 - 36;
      ctx.fillStyle = "#2E3338"; ctx.fillRect(mx - 3, my - 4, 6, 8);
      ctx.fillStyle = "#23272B"; ctx.beginPath(); ctx.roundRect(mx - 22, my - 34, 44, 30, 3); ctx.fill();
      ctx.fillStyle = "#8EC9F0"; ctx.fillRect(mx - 19, my - 31, 38, 24);
      ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.fillRect(mx - 19, my - 31, 38, 6);
      // 키보드
      const kx = (f.poly[2][0] + f.poly[3][0]) / 2 + 10, ky = (f.poly[2][1] + f.poly[3][1]) / 2 - 36 - 6;
      ctx.fillStyle = "#F2F2F2"; ctx.strokeStyle = INK; ctx.lineWidth = 1;
      poly(ctx, [[kx - 16, ky - 4], [kx + 14, ky - 10], [kx + 20, ky - 6], [kx - 10, ky]]); ctx.fill(); ctx.stroke();
    } else if (f.kind === "sofa") {
      const c = f.color || "#8FA3B8";
      box(ctx, f.poly, 22, shade(c, 1.35), "rgba(40,46,52,.35)");
      const [p0, p1, p2, p3] = f.poly;             // 등받이: 뒷변을 따라 얇고 높게
      const t = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
      box(ctx, [p0, p1, t(p1, p2, 0.28), t(p0, p3, 0.28)], 46, shade(c, 1.2), "rgba(40,46,52,.35)");
      box(ctx, [p0, t(p0, p1, 0.12), t(p3, p2, 0.12), p3], 34, shade(c, 1.2), "rgba(40,46,52,.35)");   // 팔걸이
      box(ctx, [t(p0, p1, 0.88), p1, p2, t(p3, p2, 0.88)], 34, shade(c, 1.2), "rgba(40,46,52,.35)");
    } else if (f.kind === "armchair") {
      const [x, y] = f.at;
      const pts = [[x - 26, y - 13], [x + 26, y - 13], [x + 26, y + 13], [x - 26, y + 13]];
      box(ctx, pts, 20, "#B7C9A6", "rgba(40,46,52,.35)");
      box(ctx, [pts[0], pts[1], [x + 26, y - 6], [x - 26, y - 6]], 44, "#AFC19E", "rgba(40,46,52,.35)");
    } else if (f.kind === "counter") {
      box(ctx, f.poly, 40, "#B9BDC4");
      const [p0, p1] = f.poly, cx = (p0[0] + p1[0]) / 2 - 20, cy = (p0[1] + p1[1]) / 2 - 40;
      ctx.fillStyle = "#3A3F45"; ctx.beginPath(); ctx.roundRect(cx - 12, cy - 30, 24, 30, 3); ctx.fill();   // 커피 머신
      ctx.fillStyle = "#E74C3C"; ctx.fillRect(cx - 4, cy - 24, 8, 4);
      ctx.fillStyle = "#FFFFFF"; ctx.fillRect(cx + 20, cy - 8, 10, 8); ctx.fillRect(cx + 34, cy - 8, 10, 8);   // 머그
    } else if (f.kind === "table") {
      const [x, y] = f.at;
      ctx.fillStyle = "#8C7B6B"; ctx.fillRect(x - 3, y - 30, 6, 30);
      ctx.fillStyle = "#E7D4B8"; ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(x, y - 30, 46, 23, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#4D8A4A"; ctx.beginPath(); ctx.ellipse(x, y - 34, 6, 4, 0, 0, Math.PI * 2); ctx.fill();   // 작은 화분
    } else if (f.kind === "mtable") {
      box(ctx, f.poly, 36, "#E7D4B8");
    } else if (f.kind === "board") {
      const [x, y] = f.at;
      ctx.fillStyle = "#FFFFFF"; ctx.strokeStyle = "#8A8F96"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(x - 64, y - WALL_H + 10, 128, 54, 3); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "#3F7FD9"; ctx.lineWidth = 2; ctx.beginPath();
      ctx.moveTo(x - 50, y - WALL_H + 44); ctx.lineTo(x - 30, y - WALL_H + 24); ctx.lineTo(x - 8, y - WALL_H + 36); ctx.lineTo(x + 16, y - WALL_H + 18); ctx.lineTo(x + 40, y - WALL_H + 30); ctx.stroke();
      ctx.strokeStyle = "#E74C3C"; ctx.beginPath(); ctx.moveTo(x - 50, y - WALL_H + 52); ctx.lineTo(x + 48, y - WALL_H + 52); ctx.stroke();
    } else if (f.kind === "rack") {
      box(ctx, f.poly, 96, "#3C4148", "rgba(0,0,0,.4)");
      const [p0, p1, p2, p3] = f.poly;
      for (let k = 0; k < 7; k++) {                   // 깜빡이는 등은 그리지 않고 고정 — 가벼움 우선
        const t = 10 + k * 12;
        ctx.fillStyle = k % 3 === 1 ? "#4ADE80" : "#60A5FA";
        ctx.fillRect(p3[0] + 6, (p3[1] + p2[1]) / 2 - 96 + t + 2, 3, 3);
        ctx.fillRect(p3[0] + 12, (p3[1] + p2[1]) / 2 - 96 + t + 5, 3, 3);
      }
    } else if (f.kind === "plant") {
      const [x, y] = f.at;
      box(ctx, [[x - 12, y - 6], [x + 12, y - 6], [x + 12, y + 6], [x - 12, y + 6]], 22, "#C98F63", "rgba(0,0,0,.3)");
      ctx.fillStyle = "#4F9A5A";
      for (const [dx, dy, r] of [[0, -46, 16], [-14, -36, 12], [14, -38, 13], [0, -32, 11], [-8, -52, 9], [9, -54, 9]]) {
        ctx.beginPath(); ctx.ellipse(x + dx, y + dy, r, r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = "#6FBF72"; ctx.beginPath(); ctx.ellipse(x - 4, y - 48, 7, 5, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  /** 의자 등받이 — 앉은 사람 위에 덧그린다(허리 아래가 가려져 앉은 것처럼). c = OFFICE_ATLAS.chairs[i] */
  function chair(ctx, c) {
    const [sx, sy] = c.seat, y = sy + OfficeWorld.SIT + 2;
    ctx.fillStyle = "#2F343A"; ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(sx - 24, y - 30, 48, 30, 8); ctx.fill(); ctx.stroke();             // 등받이
    ctx.fillStyle = "#3C4147"; ctx.beginPath(); ctx.roundRect(sx - 20, y - 26, 40, 22, 6); ctx.fill();
    ctx.fillStyle = "#2F343A"; ctx.fillRect(sx - 28, y - 8, 8, 10); ctx.fillRect(sx + 20, y - 8, 8, 10); // 팔걸이
  }

  return { floor, walls, furniture, chair, box, shade };
})();
