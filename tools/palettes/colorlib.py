"""Colour measurement for the Hymnoi palette sheet.

sRGB <-> CIELAB (D65), CIEDE2000, WCAG 2 contrast, Machado et al. (2009)
colour-vision-deficiency simulation (severity 1.0), and a CMYK round trip
through the ISO Coated v2 (FOGRA39) ICC profile with littleCMS via PIL.
No dependencies beyond numpy and Pillow.
"""
import math
import numpy as np
from PIL import Image, ImageCms

PAPER = "#faf6ec"
INK = "#221d17"
KINDS = ["god", "nymph", "hero", "mortal", "group", "creature", "place"]

FOGRA39 = "/usr/share/color/icc/ISOcoated_v2_bas.ICC"   # ISO Coated v2 = FOGRA39
PSO_V3 = "/usr/share/color/icc/PSO_Coated_NPscreen_ISO12647_bas.ICC"  # FOGRA43-ish, a check


def hex2rgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], float) / 255


def rgb2hex(c):
    c = np.clip(np.round(np.asarray(c) * 255), 0, 255).astype(int)
    return "#%02x%02x%02x" % tuple(c)


def lin(c):
    c = np.asarray(c, float)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def delin(c):
    c = np.clip(np.asarray(c, float), 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


M_XYZ = np.array([[0.4124564, 0.3575761, 0.1804375],
                  [0.2126729, 0.7151522, 0.0721750],
                  [0.0193339, 0.1191920, 0.9503041]])
WHITE = M_XYZ @ np.ones(3)


def rgb2lab(c):
    xyz = M_XYZ @ lin(c) / WHITE
    f = np.where(xyz > (6 / 29) ** 3, np.cbrt(xyz), xyz / (3 * (6 / 29) ** 2) + 4 / 29)
    return np.array([116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])])


def lab2rgb(lab):
    L, a, b = lab
    fy = (L + 16) / 116
    f = np.array([fy + a / 500, fy, fy - b / 200])
    xyz = np.where(f > 6 / 29, f ** 3, 3 * (6 / 29) ** 2 * (f - 4 / 29)) * WHITE
    return delin(np.linalg.solve(M_XYZ, xyz))


def lch(lab):
    return lab[0], math.hypot(lab[1], lab[2]), math.degrees(math.atan2(lab[2], lab[1])) % 360


def de2000(lab1, lab2):
    L1, a1, b1 = lab1
    L2, a2, b2 = lab2
    C1, C2 = math.hypot(a1, b1), math.hypot(a2, b2)
    Cb = (C1 + C2) / 2
    G = 0.5 * (1 - math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)))
    a1p, a2p = (1 + G) * a1, (1 + G) * a2
    C1p, C2p = math.hypot(a1p, b1), math.hypot(a2p, b2)
    h1p = math.degrees(math.atan2(b1, a1p)) % 360 if C1p else 0
    h2p = math.degrees(math.atan2(b2, a2p)) % 360 if C2p else 0
    dLp, dCp = L2 - L1, C2p - C1p
    if C1p * C2p == 0:
        dhp = 0
    else:
        dhp = h2p - h1p
        if dhp > 180: dhp -= 360
        elif dhp < -180: dhp += 360
    dHp = 2 * math.sqrt(C1p * C2p) * math.sin(math.radians(dhp / 2))
    Lbp, Cbp = (L1 + L2) / 2, (C1p + C2p) / 2
    if C1p * C2p == 0:
        hbp = h1p + h2p
    elif abs(h1p - h2p) <= 180:
        hbp = (h1p + h2p) / 2
    else:
        hbp = (h1p + h2p + 360) / 2 if h1p + h2p < 360 else (h1p + h2p - 360) / 2
    T = (1 - 0.17 * math.cos(math.radians(hbp - 30)) + 0.24 * math.cos(math.radians(2 * hbp))
         + 0.32 * math.cos(math.radians(3 * hbp + 6)) - 0.20 * math.cos(math.radians(4 * hbp - 63)))
    dth = 30 * math.exp(-((hbp - 275) / 25) ** 2)
    Rc = 2 * math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7))
    Sl = 1 + 0.015 * (Lbp - 50) ** 2 / math.sqrt(20 + (Lbp - 50) ** 2)
    Sc = 1 + 0.045 * Cbp
    Sh = 1 + 0.015 * Cbp * T
    Rt = -math.sin(math.radians(2 * dth)) * Rc
    return math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2
                     + Rt * (dCp / Sc) * (dHp / Sh))


