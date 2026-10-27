#!/usr/bin/env python3
"""강아지 스프라이트 생성기 — 파라미터 캐릭터(SVG)를 자세 표대로 그려 web/office/<종>*.webp 와 -key 마스크, office-atlas.js 를 만든다.

사용법: python3 tools/sprites/dog.py [--breed pome] [--out web/office] [--preview 경로.png]
필요: Python 3 + Pillow + playwright(크로미움). 외부 의존성 0 규칙은 '실행 시' 기준이라 생성 도구는 예외.

칸 규격은 docs/SPRITES.md 와 같다: 칸 220×280, 발끝 = 칸 아래 끝, 가로 가운데. 걷기 시트 20칸, 나머지 8칸.
"""
import argparse, json, math, os, re, sys
from pathlib import Path

CW, CH = 220, 280
GROUND = 276            # 발끝 y
CX = 110

# ---------- 품종 색 ----------
# fur 털, fur2 귀·꼬리 진한 털, cream 얼굴 아래·가슴·발, ink 선, mask 머리 위 진한 무늬(없으면 None),
# blaze 이마 흰 줄(없으면 None), tongue 기본 표정에 혀
BREEDS = {
    "pome": {  # 포메라니안(주황) — 주황 솜뭉치, 크림 얼굴, 작은 세모 귀, 말린 꼬리
        "fur": "#F2A54A", "fur2": "#E08F30", "cream": "#FBE6BF", "ink": "#3B2A1A",
        "nose": "#2B1D14", "cheek": "#F4B8A0", "mask": None, "blaze": None, "tongue": False,
    },
    "pomesable": {  # 갈색 세이블 포메 — 연갈색 털, 얼굴·귀에 진한 마스크, 크림 가슴, 혀 쏙
        "fur": "#C99A66", "fur2": "#6B4A2E", "cream": "#F6E6CF", "ink": "#3B2A1A",
        "nose": "#1E1512", "cheek": "#E8B6A0", "mask": "#8C6239", "blaze": None, "tongue": True,
    },
    "pomebw": {  # 흑백 파티 포메 — 흰 털, 검은 귀·머리 무늬, 이마 흰 블레이즈
        "fur": "#F7F4EF", "fur2": "#2A2A2E", "cream": "#FFFFFF", "ink": "#2E2A2A",
        "nose": "#1E1512", "cheek": "#F2C4C4", "mask": "#2A2A2E", "blaze": "#F7F4EF", "tongue": False,
    },
}

def fmt(v):
    return f"{v:.1f}".rstrip("0").rstrip(".")

