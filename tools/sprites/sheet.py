#!/usr/bin/env python3
"""AI 로 뽑은 3×3 캐릭터 격자 그림 → 사무실 스프라이트 시트(web/office/<종>*.webp + -key 마스크 + office-atlas.js).

사용법: python3 tools/sprites/sheet.py --breed pomesable 격자.png [--stride 6.4]
격자(프롬프트 순서): 1 정면 서기 · 2 뒷모습 · 3 책상 의자 뒷모습(쓰지 않음) · 4 소파 앉기(쓰지 않음) ·
                     5 걷기 A(왼쪽) · 6 걷기 B(왼쪽) · 7 손 흔들기 · 8 머그 · 9 휴대폰
배경은 단색(연회색)이어야 한다 — 테두리에서 번지는 채우기로 지운다. 흰 모자·후드티는 밝고 매끈한 부분으로 찾아 마스크로 쓴다.
"""
import argparse, json, re, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

CW, CH, GROUND, STAND_PX = 220, 280, 276, 228

def cut_bg(cell):
    """테두리에서 이어진 배경색 영역을 투명하게. 안쪽(후드 그림자 등)은 건드리지 않는다."""
    a = np.asarray(cell.convert("RGB")).astype(np.int16)
    h, w, _ = a.shape
    # 배경색 = 네 모서리 평균
    corners = np.concatenate([a[:8, :8].reshape(-1, 3), a[:8, -8:].reshape(-1, 3), a[-8:, :8].reshape(-1, 3), a[-8:, -8:].reshape(-1, 3)])
    bg = np.median(corners, axis=0)
    dist = np.abs(a - bg).sum(axis=2)
    near = dist < 42                                           # 배경과 비슷한 색
    lab, n = ndimage.label(near)
    edge_labels = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])))
    edge_labels.discard(0)
    bgmask = np.isin(lab, list(edge_labels))
    # 가장자리 부드럽게: 배경 가까운 정도로 알파를 조금 깎는다
    alpha = np.where(bgmask, 0, 255).astype(np.float32)
    soft = np.clip((dist - 20) / 40.0, 0, 1)                   # 배경색과 가까운 픽셀은 경계 근처에서 알파 낮춤
    ring = ndimage.binary_dilation(bgmask, iterations=2) & ~bgmask
    alpha[ring] = alpha[ring] * soft[ring]
    out = np.dstack([np.asarray(cell.convert("RGB")), alpha.astype(np.uint8)])
    return Image.fromarray(out, "RGBA")

def bbox(im):
    return im.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox()

def fit(sprite, scale, squash=1.0, dy=0, flip=False):
    """스프라이트를 scale 로 줄여 칸 가운데·발끝 GROUND 에 놓는다"""
    w, h = sprite.size
    im = sprite.resize((max(1, round(w * scale)), max(1, round(h * scale * squash))), Image.LANCZOS)
    if flip:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    cell = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
    b = bbox(im) or (0, 0, im.width, im.height)
    x = CW // 2 - (b[0] + b[2]) // 2
    y = GROUND - b[3] + dy
    cell.paste(im, (x, y), im)
    return cell

