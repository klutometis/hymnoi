#!/usr/bin/env python3
"""Measure the candidate palettes in site/palettes/*.css and write site/palettes/index.html.

    python3 site/palettes/build.py
    python3 -m http.server 8790        # from the repo root, then
    google-chrome --headless=new --screenshot=site/palettes/palettes.png \
        --window-size=1500,H http://localhost:8790/site/palettes/index.html

Everything in the sheet is computed here, from the CSS files, so the numbers
and the swatches cannot drift apart.
"""
import csv, html, math, pathlib, random, re
from collections import Counter
import numpy as np
from colorlib import (KINDS, PAPER, INK, hex2rgb, rgb2hex, rgb2lab, lch, de, contrast,
                      simulate, min_pair, cmyk_roundtrip, lin, delin, M_XYZ, WHITE, PSO_V3)

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
HERE = ROOT / 'site' / 'palettes'
VISIONS = ["normal", "deutan", "protan", "tritan"]
VNAME = {"normal": "normal vision", "deutan": "deuteranopia", "protan": "protanopia", "tritan": "tritanopia"}
TARGET = {"normal": 20, "deutan": 10, "protan": 10, "tritan": 10}
TEXT_MIN = 4.5

# order on the sheet; the first is the recommendation
ORDER = ["pigmenta", "tol-muted", "okabe-ito", "baseline"]
BLURB = {
    "pigmenta": "Greek pigments: cinnabar, verdigris, yellow ochre, Egyptian blue, murex purple, "
                "carbon black, green earth. Lightness and chroma tuned for colour-vision deficiency "
                "and the FOGRA39 gamut; hues kept inside each pigment's range.",
    "tol-muted": "Paul Tol's <i>muted</i> qualitative scheme (wine, teal, olive, rose, green, indigo, "
                 "pale cyan), each colour nudged ≤ 4.9 ΔE₀₀ to clear cream paper and coated stock.",
    "okabe-ito": "Okabe &amp; Ito's colour-universal-design set (vermillion, bluish green, orange, blue, "
                 "reddish purple, black, sky blue), nudged ≤ 8.1 ΔE₀₀ to fit FOGRA39 and the attention "
                 "hierarchy.",
    "baseline": "The placeholder in <code>site/palette.css</code>: terracotta, aegean teal, ochre, lapis, "
                "murex, black-figure, olive.",
}
SAMPLES = {"god": "Ἀπόλλων", "nymph": "Τελφοῦσα", "hero": "Ἡρακλῆς", "mortal": "Ἀγχίσης",
           "group": "Μοῦσαι", "creature": "Τυφάων", "place": "Δῆλος"}
COUNTS = Counter(r["kind"] for r in csv.DictReader(open(ROOT / "data/entities.csv")))


def parse_css(path):
    """The seven fills, and any 'text #rrggbb' named in a variable's comment."""
    vals, text = {}, {}
    for k, v, rest in re.findall(r"--([a-z]+):\s*(#[0-9a-fA-F]{6});([^\n]*)", path.read_text()):
        vals[k] = v.lower()
        t = re.search(r"text (#[0-9a-fA-F]{6})", rest)
        if t:
            text[k] = t.group(1).lower()
    assert list(vals) == KINDS, (path, list(vals))
    return vals, text


def lch2hex(L, C, h):
    a, b = C * math.cos(math.radians(h)), C * math.sin(math.radians(h))
    fy = (L + 16) / 116
    f = np.array([fy + a / 500, fy, fy - b / 200])
    xyz = np.where(f > 6 / 29, f ** 3, 3 * (6 / 29) ** 2 * (f - 4 / 29)) * WHITE
    rl = np.linalg.solve(M_XYZ, xyz)
    ok = bool(np.all(rl >= -1e-4) and np.all(rl <= 1 + 1e-4))
    return rgb2hex(delin(rl)), ok


def text_variant(hx, target=4.6):
    """Same hue, darkened in CIELAB until it reads at >= target:1 on the paper (chroma kept
    where sRGB allows, reduced where it does not). None if the fill already passes."""
    if contrast(hx) >= TEXT_MIN:
        return None
    L0, C0, h = lch(rgb2lab(hex2rgb(hx)))
    best = None
    L = L0
    while L > 5:
        C = C0
        while True:
            cand, ok = lch2hex(L, C, h)
            if ok or C <= 0:
                break
            C -= 0.5
        if contrast(cand) >= target:
            best = cand
            break
        L -= 0.25
    return best