class Dog:
    """한 칸(자세 하나)을 그린다. key=True 면 모자·가디건만 흰색으로(마스크)."""
    def __init__(self, breed, key=False):
        self.c = BREEDS[breed]
        self.key = key
        self.out = []
        self.late = []        # 팔 — 머리 위에 그린다

    # 기본 도형 — key 모드에서는 key=True 인 도형만 흰색, 나머지는 안 그린다
    def shape(self, svg, is_key=False):
        if self.key:
            if is_key:
                svg = re.sub(r'fill="[^"]*"', 'fill="#FFFFFF"', svg)
                svg = re.sub(r'stroke="[^"]*"', 'stroke="#FFFFFF"', svg)
                self.out.append(svg)
        else:
            self.out.append(svg)

    def circle(self, x, y, r, fill, sw=3, stroke=None, key=False):
        stroke = stroke or self.c["ink"]
        self.shape(f'<circle cx="{fmt(x)}" cy="{fmt(y)}" r="{fmt(r)}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>', key)

    def ellipse(self, x, y, rx, ry, fill, sw=3, stroke=None, rot=0, key=False):
        stroke = stroke or self.c["ink"]
        tr = f' transform="rotate({fmt(rot)} {fmt(x)} {fmt(y)})"' if rot else ""
        self.shape(f'<ellipse cx="{fmt(x)}" cy="{fmt(y)}" rx="{fmt(rx)}" ry="{fmt(ry)}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{tr}/>', key)

    def path(self, d, fill, sw=3, stroke=None, key=False, cap="round"):
        stroke = stroke or self.c["ink"]
        self.shape(f'<path d="{d}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" stroke-linecap="{cap}" stroke-linejoin="round"/>', key)

    def line(self, x1, y1, x2, y2, sw=3, stroke=None):
        stroke = stroke or self.c["ink"]
        self.shape(f'<line x1="{fmt(x1)}" y1="{fmt(y1)}" x2="{fmt(x2)}" y2="{fmt(y2)}" stroke="{stroke}" stroke-width="{sw}" stroke-linecap="round"/>')

    # ---------- 부품 ----------
    def fluff_ring(self, x, y, r, n=18, bump=0.1):
        """솜뭉치 머리 — 둘레에 작은 봉우리. 하나의 path 로."""
        pts = []
        for i in range(n * 2):
            a = -math.pi / 2 + i * math.pi / n
            rr = r * (1 + bump) if i % 2 == 0 else r
            pts.append((x + rr * math.cos(a), y + rr * math.sin(a)))
        d = f"M{fmt(pts[0][0])},{fmt(pts[0][1])}"
        for i in range(1, len(pts) + 1):
            p = pts[i % len(pts)]
            q = pts[(i - 1) % len(pts)]
            mx, my = (p[0] + q[0]) / 2, (p[1] + q[1]) / 2
            # 봉우리를 둥글게: 바깥 점을 제어점으로
            if i % 2 == 1:
                d += f" Q{fmt(q[0])},{fmt(q[1])} {fmt(mx)},{fmt(my)}"
            else:
                d += f" Q{fmt(q[0])},{fmt(q[1])} {fmt(p[0])},{fmt(p[1])}"
        return d + " Z"

    def tail(self, x, y, s=1.0, front=False):
        c = self.c
        self.circle(x, y, 20 * s, c["fur"], sw=3)
        self.circle(x - 6 * s, y - 4 * s, 9 * s, c["cream"], sw=0, stroke="none")

    def leg(self, x, y, h=40, w=22, dx=0, kick=0):
        """다리: 윗점 (x,y) 에서 아래로 h. dx = 발 옆 이동(걷기). kick>0 이면 발을 앞(아래)으로 들어 올린 모습"""
        c = self.c
        fx = x + dx
        self.path(f"M{fmt(x - w/2)},{fmt(y)} L{fmt(fx - w/2)},{fmt(y + h - 6)} Q{fmt(fx)},{fmt(y + h + 4)} {fmt(fx + w/2)},{fmt(y + h - 6)} L{fmt(x + w/2)},{fmt(y)} Z", c["fur"])
        self.ellipse(fx, y + h - 2, w / 2 + 3, 7, c["cream"], sw=3)

    def leg_sit(self, x, y, dirx=1, w=22):
        """앉은 다리 — 앞으로 쭉, 발바닥 보임"""
        c = self.c
        self.path(f"M{fmt(x - w/2)},{fmt(y)} L{fmt(x - w/2)},{fmt(y + 24)} Q{fmt(x)},{fmt(y + 34)} {fmt(x + w/2)},{fmt(y + 24)} L{fmt(x + w/2)},{fmt(y)} Z", c["fur"])
        self.ellipse(x, y + 26, w / 2 + 4, 9, c["cream"], sw=3)

    def arm(self, sx, sy, ang, L=42, w=18, paw=True, prop=None, behind=False):
        """팔: 어깨 (sx,sy), 각도 ang(도, 0 = 아래, 양수 = 바깥쪽으로 들어 올림, 음수 = 안쪽). 끝에 발바닥.
        prop = 'mug'|'phone'|'paper'. 팔은 머리보다 나중에(앞에) 그린다 — behind=True 면 몸보다 뒤."""
        c = self.c
        saved = self.out
        if not behind:
            self.out = self.late
        side = -1 if sx < CX else 1
        a = math.radians(ang)
        ex, ey = sx + side * L * math.sin(a), sy + L * math.cos(a)
        self.line(sx, sy, ex, ey, sw=w + 5)
        self.line(sx, sy, ex, ey, sw=w, stroke=c["fur"])
        if paw:
            self.circle(ex, ey, w / 2 + 2, c["cream"], sw=3)
        if prop == "mug":
            self.path(f"M{fmt(ex - 12)},{fmt(ey - 10)} h24 v22 q0,6 -6,6 h-12 q-6,0 -6,-6 Z", "#FFFFFF")
            self.path(f"M{fmt(ex + 12)},{fmt(ey - 4)} q12,0 12,8 q0,8 -12,8", "none")
            self.path(f"M{fmt(ex - 9)},{fmt(ey - 10)} h18", "none", sw=2, stroke="#C98A4B")
        elif prop == "phone":
            self.path(f"M{fmt(ex - 10)},{fmt(ey - 14)} h20 q4,0 4,4 v26 q0,4 -4,4 h-20 q-4,0 -4,-4 v-26 q0,-4 4,-4 Z", "#2B2B2B", sw=2)
            self.path(f"M{fmt(ex - 8)},{fmt(ey - 10)} h16 v20 h-16 Z", "#8FD3FF", sw=0, stroke="none")
        elif prop == "paper":
            self.path(f"M{fmt(ex - 16)},{fmt(ey - 20)} h32 v40 h-32 Z", "#FFFFFF", sw=2)
            for k in range(3):
                self.line(ex - 10, ey - 12 + k * 10, ex + 10, ey - 12 + k * 10, sw=2, stroke="#B8B8B8")
        self.out = saved
        return ex, ey

    def body(self, x, y, rx=46, ry=40, back=False, sit=False):
        """몸통 = 가디건(마스크). 앞모습이면 가슴 크림 + 단추."""
        c = self.c
        chest = f"M{fmt(x - 16)},{fmt(y - ry + 4)} Q{fmt(x)},{fmt(y + 10)} {fmt(x + 16)},{fmt(y - ry + 4)} L{fmt(x + 14)},{fmt(y + ry - 10)} L{fmt(x - 14)},{fmt(y + ry - 10)} Z"
        if self.key:
            # 마스크: 가디건(타원)에서 가슴(크림)을 뺀 모양 — 가슴은 프로젝트 색으로 물들지 않게
            ell = f"M{fmt(x - rx)},{fmt(y)} a{fmt(rx)},{fmt(ry)} 0 1,0 {fmt(2*rx)},0 a{fmt(rx)},{fmt(ry)} 0 1,0 {fmt(-2*rx)},0 Z"
            self.shape(f'<path d="{ell} {"" if back else chest}" fill="#FFFFFF" fill-rule="evenodd" stroke="none"/>', True)
            return
        self.ellipse(x, y, rx, ry, c["fur"])
        if not back:
            self.path(chest, c["cream"], sw=2.5)
            for k in range(2):
                self.circle(x, y + 2 + k * 14, 3, c["ink"], sw=0, stroke="none")
        else:
            self.line(x, y - ry + 8, x, y + ry - 8, sw=2.5)

    def head(self, x, y, r=56, face="front", eyes="open", mouth="smile", tilt=0, cap=True, blush=True):
        """머리. face = front|left|right|back. eyes = open|happy|closed|wink. mouth = smile|open|o|flat"""
        c = self.c
        self.out.append(f'<g transform="rotate({fmt(tilt)} {fmt(x)} {fmt(y)})">')   # 마스크도 같이 기울인다
        # 귀(머리 뒤)
        for side in (-1, 1):
            ex = x + side * r * 0.72
            ey = y - r * 0.68
            self.path(f"M{fmt(ex - 14*side)},{fmt(ey + 16)} L{fmt(ex + 4*side)},{fmt(ey - 20)} L{fmt(ex + 16*side)},{fmt(ey + 14)} Z", c["fur2"])
            self.path(f"M{fmt(ex - 7*side)},{fmt(ey + 13)} L{fmt(ex + 3*side)},{fmt(ey - 8)} L{fmt(ex + 10*side)},{fmt(ey + 12)} Z", c["cheek"], sw=0, stroke="none")
        # 솜뭉치 머리
        self.path(self.fluff_ring(x, y, r), c["fur"])
        if c.get("mask"):                       # 머리 위·양 볼의 진한 무늬(마스크) — 얼굴 크림 부분보다 아래에
            self.path(f"M{fmt(x - r*0.98)},{fmt(y + r*0.2)} Q{fmt(x - r*0.9)},{fmt(y - r*0.9)} {fmt(x)},{fmt(y - r*0.98)} Q{fmt(x + r*0.9)},{fmt(y - r*0.9)} {fmt(x + r*0.98)},{fmt(y + r*0.2)} Q{fmt(x + r*0.5)},{fmt(y + r*0.05)} {fmt(x)},{fmt(y + r*0.1)} Q{fmt(x - r*0.5)},{fmt(y + r*0.05)} {fmt(x - r*0.98)},{fmt(y + r*0.2)} Z", c["mask"], sw=0, stroke="none")
            if c.get("blaze") and face != "back":   # 이마 흰 줄
                self.path(f"M{fmt(x - 9)},{fmt(y - r*0.98)} L{fmt(x + 9)},{fmt(y - r*0.98)} L{fmt(x + 5)},{fmt(y + r*0.12)} L{fmt(x - 5)},{fmt(y + r*0.12)} Z", c["blaze"], sw=0, stroke="none")
        if face != "back":
            fx = x + (0 if face == "front" else (-14 if face == "left" else 14))
            # 얼굴 크림 부분
            self.ellipse(fx, y + r * 0.22, r * 0.62, r * 0.5, c["cream"], sw=0, stroke="none")
            # 눈
            for side in (-1, 1):
                ex = fx + side * r * 0.34
                ey = y - r * 0.04
                if eyes == "open" or (eyes == "wink" and side == -1):
                    self.ellipse(ex, ey, 7.5, 9.5, c["ink"], sw=0, stroke="none")
                    self.circle(ex - 2.5, ey - 3, 2.6, "#FFFFFF", sw=0, stroke="none")
                elif eyes == "happy":
                    self.path(f"M{fmt(ex - 8)},{fmt(ey + 3)} Q{fmt(ex)},{fmt(ey - 9)} {fmt(ex + 8)},{fmt(ey + 3)}", "none", sw=3.5)
                else:  # closed / wink other eye
                    self.path(f"M{fmt(ex - 8)},{fmt(ey)} Q{fmt(ex)},{fmt(ey + 6)} {fmt(ex + 8)},{fmt(ey)}", "none", sw=3.5)
            # 코·입
            ny = y + r * 0.3
            self.ellipse(fx, ny, 7, 5.5, c["nose"], sw=0, stroke="none")
            if mouth == "smile":
                self.path(f"M{fmt(fx - 9)},{fmt(ny + 7)} Q{fmt(fx - 2)},{fmt(ny + 15)} {fmt(fx)},{fmt(ny + 8)} Q{fmt(fx + 2)},{fmt(ny + 15)} {fmt(fx + 9)},{fmt(ny + 7)}", "none", sw=2.5)
                if c.get("tongue"):             # 혀 쏙
                    self.path(f"M{fmt(fx - 4)},{fmt(ny + 11)} Q{fmt(fx)},{fmt(ny + 22)} {fmt(fx + 4)},{fmt(ny + 11)} Z", "#F08A9B", sw=2)
            elif mouth == "open":
                self.path(f"M{fmt(fx - 9)},{fmt(ny + 7)} Q{fmt(fx)},{fmt(ny + 24)} {fmt(fx + 9)},{fmt(ny + 7)} Z", "#8C3B3B", sw=2.5)
                self.path(f"M{fmt(fx - 5)},{fmt(ny + 14)} Q{fmt(fx)},{fmt(ny + 22)} {fmt(fx + 5)},{fmt(ny + 14)} Z", "#F28B8B", sw=0, stroke="none")
            elif mouth == "o":
                self.ellipse(fx, ny + 12, 5, 6, "#8C3B3B", sw=2.5)
            else:
                self.line(fx - 7, ny + 9, fx + 7, ny + 9, sw=2.5)
            if blush:
                for side in (-1, 1):
                    self.ellipse(fx + side * r * 0.5, y + r * 0.26, 7, 4.5, c["cheek"], sw=0, stroke="none")
        # 모자(마스크) — 캡: 머리 윗부분 돔 + 챙
        if cap:
            ty = y - r * 0.55
            if face == "back":
                self.path(f"M{fmt(x - r*0.95)},{fmt(ty + 8)} Q{fmt(x)},{fmt(y - r*1.32)} {fmt(x + r*0.95)},{fmt(ty + 8)} Q{fmt(x)},{fmt(ty + 20)} {fmt(x - r*0.95)},{fmt(ty + 8)} Z", c["fur"], key=True)
                self.circle(x, y - r * 1.05, 5, c["fur"], key=True)
            else:
                visor = -1 if face != "right" else 1
                self.path(f"M{fmt(x - r*0.95)},{fmt(ty + 8)} Q{fmt(x)},{fmt(y - r*1.32)} {fmt(x + r*0.95)},{fmt(ty + 8)} Q{fmt(x)},{fmt(ty + 22)} {fmt(x - r*0.95)},{fmt(ty + 8)} Z", c["fur"], key=True)
                vx = x + visor * r * 0.95
                self.path(f"M{fmt(vx)},{fmt(ty + 6)} Q{fmt(vx + visor*34)},{fmt(ty + 8)} {fmt(vx + visor*30)},{fmt(ty + 20)} Q{fmt(vx + visor*10)},{fmt(ty + 18)} {fmt(x + visor*r*0.3)},{fmt(ty + 16)} Z", c["fur"], key=True)
                self.circle(x, y - r * 1.08, 5, c["fur"], key=True)
        self.out.append("</g>")

    # ---------- 자세 ----------
    def pose(self, name, t=0.0):
        c = self.c
        P = {}
        # 기준 좌표(서 있는 앞모습)
        hy, by, ly = 118, 200, 234      # 머리·몸·다리 윗점
        if name == "stand":
            self.tail(152, 198); self.leg(94, ly); self.leg(126, ly)
            self.body(CX, by); self.arm(70, 182, 8); self.arm(150, 182, -8)
            self.head(CX, hy, face="left")
        elif name in ("talk", "laugh", "wave", "think", "stretch", "cheer", "scratch", "sip", "mug", "phone",
                      "phScroll", "phText", "phLol"):
            self.tail(152, 198); self.leg(94, ly); self.leg(126, ly)
            self.body(CX, by)
            if name == "talk":
                self.arm(70, 182, 10); self.arm(150, 182, 100); self.head(CX, hy, face="right", mouth="open")
            elif name == "laugh":
                self.arm(70, 182, 45); self.arm(150, 182, 45); self.head(CX, hy, eyes="happy", mouth="open", tilt=-6)
            elif name == "wave":
                self.arm(70, 182, 10); self.arm(150, 182, 150); self.head(CX, hy, eyes="happy", mouth="smile")
            elif name == "think":
                self.arm(70, 182, 10); self.arm(150, 182, -140, L=38); self.head(CX, hy, face="right", mouth="flat", tilt=5)
            elif name == "stretch":
                self.arm(70, 182, 165); self.arm(150, 182, 165); self.head(CX, hy, eyes="closed", mouth="open", tilt=0)
            elif name == "cheer":
                self.arm(70, 182, 150); self.arm(150, 182, 150); self.head(CX, hy - 4, eyes="happy", mouth="open")
            elif name == "scratch":
                self.arm(70, 182, 10); self.arm(150, 182, 160, L=40); self.head(CX, hy, eyes="wink", mouth="flat", tilt=-8)
            elif name in ("sip", "mug"):
                self.arm(70, 182, 10); self.arm(150, 182, -115, L=38, prop="mug")
                self.head(CX, hy, eyes="closed" if name == "sip" else "open", mouth="o" if name == "sip" else "smile")
            elif name in ("phone", "phScroll", "phText", "phLol"):
                self.arm(70, 182, -75 if name == "phText" else 10, L=38); self.arm(150, 182, -80, L=38, prop="phone")
                self.head(CX, hy, eyes="happy" if name == "phLol" else "open", mouth="open" if name == "phLol" else "smile", tilt=10)
        elif name == "standBack":
            self.leg(94, ly); self.leg(126, ly)
            self.body(CX, by, back=True); self.arm(70, 182, 10); self.arm(150, 182, 10); self.tail(136, 214)
            self.head(CX, hy, face="back")
        elif name in ("sitFront", "sitScroll", "sitText", "sitLol", "sofaTalk"):
            by2, hy2 = 218, 140
            self.tail(154, 220)
            self.leg_sit(92, 236); self.leg_sit(128, 236)
            self.body(CX, by2, rx=48, ry=36)
            if name == "sitFront":
                self.arm(68, 206, 20, L=36); self.arm(152, 206, 20, L=36); self.head(CX, hy2)
            elif name == "sofaTalk":
                self.arm(68, 206, 20, L=36); self.arm(152, 206, 110, L=36); self.head(CX, hy2, face="right", mouth="open")
            else:
                self.arm(68, 206, -80 if name == "sitText" else 20, L=34); self.arm(152, 206, -80, L=34, prop="phone")
                self.head(CX, hy2, eyes="happy" if name == "sitLol" else "open", mouth="open" if name == "sitLol" else "smile", tilt=8)
        elif name in ("sitBack", "sitBackPhone"):
            by2, hy2 = 214, 136
            # 팔이 앞(책상)으로 — 등 뒤에서 보면 양옆으로 조금 보인다(몸 뒤에)
            self.arm(66, 204, 30, L=30, behind=True); self.arm(154, 204, 30, L=30, behind=True)
            self.body(CX, by2, rx=48, ry=36, back=True)
            self.tail(CX + 14, 246, front=True)
            self.head(CX, hy2, face="back")
        elif name.startswith("step"):          # 걷기 8장: t ∈ [0,1)
            back = name[4] == "B"
            ph = 2 * math.pi * t
            sw = 14 * math.sin(ph)
            bob = 3 * abs(math.cos(ph))
            self.tail(152 if not back else 134, 198 - bob + (0 if not back else 16))
            self.leg(94, ly - bob, dx=sw, kick=0); self.leg(126, ly - bob, dx=-sw)
            self.body(CX, by - bob, back=back)
            self.arm(70, 182 - bob, 10 + 18 * math.sin(ph)); self.arm(150, 182 - bob, 10 - 18 * math.sin(ph))
            self.head(CX, hy - bob, face="back" if back else "left", tilt=2 * math.sin(ph))
        elif name.startswith("m"):            # 꼬마(서브에이전트) — 같은 그림, 자세만
            if name == "mStand":
                self.tail(152, 198); self.leg(94, ly); self.leg(126, ly); self.body(CX, by); self.arm(70, 182, 10); self.arm(150, 182, 10); self.head(CX, hy)
            elif name == "mBye":
                self.tail(152, 198); self.leg(94, ly); self.leg(126, ly); self.body(CX, by); self.arm(70, 182, 10); self.arm(150, 182, 155); self.head(CX, hy, eyes="happy")
            elif name == "mJump":
                self.tail(152, 186); self.leg(94, ly - 14, h=34); self.leg(126, ly - 14, h=34); self.body(CX, by - 12); self.arm(70, 170, 150); self.arm(150, 170, 150); self.head(CX, hy - 14, eyes="happy", mouth="open")
            elif name == "mSide":
                self.tail(140, 200); self.leg(100, ly); self.leg(122, ly); self.body(CX, by, rx=40); self.arm(100, 182, 10); self.head(CX, hy, face="right")
            elif name == "mBow":
                self.tail(152, 200); self.leg(94, ly); self.leg(126, ly); self.body(CX, by + 4, ry=36); self.arm(70, 186, 30); self.arm(150, 186, 30); self.head(CX - 6, hy + 22, eyes="closed", mouth="smile", tilt=-18)
            elif name in ("mWalk", "mWalk2", "mBack", "mBack2"):
                back = name.startswith("mBack"); s = 10 if name.endswith("2") else -10
                self.tail(152 if not back else 134, 198 + (0 if not back else 16)); self.leg(94, ly, dx=s); self.leg(126, ly, dx=-s)
                self.body(CX, by, back=back); self.arm(70, 182, 10 + s * 1.5); self.arm(150, 182, 10 - s * 1.5); self.head(CX, hy, face="back" if back else "left")
        elif name == "blank":
            pass
        else:
            raise KeyError(name)

    def svg(self):
        return f'<svg xmlns="http://www.w3.org/2000/svg" width="{CW}" height="{CH}" viewBox="0 0 {CW} {CH}">' + "".join(self.out) + "".join(self.late) + "</svg>"

