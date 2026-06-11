#!/usr/bin/env python3
"""
Ascend CRM — рендер кинематографичных scroll-кадров (1920x1080).

Три сцены в фирменном стиле Ascend Systems (тёплая янтарная лента на белом):
  hero — широкая шёлковая лента, диагональный поток (как лента Stripe);
  flow — разрозненные нити стекаются в единый упорядоченный поток;
  rise — лента-график восходит вверх к свету (Ascend = восхождение).

Использование:
  python3 tools/render_frames.py --scene all
  python3 tools/render_frames.py --scene hero --frames 120
  python3 tools/render_frames.py --scene hero --preview 0.35   # один кадр

Кадры можно заменить на нарезку из видео (например, Higgsfield 1080p):
  ffmpeg -i hero.mp4 -vf "fps=24,scale=1920:1080" -q:v 4 assets/frames/hero/hero_%04d.jpg
"""
import argparse
import math
import os
from multiprocessing import Pool

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H = 1920, 1080
SS = 1.5  # supersampling
SW, SH = int(W * SS), int(H * SS)

# Фирменная палитра Ascend: золото → янтарь → апельсин → глубокий оранж → роза
PALETTE = [
    (255, 210, 90),   # #ffd25a
    (255, 199, 46),   # #ffc72e
    (255, 158, 44),   # #ff9e2c
    (255, 122, 26),   # #ff7a1a
    (253, 164, 175),  # #fda4af (роза — для глубины перелива)
]


def palette(u):
    """Циклическая плавная палитра, u — любое число."""
    n = len(PALETTE)
    x = (u % 1.0) * n
    i = int(x) % n
    f = x - int(x)
    f = f * f * (3 - 2 * f)  # smoothstep
    a, b = PALETTE[i], PALETTE[(i + 1) % n]
    return tuple(int(a[k] + (b[k] - a[k]) * f) for k in range(3))


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def ease_in_out(x):
    return x * x * (3 - 2 * x)


def background(scene):
    """Белый фон с едва заметным тёплым свечением (как hero-bg на ascendsystems.ru)."""
    yy, xx = np.mgrid[0:SH, 0:SW].astype(np.float32)
    xn, yn = xx / SW, yy / SH
    img = np.full((SH, SW, 3), 255.0, dtype=np.float32)

    def warm_spot(cx, cy, rx, ry, strength, color=(251, 191, 36)):
        d = ((xn - cx) / rx) ** 2 + ((yn - cy) / ry) ** 2
        g = np.exp(-d) * strength
        for k in range(3):
            img[..., k] -= (255.0 - color[k]) * g

    if scene == "hero":
        warm_spot(0.85, 0.30, 0.55, 0.55, 0.060)
        warm_spot(0.10, 0.95, 0.50, 0.40, 0.030, color=(10, 10, 10))
    elif scene == "flow":
        warm_spot(0.70, 0.50, 0.60, 0.55, 0.045)
        warm_spot(0.05, 0.10, 0.45, 0.40, 0.025, color=(10, 10, 10))
    else:  # rise
        warm_spot(0.88, 0.16, 0.50, 0.45, 0.085)
        warm_spot(0.08, 0.92, 0.45, 0.40, 0.030, color=(10, 10, 10))

    np.clip(img, 0, 255, out=img)
    return Image.fromarray(img.astype(np.uint8), "RGB")


def make_lanes(n, seed):
    """Поперечные позиции нитей в ленте: сгущение к центру + случайные фазы."""
    rng = np.random.RandomState(seed)
    u = np.linspace(-1, 1, n) + rng.uniform(-0.012, 0.012, n)
    lanes = np.tanh(u * 1.7) / math.tanh(1.7)
    phases = rng.uniform(0, math.tau, n)
    speeds = rng.uniform(0.8, 1.25, n)
    hues = rng.uniform(-0.06, 0.06, n)
    return lanes, phases, speeds, hues


def thread_points(scene, lane, phase, speed, t, samples=210):
    """Точки одной нити (в нормализованных координатах 0..1, вход/выход за кадром)."""
    s = np.linspace(0.0, 1.0, samples)

    if scene == "hero":
        # Спайн: снизу-слева вверх-направо, мягкая S-кривая
        x = -0.08 + s * 1.16
        spine = 0.86 - 0.62 * ease_in_out(s) + 0.05 * np.sin(s * 2.4 + 0.6)
        width = 0.105 * (0.62 + 0.38 * np.sin(math.pi * np.clip(s * 1.06, 0, 1)))
        twist = np.cos(s * 5.2 + phase * 0.22 + t * math.tau * 1.0)
        off = lane * width * twist
        wave = (0.020 * np.sin(s * 9.0 + phase + t * math.tau * 2.0 * speed)
                + 0.011 * np.sin(s * 17.0 - phase * 1.4 + t * math.tau * 3.0))
        y = spine + off + wave * (0.45 + 0.55 * abs(lane))

    elif scene == "flow":
        x = -0.08 + s * 1.16
        rng_y = math.sin(phase * 3.1) * 0.34            # стартовый разброс по вертикали
        conv = smoothstep(0.18, 0.62 + 0.04 * math.sin(t * math.tau), s)
        spine = 0.52 - 0.10 * ease_in_out(s)
        start_y = 0.52 + rng_y
        base = start_y + (spine - start_y) * conv
        width = 0.085 * (0.55 + 0.45 * np.sin(math.pi * np.clip(s, 0, 1)))
        twist = np.cos(s * 6.0 + phase * 0.3 + t * math.tau)
        off = lane * width * (0.35 + 0.65 * conv) * twist
        calm = 1.0 - 0.72 * conv                          # волны утихают после слияния
        wave = (0.034 * np.sin(s * 7.5 + phase + t * math.tau * 2.2 * speed)
                + 0.016 * np.sin(s * 15.0 - phase + t * math.tau * 3.4)) * calm
        y = base + off + wave

    else:  # rise
        x = -0.08 + s * 1.16
        lift = 0.10 * ease_in_out(t)                      # к финалу хвост поднимается выше
        spine = 0.84 - (0.58 + lift) * ease_in_out(np.clip((s - 0.06) / 0.86, 0, 1)) ** 1.15
        width = 0.095 * (0.70 + 0.30 * np.sin(math.pi * np.clip(s, 0, 1))) * (1.0 - 0.35 * s)
        twist = np.cos(s * 4.6 + phase * 0.25 + t * math.tau * 0.9)
        off = lane * width * twist
        wave = (0.018 * np.sin(s * 8.0 + phase + t * math.tau * 1.8 * speed)
                + 0.009 * np.sin(s * 16.0 - phase * 1.2 + t * math.tau * 2.6))
        y = spine + off + wave * (0.5 + 0.5 * abs(lane))

    fade = np.ones_like(s)
    return x, y, fade