def measure(P, given_text):
    m = {"colors": {}}
    for k, v in P.items():
        L, C, h = lch(rgb2lab(hex2rgb(v)))
        cmyk, rt, dE = cmyk_roundtrip(v)
        _, rt3, dE3 = cmyk_roundtrip(v, PSO_V3)
        # a text colour named in the CSS wins; otherwise darken the fill only if it fails
        tv = given_text.get(k) or text_variant(v)
        text = tv or v
        _, _, dEt = cmyk_roundtrip(text)
        m["colors"][k] = dict(hex=v, L=L, C=C, h=h, cr=contrast(v), dpaper=de(v, PAPER), cmyk=cmyk,
                              rt=rt, dE=dE, dE_pso=dE3, text=text, text_cr=contrast(text),
                              variant=tv is not None, dE_text=dEt)
    m["pairs"] = {s: min_pair(P, s) for s in VISIONS}
    T = {k: c["text"] for k, c in m["colors"].items()}
    m["text_pairs"] = {s: min_pair(T, s) for s in VISIONS}
    m["min_cr"] = min(c["cr"] for c in m["colors"].values())
    m["n_variants"] = sum(c["variant"] for c in m["colors"].values())
    m["max_dE"] = max(c["dE"] for c in m["colors"].values())
    m["max_dE_pso"] = max(c["dE_pso"] for c in m["colors"].values())
    cs = m["colors"]
    m["god_rank_C"] = 1 + sum(cs[k]["C"] > cs["god"]["C"] for k in KINDS if k != "god")
    m["place_rank_paper"] = 1 + sum(cs[k]["dpaper"] < cs["place"]["dpaper"] for k in KINDS if k != "place")
    return m


# ---------- the little graph: every entity, sized by mentions as the site sizes them ----------
def entity_dots():
    ents = {r["id"]: r["kind"] for r in csv.DictReader(open(ROOT / "data/entities.csv"))}
    n = Counter(r["entity"] for r in csv.DictReader(open(ROOT / "data/mentions.csv")))
    dots = [(ents[e], min(15, 3 + math.sqrt(n.get(e, 1)) * 1.5) * 0.62) for e in ents]
    rng = random.Random(9)
    W, H = 330, 210
    hymns = [(rng.uniform(40, W - 40), rng.uniform(35, H - 35), 6 + rng.random() * 6) for _ in range(9)]
    pts = []
    for kind, r in sorted(dots, key=lambda d: -d[1]):
        for _ in range(400):
            x, y = rng.uniform(r + 2, W - r - 2), rng.uniform(r + 2, H - r - 2)
            if all((x - a) ** 2 + (y - b) ** 2 > (r + c + .8) ** 2 for a, b, c in [p[1:] for p in pts] + hymns):
                break
        pts.append((kind, x, y, r))
    rng.shuffle(pts)
    return pts, hymns, W, H


DOTS = entity_dots()


def mini_graph(P, vision):
    pts, hymns, W, H = DOTS
    out = [f'<svg viewBox="0 0 {W} {H}" width="{W}" height="{H}" class="graph">']
    for x, y, r in hymns:
        out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" fill="{simulate("#f3ead6", vision)}" '
                   f'stroke="{simulate(INK, vision)}" stroke-width="1"/>')
    for kind, x, y, r in pts:
        out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.2f}" fill="{simulate(P[kind], vision)}" '
                   f'stroke="{PAPER}" stroke-width=".6"/>')
    out.append("</svg>")
    return "".join(out)


def fmt_pair(p):
    d, a, b = p
    return f"{d:.1f} <span class=pair>{a}/{b}</span>"


def cls(d, s):
    return "ok" if d >= TARGET[s] else "bad"