# ---------- 시트 배치 (docs/SPRITES.md · web/office-view.js POSES) ----------
SHEETS = {
    "":      ["stand", "stand", "stand", "sitBack", "sitFront", "mug", "stand", "stand"],
    "2":     ["stand", "talk", "laugh", "sip", "wave", "think", "phone", "stretch"],
    "3":     ["stand", "stand", "stand", "standBack", "stand", "cheer", "scratch", "sofaTalk"],
    "mini":  ["mStand", "mStand", "mStand", "mBye", "mJump", "mSide", "mBow", "mStand"],
    "phone": ["stand", "phScroll", "phText", "phLol", "sitScroll", "sitText", "sitBackPhone", "sitLol"],
    "walk":  [("stepF", i / 8) for i in range(8)] + [("stepB", i / 8) for i in range(8)] + ["mWalk", "mWalk2", "mBack", "mBack2"],
}

def cell_svg(breed, item, key):
    d = Dog(breed, key)
    if isinstance(item, tuple):
        d.pose(item[0] + "0", t=item[1])
    else:
        d.pose(item)
    return d.svg()

def render_sheets(breed, out_dir, preview=None):
    from playwright.sync_api import sync_playwright
    from PIL import Image
    import io
    out_dir = Path(out_dir); out_dir.mkdir(parents=True, exist_ok=True)
    chrome = os.environ.get("CHROME_PATH")
    heights = {}
    with sync_playwright() as p:
        kw = {"args": ["--no-sandbox"]}
        if chrome:
            kw["executable_path"] = chrome
        b = p.chromium.launch(**kw)
        pg = b.new_page(viewport={"width": 4400, "height": CH}, device_scale_factor=1)
        for tail, items in SHEETS.items():
            n = len(items)
            for key in (False, True):
                cells = "".join(f'<div style="width:{CW}px;height:{CH}px;display:inline-block">{cell_svg(breed, it, key)}</div>' for it in items)
                pg.set_content(f'<body style="margin:0;background:transparent;white-space:nowrap;line-height:0">{cells}</body>')
                png = pg.screenshot(omit_background=True, clip={"x": 0, "y": 0, "width": CW * n, "height": CH})
                im = Image.open(io.BytesIO(png)).convert("RGBA")
                name = f"{breed}{tail}{'-key' if key else ''}.webp"
                im.save(out_dir / name, "WEBP", lossless=True)
                if not key:
                    hs = []
                    for i in range(n):
                        cell = im.crop((i * CW, 0, (i + 1) * CW, CH))
                        bbox = cell.getchannel("A").getbbox()
                        hs.append(bbox[3] - bbox[1] if bbox else 0)
                    heights[tail] = hs
        b.close()
    return heights

