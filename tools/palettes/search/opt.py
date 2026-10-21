import sys, math
import os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))  # colorlib.py
import numpy as np
from colorlib import *
from scipy.optimize import differential_evolution

D = np.load('/home/danenberg/tmp/hymnoi_gamut64.npy')
N = D.shape[0]


def rgb2lab_v(c):
    l = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    xyz = l @ M_XYZ.T / WHITE
    f = np.where(xyz > (6 / 29) ** 3, np.cbrt(xyz), xyz / (3 * (6 / 29) ** 2) + 4 / 29)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def de2000_v(l1, l2):
    L1, a1, b1 = np.moveaxis(l1, -1, 0); L2, a2, b2 = np.moveaxis(l2, -1, 0)
    C1 = np.hypot(a1, b1); C2 = np.hypot(a2, b2); Cb = (C1 + C2) / 2
    G = 0.5 * (1 - np.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)))
    a1p = (1 + G) * a1; a2p = (1 + G) * a2
    C1p = np.hypot(a1p, b1); C2p = np.hypot(a2p, b2)
    h1p = np.degrees(np.arctan2(b1, a1p)) % 360; h2p = np.degrees(np.arctan2(b2, a2p)) % 360
    dLp = L2 - L1; dCp = C2p - C1p
    dhp = h2p - h1p; dhp = np.where(dhp > 180, dhp - 360, np.where(dhp < -180, dhp + 360, dhp)); dhp = np.where(C1p * C2p == 0, 0, dhp)
    dHp = 2 * np.sqrt(C1p * C2p) * np.sin(np.radians(dhp / 2))
    Lbp = (L1 + L2) / 2; Cbp = (C1p + C2p) / 2
    hs = h1p + h2p
    hbp = np.where(np.abs(h1p - h2p) <= 180, hs / 2, np.where(hs < 360, (hs + 360) / 2, (hs - 360) / 2)); hbp = np.where(C1p * C2p == 0, hs, hbp)
    T = 1 - 0.17 * np.cos(np.radians(hbp - 30)) + 0.24 * np.cos(np.radians(2 * hbp)) + 0.32 * np.cos(np.radians(3 * hbp + 6)) - 0.20 * np.cos(np.radians(4 * hbp - 63))
    dth = 30 * np.exp(-((hbp - 275) / 25) ** 2); Rc = 2 * np.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7))
    Sl = 1 + 0.015 * (Lbp - 50) ** 2 / np.sqrt(20 + (Lbp - 50) ** 2); Sc = 1 + 0.045 * Cbp; Sh = 1 + 0.015 * Cbp * T
    Rt = -np.sin(np.radians(2 * dth)) * Rc
    return np.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh))


SIMS = np.stack([np.eye(3), MACHADO['deutan'], MACHADO['protan'], MACHADO['tritan']])
I, J = np.triu_indices(7, 1)
PAPER_LAB = rgb2lab(hex2rgb(PAPER))


def lch2rgb(x):  # x (7,3) L C h -> linear rgb (7,3), unclipped
    L, C, h = x.T
    a, b = C * np.cos(np.radians(h)), C * np.sin(np.radians(h))
    fy = (L + 16) / 116
    f = np.stack([fy + a / 500, fy, fy - b / 200], -1)
    xyz = np.where(f > 6 / 29, f ** 3, 3 * (6 / 29) ** 2 * (f - 4 / 29)) * WHITE
    return xyz @ np.linalg.inv(M_XYZ).T


def evaluate(x):
    x = np.asarray(x).reshape(7, 3)
    rl = lch2rgb(x)
    oog = np.sum(np.clip(-rl, 0, None) + np.clip(rl - 1, 0, None))
    rl = np.clip(rl, 0, 1)
    srgb = np.where(rl <= 0.0031308, rl * 12.92, 1.055 * rl ** (1 / 2.4) - 0.055)
    srgb = np.round(srgb * 255) / 255
    lr = np.where(srgb <= 0.04045, srgb / 12.92, ((srgb + 0.055) / 1.055) ** 2.4)
    sim = np.clip(np.einsum('sij,kj->ski', SIMS, lr), 0, 1)
    s = np.where(sim <= 0.0031308, sim * 12.92, 1.055 * sim ** (1 / 2.4) - 0.055)
    lab = rgb2lab_v(s)  # (4,7,3)
    d = de2000_v(lab[:, I], lab[:, J])  # (4,21)
    idx = np.round(srgb * (N - 1)).astype(int)
    gam = D[idx[:, 0], idx[:, 1], idx[:, 2]]
    dpaper = de2000_v(lab[0], np.broadcast_to(PAPER_LAB, (7, 3)))
    return srgb, lab[0], d, gam, dpaper, oog