def palette_section(name, P, m, rec):
    c = m["colors"]
    h = [f'<section class="pal{" rec" if rec else ""}" id="{name}">',
         f'<h2>{name}{" <span class=tag>recommended</span>" if rec else ""}</h2><p class=blurb>{BLURB[name]}</p>',
         '<div class=row>']
    # swatches
    h.append('<div class=swatches>')
    for k in KINDS:
        x = c[k]
        h.append(f'<div class=sw><div class=chip style="background:{x["hex"]}"></div>'
                 f'<div class=lab><b>{k}</b> <code>{x["hex"]}</code><br>'
                 f'<span class=num>L {x["L"]:.0f} · C {x["C"]:.0f} · h {x["h"]:.0f}°</span></div></div>')
    h.append('<div class=sw><div class="chip hymn"></div><div class=lab><b>hymn</b> <code>#f3ead6</code><br>'
             '<span class=num>neutral, ink outline</span></div></div>')
    # dots at the sizes the graph draws, each kind beside every other
    svg = ['<svg width="720" height="30" class=dots>']
    for i, k in enumerate(KINDS):
        x0 = 8 + i * 102
        for j, r in enumerate([3, 4.5, 6]):
            svg.append(f'<circle cx="{x0 + j * 15 + r:.1f}" cy="10" r="{r}" fill="{c[k]["hex"]}"/>')
        svg.append(f'<text x="{x0 + 54}" y="14" font-size="11" fill="#7a6f60">{k}</text>')
    svg.append('</svg>')
    h.append('<div class=dotrow><span class=th>dots, r = 3, 4.5, 6 px</span>' + "".join(svg) + '</div>')
    h.append('</div>')
    # text samples
    h.append('<div class=texts><div class=th>labels on paper: fill colour · text colour</div>')
    for k in KINDS:
        x = c[k]
        mark = "" if x["cr"] >= TEXT_MIN else " fail"
        h.append(f'<div class=tx><span class="grc big{mark}" style="color:{x["hex"]}">{SAMPLES[k]}</span>'
                 f'<span class=crn>{x["cr"]:.1f}</span>')
        if x["variant"]:
            h.append(f'<span class="grc big" style="color:{x["text"]}">{SAMPLES[k]}</span>'
                     f'<span class=crn><code>{x["text"]}</code> {x["text_cr"]:.1f}</span>')
        h.append('</div>')
    h.append('<p class="grc para">' + " ".join(
        f'<span style="color:{c[k]["text"]}">{w}</span>' for k, w in
        [("god", "Λητὼ"), ("place", "Δήλῳ"), ("god", "Ἀπόλλωνα"), ("creature", "δράκαιναν"),
         ("nymph", "Τελφοῦσαν"), ("group", "Μοῦσαι"), ("mortal", "Ἀγχίσῃ"), ("hero", "Ἡρακλῆα"),
         ("place", "Πυθοῖ")]) + '</p>')
    h.append('</div>')
    h.append('</div>')
    # CVD side by side
    h.append('<div class=cvd>')
    for s in VISIONS:
        sim = {k: simulate(v, s) for k, v in P.items()}
        d, a, b = m["pairs"][s][0]
        h.append(f'<figure><figcaption>{VNAME[s]} · min ΔE₀₀ <b class={cls(d, s)}>{d:.1f}</b> '
                 f'<span class=pair>{a}/{b}</span></figcaption>'
                 '<div class=strip>' + "".join(
                     f'<span style="background:{sim[k]}" title="{k}">{k}</span>' for k in KINDS) + '</div>'
                 + mini_graph(P, s) + '</figure>')
    h.append('</div>')
    # per-colour table
    h.append('<table class=detail><tr><th>kind</th><th>fill</th><th>contrast</th><th>text colour</th>'
             '<th>contrast</th><th>ΔE₀₀ to paper</th><th>CMYK, FOGRA39</th><th>ΔE₀₀ round trip<br>FOGRA39 · FOGRA43</th>'
             '<th>nodes</th></tr>')
    for k in KINDS:
        x = c[k]
        h.append(f'<tr><td>{k}</td><td><i class=dot style="background:{x["hex"]}"></i><code>{x["hex"]}</code></td>'
                 f'<td class="{"ok" if x["cr"] >= TEXT_MIN else "bad"}">{x["cr"]:.2f}</td>'
                 f'<td>{"<i class=dot style=background:" + x["text"] + "></i><code>" + x["text"] + "</code>" if x["variant"] else "same"}</td>'
                 f'<td class=ok>{x["text_cr"]:.2f}</td><td>{x["dpaper"]:.1f}</td>'
                 f'<td><code>{" ".join(str(v) for v in x["cmyk"])}</code></td>'
                 f'<td class="{"ok" if x["dE"] <= 1 else ("warn" if x["dE"] <= 2 else "bad")}">{x["dE"]:.2f} · {x["dE_pso"]:.2f}</td>'
                 f'<td>{COUNTS[k]}</td></tr>')
    h.append('</table></section>')
    return "".join(h)