def key_mask(cell):
    """흰 모자·후드티 마스크 — 밝고(흰) 채도 낮고 매끈한(털이 아닌) 부분. 모자 띠(위 0~22%)와 후드 띠(42~80%)만 보고,
    운동화(아래)는 뺀다. 머그는 후드 띠에 걸리면 같이 물든다(상관없다)."""
    a = np.asarray(cell).astype(np.float32)
    alpha = a[..., 3] > 128
    rgb = a[..., :3]
    bright = rgb.min(axis=2) > 168
    sat = rgb.max(axis=2) - rgb.min(axis=2)
    gray = rgb.mean(axis=2)
    local_mean = ndimage.uniform_filter(gray, 5)
    local_sq = ndimage.uniform_filter(gray * gray, 5)
    std = np.sqrt(np.maximum(local_sq - local_mean ** 2, 0))
    m = alpha & bright & (sat < 36) & (std < 16)
    ys = np.where(alpha.any(axis=1))[0]
    band = np.zeros_like(m)
    if len(ys):
        top, bot = ys[0], ys[-1]
        H = bot - top
        band[int(top):int(top + H * 0.22), :] = True          # 모자
        band[int(top + H * 0.42):int(top + H * 0.80), :] = True   # 후드티(팔 포함)
    m &= band
    m = ndimage.binary_opening(m, iterations=1)
    m = ndimage.binary_closing(m, iterations=4)
    m = ndimage.binary_fill_holes(m)
    lab, n = ndimage.label(m)
    if n:
        sizes = ndimage.sum(m, lab, range(1, n + 1))
        keep = [i + 1 for i, s in enumerate(sizes) if s >= 150]
        m = np.isin(lab, keep)
    out = np.zeros((CH, CW, 4), np.uint8)
    out[..., :3] = 255
    out[..., 3] = (m * 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA").filter(ImageFilter.GaussianBlur(0.8))

def split_grid(path):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    cw, ch = w / 3, h / 3
    cells = []
    for r in range(3):
        for c in range(3):
            box = (int(c * cw) + 4, int(r * ch) + 4, int((c + 1) * cw) - 4, int((r + 1) * ch) - 4)
            cells.append(cut_bg(im.crop(box)))
    return cells

# 시트 배치(web/office-view.js POSES) → (격자 칸 번호 1~9, 세로 비율, 아래로 옮길 픽셀, 좌우 뒤집기)
SHEETS = {
    "":      [(1,), (1,), (1,), (2, 0.9), (1, 0.88), (8,), (1,), (1,)],                       # stand · sitBack · sitFront · mug
    "2":     [(1,), (7,), (7,), (8,), (7,), (9,), (9,), (7,)],                                 # talk laugh sip wave think phone stretch
    "3":     [(1,), (1,), (1,), (2,), (1,), (7,), (7,), (1, 0.88)],                            # standBack cheer scratch sofaTalk
    "mini":  [(1,), (1,), (1,), (7,), (7, 1.0, -12), (5,), (1,), (1,)],                        # mStand mBye mJump mSide mBow
    "phone": [(1,), (9,), (9,), (9,), (9, 0.88), (9, 0.88), (2, 0.9), (9, 0.88)],               # phScroll phText phLol sitScroll sitText sitBackPhone sitLol
    "walk":  [(5,), (5,), (5,), (5,), (6,), (6,), (6,), (6,),                                   # 앞걸음 8장(왼쪽 보기)
              (2,), (2,), (2,), (2,), (2,), (2,), (2,), (2,),                                   # 뒷걸음 8장(뒷모습)
              (5,), (6,), (2,), (2,)],                                                          # 꼬마 앞·뒤
}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("grid")
    ap.add_argument("--breed", required=True)
    ap.add_argument("--out", default="web/office")
    ap.add_argument("--atlas", default="web/office-atlas.js")
    ap.add_argument("--stride", type=float, default=6.4)
    ap.add_argument("--preview")
    a = ap.parse_args()
    cells = split_grid(a.grid)
    b1 = bbox(cells[0])
    scale = STAND_PX / (b1[3] - b1[1])
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    heights = {}
    for tail, items in SHEETS.items():
        n = len(items)
        sheet = Image.new("RGBA", (CW * n, CH), (0, 0, 0, 0))
        keys = Image.new("RGBA", (CW * n, CH), (0, 0, 0, 0))
        hs = []
        for i, it in enumerate(items):
            idx, squash, dy = it[0], (it[1] if len(it) > 1 else 1.0), (it[2] if len(it) > 2 else 0)
            cell = fit(cells[idx - 1], scale, squash, dy)
            sheet.paste(cell, (i * CW, 0))
            keys.paste(key_mask(cell), (i * CW, 0))
            bb = bbox(cell)
            hs.append(bb[3] - bb[1] if bb else 0)
        heights[tail] = hs
        sheet.save(out / f"{a.breed}{tail}.webp", "WEBP", quality=92)
        keys.save(out / f"{a.breed}{tail}-key.webp", "WEBP", lossless=True)
    # 아틀라스
    src = Path(a.atlas).read_text(encoding="utf-8")
    m = re.search(r"heights: (\{.*?\}),\n", src, re.S)
    hs = json.loads(m.group(1)); stand = heights[""][0]
    for tail, arr in heights.items():
        hs[f"{a.breed}{tail}"] = [round(v / stand, 3) for v in arr]
    src = src[:m.start(1)] + json.dumps(hs) + src[m.end(1):]
    m2 = re.search(r"strides: (\{.*?\}),\n", src, re.S)
    st = json.loads(m2.group(1)); st[a.breed] = a.stride
    src = src[:m2.start(1)] + json.dumps(st) + src[m2.end(1):]
    Path(a.atlas).write_text(src, encoding="utf-8")
    if a.preview:
        rows = [Image.open(out / f"{a.breed}{t}.webp").convert("RGBA") for t in ["", "2", "phone"]]
        rows.append(Image.open(out / f"{a.breed}-key.webp").convert("RGBA"))
        W = max(r.width for r in rows); H = sum(r.height for r in rows)
        pv = Image.new("RGBA", (W, H), (120, 130, 140, 255)); y = 0
        for r in rows: pv.paste(r, (0, y), r); y += r.height
        pv.resize((W // 2, H // 2)).save(a.preview)
    print(f"{a.breed}: stand {stand}px (scale {scale:.3f})")

if __name__ == "__main__":
    main()