def to_hex(x):
    srgb = evaluate(x)[0]
    return [rgb2hex(c) for c in srgb]


def make_objective(targets=(20, 10, 10, 10), anchor=None, w_anchor=0.0, gam_max=1.0, extra=None):
    T = np.array(targets, float)[:, None]
    def f(x):
        srgb, lab, d, gam, dpaper, oog = evaluate(x)
        r = d / T
        worst = r.min()
        soft = -np.log(np.sum(np.exp(-8 * r))) / 8   # soft-min across all pairs and visions
        pen = 50 * oog + 2 * np.sum(np.clip(gam - gam_max, 0, None))
        if extra: pen += extra(x.reshape(7, 3), lab, dpaper, d)
        if anchor is not None:
            pen += w_anchor * np.mean(de2000_v(lab, anchor))
        return -(worst + 0.5 * soft) + pen
    return f


KIX = {k: i for i, k in enumerate(KINDS)}


def hierarchy(x, lab, dpaper, d):
    """gods most chromatic and far from paper; places nearest paper but visible; all dots visible."""
    C = np.hypot(lab[:, 1], lab[:, 2])
    g, p = KIX['god'], KIX['place']
    pen = 0
    others = np.delete(C, g)
    pen += 0.3 * max(0, others.max() + 4 - C[g])         # god the most chromatic
    pen += 0.3 * max(0, 45 - dpaper[g])                   # god strong against paper
    pen += 0.3 * max(0, np.delete(dpaper, p).min() + 3 - dpaper[p])  # wait: place should be SMALLEST
    return pen


def hierarchy2(x, lab, dpaper, d):
    C = np.hypot(lab[:, 1], lab[:, 2])
    g, p = KIX['god'], KIX['place']
    pen = 0
    pen += 0.3 * max(0, np.delete(C, g).max() + 4 - C[g])
    pen += 0.3 * max(0, 45 - dpaper[g])
    pen += 0.3 * max(0, dpaper[p] + 3 - np.delete(dpaper, p).min())   # place nearest paper of all
    pen += 0.3 * max(0, 22 - dpaper[p])                                # but visible as a 3 px dot
    pen += 0.3 * max(0, C[p] - 26)                                      # and quiet
    return pen


def run(bounds, anchor_hex=None, w_anchor=0.0, seed=1, maxiter=400, extra=hierarchy2, init=None):
    anchor = None
    if anchor_hex:
        anchor = np.array([rgb2lab(hex2rgb(h)) for h in anchor_hex])
    f = make_objective(anchor=anchor, w_anchor=w_anchor, extra=extra)
    res = differential_evolution(f, bounds, seed=seed, maxiter=maxiter, popsize=20, tol=1e-8,
                                 polish=False, init=init if init is not None else 'latinhypercube')
    return res, to_hex(res.x)


def describe(hexes, name=''):
    P = dict(zip(KINDS, hexes))
    print('==', name, ' '.join(hexes))
    for k, v in P.items():
        L, C, H = lch(rgb2lab(hex2rgb(v)))
        cm, rt, dd = cmyk_roundtrip(v)
        print(f"  {k:9}{v} L{L:5.1f} C{C:5.1f} h{H:5.0f} cr{contrast(v):5.2f} dEpaper{de(v, PAPER):5.1f} rt{dd:5.2f} cmyk{cm}")
    for s in ['normal', 'deutan', 'protan', 'tritan']:
        pr = min_pair(P, s); print('  ', s, [(round(d, 1), a, b) for d, a, b in pr[:3]])


def hier_contrast(x, lab, dpaper, d):
    """god the farthest from paper of the six non-black kinds; place nearest; all visible."""
    g, p, c = KIX['god'], KIX['place'], KIX['creature']
    six = [i for i in range(7) if i not in (g, c)]
    pen = 0.3 * max(0, dpaper[six].max() + 3 - dpaper[g])
    pen += 0.3 * max(0, dpaper[p] + 3 - np.delete(dpaper, p).min())
    pen += 0.3 * max(0, 22 - dpaper[p])
    return pen