def summary_table(results):
    h = ['<table class=summary><tr><th rowspan=2>palette</th><th colspan=4>min pairwise CIEDE2000 of the seven fills '
         '(target ≥ 20 normal, ≥ 10 simulated)</th><th colspan=4>min ΔE₀₀ of the seven <i>text</i> colours</th>'
         '<th rowspan=2>min fill<br>contrast</th><th rowspan=2>text<br>variants</th>'
         '<th rowspan=2>max ΔE₀₀<br>CMYK trip</th><th rowspan=2>god<br>chroma rank</th><th rowspan=2>place<br>salience rank</th></tr><tr>']
    h += [f'<th>{VNAME[s]}</th>' for s in VISIONS] + [f'<th>{s}</th>' for s in VISIONS] + ['</tr>']
    for name, P, m in results:
        h.append(f'<tr><td><a href="#{name}">{name}</a></td>')
        for s in VISIONS:
            p = m["pairs"][s][0]
            h.append(f'<td class={cls(p[0], s)}>{fmt_pair(p)}</td>')
        for s in VISIONS:
            p = m["text_pairs"][s][0]
            h.append(f'<td class={cls(p[0], s)}>{fmt_pair(p)}</td>')
        h.append(f'<td>{m["min_cr"]:.2f}</td><td>{m["n_variants"]} of 7</td>'
                 f'<td class={"ok" if m["max_dE"] <= 1 else ("warn" if m["max_dE"] <= 2 else "bad")}>{m["max_dE"]:.2f}</td>'
                 f'<td class={"ok" if m["god_rank_C"] == 1 else "bad"}>{m["god_rank_C"]} of 7</td>'
                 f'<td class={"ok" if m["place_rank_paper"] == 1 else "bad"}>{"quietest" if m["place_rank_paper"] == 1 else str(m["place_rank_paper"]) + " of 7"}</td></tr>')
    h.append('</table>')
    return "".join(h)


def collisions(m, n=3):
    """The closest few pairs under each vision, for the notes."""
    return {s: m["pairs"][s][:n] for s in VISIONS}


CSS = """
@font-face { font-family: "EB Garamond"; src: url(../fonts/ebgaramond-roman.woff2) format("woff2"); font-style: normal; font-weight: 400 800; }
@font-face { font-family: "EB Garamond"; src: url(../fonts/ebgaramond-italic.woff2) format("woff2"); font-style: italic; font-weight: 400 800; }
@font-face { font-family: "GFS Porson"; src: url(../fonts/GFSPorson.otf) format("opentype"); }
body { background: #faf6ec; color: #221d17; font: 16px/1.4 "EB Garamond", Georgia, serif; margin: 0; padding: 28px 36px 40px; width: 1428px; }
h1 { font-weight: 500; font-size: 30px; margin: 0 0 4px; } h1 .grc { font-size: 34px; }
h2 { font-weight: 500; font-size: 24px; margin: 0 0 2px; }
.grc { font-family: "GFS Porson", "EB Garamond", serif; }
code { font: 12.5px ui-monospace, Menlo, monospace; }
.sub { color: #7a6f60; font-style: italic; margin: 0 0 14px; }
.rec-box { border: 1px solid #d9cfbb; background: #fffdf7; padding: 12px 18px; margin: 0 0 18px; }
.rec-box h2 { font-size: 21px; } .rec-box p { margin: 6px 0; }
.tag { font-size: 13px; font-style: italic; color: #fffdf7; background: #221d17; padding: 1px 7px; border-radius: 3px; vertical-align: middle; }
section.pal { border-top: 1px solid #d9cfbb; padding: 16px 0 10px; }
section.rec { border-top: 2px solid #221d17; }
.blurb { color: #5b5246; margin: 0 0 10px; max-width: 1100px; }
.row { display: flex; gap: 30px; align-items: flex-start; }
.swatches { display: grid; grid-template-columns: repeat(4, 175px); gap: 8px 10px; }
.sw { display: flex; gap: 8px; align-items: center; font-size: 14px; }
.chip { width: 44px; height: 44px; border-radius: 3px; flex: none; }
.chip.hymn { background: #f3ead6; border: 1.3px solid #221d17; border-radius: 50%; width: 40px; height: 40px; }
.num { color: #7a6f60; font-size: 12.5px; }
.texts { flex: 1; }
.dotrow { grid-column: 1 / -1; margin-top: 4px; } .dots { display: block; margin-top: 2px; }
.th, figcaption { font-size: 13.5px; color: #7a6f60; font-style: italic; }
.tx { display: inline-flex; align-items: baseline; gap: 6px; margin: 2px 16px 2px 0; min-width: 270px; }
.big { font-size: 22px; } .fail { text-decoration: underline wavy #c9bfa9 1px; text-underline-offset: 4px; }
.crn { font-size: 12.5px; color: #7a6f60; }
.para { font-size: 17px; margin: 6px 0 0; }
.cvd { display: flex; gap: 14px; margin: 14px 0 8px; }
figure { margin: 0; }
.strip { display: flex; margin: 3px 0 4px; }
.strip span { flex: 1; height: 16px; font-size: 0; }
.graph { display: block; background: #faf6ec; outline: 1px solid #e6dcc8; }
table { border-collapse: collapse; font-size: 14px; margin: 6px 0; }
td, th { border-bottom: 1px solid #e6dcc8; padding: 3px 9px; text-align: left; vertical-align: top; }
th { font-weight: 500; color: #5b5246; font-size: 13px; }
.summary td { white-space: nowrap; }
.pair { color: #7a6f60; font-size: 12.5px; }
.ok { color: #2d5a27; } .bad { color: #a12a1c; font-weight: 600; } .warn { color: #8a5a00; }
.dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 5px; vertical-align: -1px; }
.notes { font-size: 14.5px; color: #3d362d; max-width: 1150px; } .notes li { margin: 3px 0; }
"""