def de(h1, h2):
    return de2000(rgb2lab(hex2rgb(h1)), rgb2lab(hex2rgb(h2)))


def luminance(h):
    return float(np.array([0.2126, 0.7152, 0.0722]) @ lin(hex2rgb(h)))


def contrast(h1, h2=PAPER):
    a, b = sorted([luminance(h1), luminance(h2)])
    return (b + 0.05) / (a + 0.05)


# Machado, Oliveira & Fernandes (2009), severity 1.0, applied to linear RGB.
MACHADO = {
    "deutan": np.array([[0.367322, 0.860646, -0.227968],
                        [0.280085, 0.672501, 0.047413],
                        [-0.011820, 0.042940, 0.968881]]),
    "protan": np.array([[0.152286, 1.052583, -0.204868],
                        [0.114503, 0.786281, 0.099216],
                        [-0.003882, -0.048116, 1.051998]]),
    "tritan": np.array([[1.255528, -0.076749, -0.178779],
                        [-0.078411, 0.930809, 0.147602],
                        [0.004733, 0.691367, 0.303900]]),
}


def simulate(h, kind):
    if kind == "normal":
        return h
    return rgb2hex(delin(MACHADO[kind] @ lin(hex2rgb(h))))


def min_pair(colors, kind="normal"):
    """colors: dict kind->hex. Returns (min dE, (k1, k2)) and the sorted pair list."""
    sim = {k: rgb2lab(hex2rgb(simulate(v, kind))) for k, v in colors.items()}
    ks = list(colors)
    pairs = sorted((de2000(sim[a], sim[b]), a, b) for i, a in enumerate(ks) for b in ks[i + 1:])
    return pairs


# ---- print: sRGB -> CMYK (FOGRA39, relative colorimetric) -> sRGB ----
_srgb = ImageCms.createProfile("sRGB")
_tf = {}


def _transforms(profile):
    if profile not in _tf:
        cmyk = ImageCms.getOpenProfile(profile)
        RC = ImageCms.Intent.RELATIVE_COLORIMETRIC
        _tf[profile] = (ImageCms.buildTransform(_srgb, cmyk, "RGB", "CMYK", RC),
                        ImageCms.buildTransform(cmyk, _srgb, "CMYK", "RGB", RC))
    return _tf[profile]


def cmyk_roundtrip(h, profile=FOGRA39):
    fwd, back = _transforms(profile)
    rgb = tuple(int(round(x * 255)) for x in hex2rgb(h))
    im = Image.new("RGB", (1, 1), rgb)
    c = ImageCms.applyTransform(im, fwd)
    cmyk = c.getpixel((0, 0))
    r = ImageCms.applyTransform(c, back).getpixel((0, 0))
    rt = "#%02x%02x%02x" % r
    return [round(v / 2.55) for v in cmyk], rt, de(h, rt)


if __name__ == "__main__":
    # Sharma, Wu & Dalal (2005) test pairs 1, 7, 17, 25 -> 2.0425, 2.3669, 27.1492, 1.2644
    for p, want in [(((50, 2.6772, -79.7751), (50, 0, -82.7485)), 2.0425),
                    (((50, 0, 0), (50, -1, 2)), 2.3669),
                    (((50, 2.5, 0), (73, 25, -18)), 27.1492),
                    (((60.2574, -34.0099, 36.2677), (60.4626, -34.1751, 39.4387)), 1.2644)]:
        print(round(de2000(*p), 4), want)
    print(rgb2lab(hex2rgb("#ff0000")), contrast("#767676", "#ffffff"))
    print(cmyk_roundtrip("#00ff00"), cmyk_roundtrip("#b0412e"))