def stand_px(h):
    return h[""][0]

def update_atlas(atlas_file, breed, heights, stride):
    src = Path(atlas_file).read_text(encoding="utf-8")
    m = re.search(r"heights: (\{.*?\}),\n", src, re.S)
    hs = json.loads(m.group(1))
    stand = stand_px(heights)
    for tail, arr in heights.items():
        hs[f"{breed}{tail}"] = [round(v / stand, 3) for v in arr]
    src = src[:m.start(1)] + json.dumps(hs) + src[m.end(1):]
    m2 = re.search(r"strides: (\{.*?\}),\n", src, re.S)
    st = json.loads(m2.group(1)); st[breed] = stride
    src = src[:m2.start(1)] + json.dumps(st) + src[m2.end(1):]
    Path(atlas_file).write_text(src, encoding="utf-8")
    return stand

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--breed", default="pome")
    ap.add_argument("--out", default="web/office")
    ap.add_argument("--atlas", default="web/office-atlas.js")
    ap.add_argument("--stride", type=float, default=6.4)
    a = ap.parse_args()
    heights = render_sheets(a.breed, a.out)
    stand = update_atlas(a.atlas, a.breed, heights, a.stride)
    print(f"{a.breed}: stand {stand}px, sheets {list(heights)}")

if __name__ == "__main__":
    main()