def main():
    pals = {p.stem: parse_css(p) for p in sorted(HERE.glob("*.css"))}
    results = [(n, pals[n][0], measure(*pals[n])) for n in ORDER]
    rec_name, rec_P, rec_m = results[0]
    col = collisions(rec_m)
    rec = (REC_TEXT.strip())
    parts = [f"<!doctype html><meta charset=utf-8><title>Hymnoi palettes</title><style>{CSS}</style>",
             '<p class=sub><a href="../index.html">graph</a> · <a href="../matrix.html">matrix</a> · '
             '<a href="../map.html">map</a> · <a href="../poster/">posters</a> · <a href="../about.html">about</a></p>',
             '<h1><span class=grc>Ὕμνοι</span> · kind palettes</h1>',
             '<p class=sub>Four candidates for <code>site/palette.css</code>, measured: CIEDE2000 between kinds under normal '
             'vision and three simulated dichromacies, WCAG contrast of labels on the paper <code>#faf6ec</code>, and a '
             'round trip through the ISO Coated v2 (FOGRA39) CMYK profile. Generated by <code>build.py</code>.</p>',
             f'<div class=rec-box><h2>Recommendation: <b>{rec_name}</b></h2><p>{rec}</p></div>',
             summary_table(results)]
    for i, (n, P, m) in enumerate(results):
        parts.append(palette_section(n, P, m, i == 0))
    parts.append(NOTES)
    (HERE / "index.html").write_text("\n".join(parts))
    for n, P, m in results:
        print(n, {s: (round(m["pairs"][s][0][0], 1), m["pairs"][s][0][1], m["pairs"][s][0][2]) for s in VISIONS},
              "text", {s: round(m["text_pairs"][s][0][0], 1) for s in VISIONS},
              "mincr %.2f variants %d maxdE %.2f pso %.2f godC#%d placeQ#%d" % (
                  m["min_cr"], m["n_variants"], m["max_dE"], m["max_dE_pso"], m["god_rank_C"], m["place_rank_paper"]))
        print("   text pairs", {s: [(round(d, 1), a, b) for d, a, b in m["text_pairs"][s][:2]] for s in VISIONS})
        tm = max(c["dE_text"] for c in m["colors"].values())
        print("   max text CMYK trip %.2f" % tm)
        for k, c in m["colors"].items():
            print("   %-9s %s cr %.2f text %s %.2f dpaper %.1f cmyk %s rt %.2f/%.2f" % (
                k, c["hex"], c["cr"], c["text"], c["text_cr"], c["dpaper"], c["cmyk"], c["dE"], c["dE_pso"]))
        for s in VISIONS:
            print("   ", s, [(round(d, 1), a, b) for d, a, b in m["pairs"][s][:4]])