def render_frame(args):
    scene, t, out_path, seed, n_threads = args
    bg = background(scene)
    layer = Image.new("RGBA", (SW, SH), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)

    lanes, phases, speeds, hues = make_lanes(n_threads, seed)

    # Дальние (крайние) нити рисуем первыми — центральные лягут поверх
    order = np.argsort(-np.abs(lanes))
    chunk = 6
    for i in order:
        lane, phase, speed, hue = lanes[i], phases[i], speeds[i], hues[i]
        xs, ys, fade = thread_points(scene, lane, phase, speed, t)
        px, py = xs * SW, ys * SH
        edge = abs(lane)
        base_alpha = 0.92 - 0.55 * edge ** 1.6
        width_px = max(2, int(round((4.6 - 2.4 * edge) * SS)))
        lighten = 0.42 * edge ** 2                      # крайние нити — светлее (глубина)
        n = len(px)
        for j0 in range(0, n - 1, chunk):
            j1 = min(j0 + chunk, n - 1)
            mid = (j0 + j1) // 2
            a = base_alpha * float(fade[mid])
            if a < 0.02:
                continue
            u = 0.18 + xs[mid] * 0.5 + lane * 0.16 + hue + t * 0.22
            r, g, b = palette(u)
            r = int(r + (255 - r) * lighten)
            g = int(g + (255 - g) * lighten)
            b = int(b + (255 - b) * lighten)
            pts = list(zip(px[j0:j1 + 1], py[j0:j1 + 1]))
            draw.line(pts, fill=(r, g, b, int(a * 255)), width=width_px, joint="curve")

    # Мягкое свечение: размытая копия нитей под и поверх
    glow = layer.filter(ImageFilter.GaussianBlur(radius=11 * SS))
    glow_np = np.asarray(glow).astype(np.float32)
    glow_np[..., 3] *= 0.62
    glow = Image.fromarray(glow_np.astype(np.uint8), "RGBA")

    bg = bg.convert("RGBA")
    bg.alpha_composite(glow)
    bg.alpha_composite(layer)
    soft = bg.filter(ImageFilter.GaussianBlur(radius=0.6 * SS))
    bg = Image.blend(bg, soft, 0.35)

    final = bg.convert("RGB").resize((W, H), Image.LANCZOS)
    final.save(out_path, "JPEG", quality=74, optimize=True, progressive=True)
    return out_path


SCENES = {
    "hero": {"frames": 120, "seed": 11, "threads": 86},
    "flow": {"frames": 96, "seed": 23, "threads": 92},
    "rise": {"frames": 96, "seed": 37, "threads": 80},
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scene", default="all", choices=["all", *SCENES])
    ap.add_argument("--frames", type=int, default=0, help="переопределить число кадров")
    ap.add_argument("--out", default="assets/frames")
    ap.add_argument("--preview", type=float, default=None, help="отрендерить один кадр при t=X")
    ap.add_argument("--jobs", type=int, default=max(2, os.cpu_count() or 2))
    args = ap.parse_args()

    scenes = list(SCENES) if args.scene == "all" else [args.scene]
    tasks = []
    for sc in scenes:
        cfg = SCENES[sc]
        out_dir = os.path.join(args.out, sc)
        os.makedirs(out_dir, exist_ok=True)
        if args.preview is not None:
            tasks.append((sc, args.preview, os.path.join(out_dir, f"preview_{sc}.jpg"),
                          cfg["seed"], cfg["threads"]))
            continue
        total = args.frames or cfg["frames"]
        for f in range(total):
            t = f / (total - 1)
            name = os.path.join(out_dir, f"{sc}_{f:04d}.jpg")
            tasks.append((sc, t, name, cfg["seed"], cfg["threads"]))

    with Pool(args.jobs) as pool:
        for k, path in enumerate(pool.imap_unordered(render_frame, tasks), 1):
            if k % 20 == 0 or k == len(tasks):
                print(f"[{k}/{len(tasks)}] {path}", flush=True)


if __name__ == "__main__":
    main()