def bounds_around(hexes, dL=8, dC=12, dh=10):
    B = []
    for hx in hexes:
        L, C, h = lch(rgb2lab(hex2rgb(hx)))
        B += [(max(5, L - dL), min(95, L + dL)), (max(0, C - dC), C + dC), (h - dh, h + dh)]
    return B


PAPER_Y = luminance(PAPER)


def text_opt(fills, free, dh=15, seed=0, maxiter=200, target=4.6, worst_only=False):
    """fills: 7 hex. free: kinds whose text colour may change (L, C, h within dh of the fill hue).
    Maximise min dE over the seven text colours under the four visions, with contrast >= target."""
    base = np.array([lch(rgb2lab(hex2rgb(h))) for h in fills])
    fi = [KIX[k] for k in free]
    B = []
    for i in fi:
        L, C, h = base[i]
        B += [(10, 56), (0, max(C, 10) + 5), (h - dh, h + dh)]
    T = np.array([20, 10, 10, 10.])[:, None]

    def assemble(v):
        x = base.copy()
        x[fi] = np.asarray(v).reshape(-1, 3)
        return x

    def f(v):
        x = assemble(v)
        srgb, lab, d, gam, dpaper, oog = evaluate(x)
        lr = np.where(srgb <= 0.04045, srgb / 12.92, ((srgb + 0.055) / 1.055) ** 2.4)
        Y = lr @ np.array([0.2126, 0.7152, 0.0722])
        cr = (PAPER_Y + 0.05) / (Y + 0.05)
        r = d / T
        soft = -np.log(np.sum(np.exp(-8 * r))) / 8
        pen = 50 * oog + 2 * np.sum(np.clip(gam - 0.7, 0, None)) + 5 * np.sum(np.clip(target - cr, 0, None))
        return -(r.min() + 0.5 * soft) + pen

    res = differential_evolution(f, B, seed=seed, maxiter=maxiter, popsize=25, tol=1e-9, polish=False)
    return to_hex(assemble(res.x))


def text_opt2(fills, dh=12, cfrac=0.75, seed=0, maxiter=250, target=4.6, w_id=0.01):
    """All seven text colours free, but each keeps its fill's hue (+-dh) and >= cfrac of its chroma,
    so a label still reads as its dot. Contrast >= target on the paper."""
    base = np.array([lch(rgb2lab(hex2rgb(h))) for h in fills])
    B = []
    for L, C, h in base:
        B += [(10, min(L, 60)), (cfrac * C, C + 6), (h - dh, h + dh)]
    T = np.array([20, 10, 10, 10.])[:, None]
    fl = np.array([rgb2lab(hex2rgb(h)) for h in fills])

    def f(v):
        x = np.asarray(v).reshape(7, 3)
        srgb, lab, d, gam, dpaper, oog = evaluate(x)
        lr = np.where(srgb <= 0.04045, srgb / 12.92, ((srgb + 0.055) / 1.055) ** 2.4)
        Y = lr @ np.array([0.2126, 0.7152, 0.0722])
        cr = (PAPER_Y + 0.05) / (Y + 0.05)
        r = d / T
        soft = -np.log(np.sum(np.exp(-8 * r))) / 8
        pen = 50 * oog + 2 * np.sum(np.clip(gam - 0.7, 0, None)) + 5 * np.sum(np.clip(target - cr, 0, None))
        pen += w_id * np.mean(de2000_v(lab, fl))
        return -(r.min() + 0.5 * soft) + pen

    res = differential_evolution(f, B, seed=seed, maxiter=maxiter, popsize=20, tol=1e-9, polish=False)
    return to_hex(res.x)


def text_opt3(fills, pinned=(), **kw):
    """text_opt2 with some kinds held at their fill colour."""
    import opt as _o
    base = np.array([lch(rgb2lab(hex2rgb(h))) for h in fills])
    orig = _o.differential_evolution

    def de_pinned(f, B, **k):
        B = list(B)
        for kind in pinned:
            i = KIX[kind]
            for j in range(3):
                v = base[i][j]
                B[3 * i + j] = (v - 1e-6, v + 1e-6)
        return orig(f, B, **k)
    _o.differential_evolution = de_pinned
    try:
        return text_opt2(fills, **kw)
    finally:
        _o.differential_evolution = orig