REC_TEXT = """
Adopt <b>pigmenta</b>: <code>cp site/palettes/pigmenta.css site/palette.css</code>. It is the only
candidate that clears every target and still belongs on cream paper beside EB Garamond: seven pigments a
Greek painter could have ground (cinnabar, verdigris, yellow ochre, Egyptian blue, murex purple, carbon black,
green earth), set so that the gods' cinnabar is the most saturated colour on the sheet (C 64) and the places'
green earth the quietest (ΔE 22 from the paper, 2.0:1), so a field of 112 small place dots recedes and the 67
gods come forward. Its closest pairs are 27.4 in normal vision (nymph/place) and 14.0, 14.4, 14.4 under
deuteranopia (nymph/group), protanopia (mortal/group) and tritanopia (nymph/mortal): no two kinds collide, so
nothing has to be carried by shape. Every fill survives a FOGRA39 round trip within ΔE 0.55. Okabe–Ito,
adapted here, measures a little better under simulation (≥ 15.8) but its orange, pink and sky blue read as a
chart rather than a book, and it needs six text variants to pigmenta's four. Three fills are too light for
Greek labels on the paper (verdigris 4.2:1, ochre 2.9:1, green earth 2.0:1); the CSS comments give text
colours of the same hue (and a deeper cinnabar for gods, which keeps the god and hero labels apart for
deutans) that reach 4.6:1 or more and stay ≥ 21.7 apart, ≥ 10.8 under each simulation. The node labels in the
graph are ink, so these matter only in the reading panel, and using them needs a <code>--&lt;kind&gt;-text</code>
hook in <code>style.css</code>.
"""
NOTES = """
<section class=pal><h2>Method</h2><ul class=notes>
<li><b>Colour difference.</b> sRGB (D65) to CIELAB, CIEDE2000 with k<sub>L</sub> = k<sub>C</sub> = k<sub>H</sub> = 1;
 the implementation reproduces Sharma, Wu &amp; Dalal (2005) test pairs to four decimals. Targets: ≥ 20 between any two of the
 seven kinds in normal vision, ≥ 10 under each simulation.</li>
<li><b>Colour-vision deficiency.</b> Machado, Oliveira &amp; Fernandes (2009) matrices at severity 1.0 (full dichromacy),
 applied in linear RGB. The swatch strips and the little graphs above are drawn in the simulated colours.</li>
<li><b>Text.</b> WCAG 2 contrast against <code>#faf6ec</code>; 4.5:1 is the bar for the Greek labels. Where a fill falls short,
 or where darkening would make two labels collide, the palette names a text colour of the same hue (±12°, at least ¾ of its
 chroma) in its CSS comment. The second block of four columns in the summary measures the seven colours actually used for text.
 The baseline file names none, so its text colours are the fills darkened along constant hue until they reach 4.6:1.</li>
<li><b>Print.</b> littleCMS through Pillow's <code>ImageCms</code>: sRGB → ISO Coated v2 (basICColor), which is the FOGRA39
 characterisation for coated stock → sRGB, relative colorimetric, no black-point compensation; ΔE₀₀ between the colour and
 its round trip. A second trip through PSO Coated NPscreen (FOGRA43) is shown beside it. A round trip under 1 means the colour
 is inside the press gamut; every fill of the three new palettes is (worst 1.00, Tol's pale cyan, at the edge). CMYK values
 are the FOGRA39 separations, for the printer. The paper colour itself would be a light tint on white stock, or the stock.</li>
<li><b>Attention.</b> "God chroma rank" is where the god colour falls when the seven are ordered by CIELAB chroma; "place
 salience" ranks the seven by ΔE₀₀ from the paper, and "quietest" means places are nearest the paper of all kinds, yet
 every place colour stays ≥ 22 from it so a 3 px dot is still seen. The graphs use the real 286 entities, sized by mention
 count as the site does (×0.62), with nine hymn discs for scale.</li>
<li><b>How the new palettes were made.</b> Differential evolution (SciPy) over CIELCh for all seven colours, maximising the
 worst of (normal ΔE / 20, each simulated ΔE / 10) with penalties for leaving the FOGRA39 gamut, for any kind out-chroma-ing
 the gods, and for any kind sitting nearer the paper than the places. <i>Pigmenta</i> is confined to hue windows for its
 pigments (cinnabar 28–42°, verdigris 155–190°, yellow ochre 72–86°, Egyptian blue 250–285°, murex 325–355°, green earth
 100–135°, carbon black C ≤ 6); <i>Tol</i> and <i>Okabe–Ito</i> are tethered to their published colours (≤ 4.9 and ≤ 8.1 ΔE₀₀).</li>
<li><b>Caveats.</b> CIEDE2000 is calibrated on patches of a few degrees; a 3 px dot subtends far less, and small fields lose
 chroma first (blue–yellow worst), so real dot-to-dot differences are smaller than the table. Greek labels, not colour alone,
 identify each node on the graph, and the legend repeats the colours. Machado at severity 1.0 is the worst case; most colour-deficient
 readers are anomalous trichromats and see more than the simulations show.</li>
</ul></section>
"""

if __name__ == "__main__":
    main()
