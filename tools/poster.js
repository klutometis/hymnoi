#!/usr/bin/env node
// Hymnoi posters, laid out offline and set for print at 24 × 24φ in. Two graphs (as the site's two views):
//   hymns as hubs (default): the 34 hymns are discs; each names its names, and a dashed line goes to its god;
//   gods as hubs (--gods):   the topology of the 2009 poster; each hymn folded into its (first) dedicatee, which
//                            becomes the hub for the names in it; Εἰς Ξένους, sung to no god, stays a hub of its own.
//
//     node tools/poster.js            # site/data/hymnoi.json -> site/poster/hymnoi-hubs.{svg,html,pdf} + -preview.png
//     node tools/poster.js --gods     # ... -> site/poster/hymnoi-gods.{svg,html,pdf} + -preview.png
//     node tools/poster.js --svg      # stop after the SVG (no Chrome)
//     node tools/poster.js --no-fill  # leave the paper white instead of the site's cream
//
// Needs google-chrome (PDF), pdffonts and pdftoppm (poppler); no npm packages. About 40 s.
// Prints the label audit: labels without a clean seat, overlaps (e.g. from hand overrides), missing glyphs.
//
// Everything is derived from site/data/hymnoi.json, site/palette.css (kind colours; the paper and ink
// greys come from site/style.css unless palette.css defines them) and data/poster_overrides.csv (with --gods:
// data/poster_overrides_gods.csv), so when the labels or the palette change the poster follows on a re-run.
//
// Units: one SVG user unit is one PostScript point (1/72 in); the page is 1728 × 2796 pt.
//
// data/poster_overrides.csv, applied after the simulation (all values in points):
//     id,dx,dy,x,y
//     zeus,12,-8,,          move the node Zeus (and its label with it) by (12, -8)
//     h3,,,840,1200         put the disc of Hymn 3 at (840, 1200) from the top-left of the page
//     zeus.label,0,-6,,     nudge only the label of Zeus (after placement)
// Ids are entity ids (data/entities.csv) or h1 … h34 for the hymns (with --gods, only h34: the hub Εἰς Ξένους).
//
// Determinism: nodes are sorted by id, start on a phyllotaxis spiral, and d3-force's own seeded LCG
// supplies the jiggle, so the same data gives the same poster.
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const {execFileSync} = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const P = (...p) => path.join(ROOT, ...p);
const d3 = require(P('site/vendor/d3.v7.9.0.min.js'));
const ARGS = new Set(process.argv.slice(2));
const T0 = Date.now();
// force tuning (POSTER_TUNE='{"kx":0.08}' to experiment without editing)
const TUNE = {k1: 0.3, kd: 2.0, dmax: 250, kc: 1.0, kx: 0.08, ky: 0.03, ...JSON.parse(process.env.POSTER_TUNE || '{}')};
const OUT = process.env.POSTER_OUT ? path.resolve(process.env.POSTER_OUT) : P('site/poster');   // for experiments
const MODE = ARGS.has('--gods') ? 'gods' : 'hymns';         // what the hubs are
const BASE = MODE === 'gods' ? 'hymnoi-gods' : 'hymnoi-hubs';
const OVERRIDES_CSV = MODE === 'gods' ? 'data/poster_overrides_gods.csv' : 'data/poster_overrides.csv';

// ---------------------------------------------------------------- page

const PHI = (1 + Math.sqrt(5)) / 2;
const W = 24 * 72, H = +(24 * PHI * 72).toFixed(2);          // 1728 × 2795.96 pt
const MARGIN = 120;                                          // ≈ 1.67 in
const SUPER = 3.2;                                           // exponent: 2 ellipse, → ∞ rectangle

// ---------------------------------------------------------------- data

const D = JSON.parse(fs.readFileSync(P('site/data/hymnoi.json'), 'utf8'));
const E = D.entities;
const M = D.mentions.map(r => Object.fromEntries(D.mention_cols.map((c, i) => [c, r[i]])));
const KINDS = ['god', 'nymph', 'hero', 'mortal', 'group', 'creature', 'place'];
const KIND_PL = {god: 'gods', nymph: 'nymphs', hero: 'heroes', mortal: 'mortals', group: 'groups',
  creature: 'creatures', place: 'places'};
const HYMN = new Map(D.hymns.map(h => [h.n, h]));
// the node a hymn's names hang from: the hymn itself, or (gods as hubs) its first dedicatee if it has one
const hubOf = h => MODE === 'gods' && h.dedicatees[0] || 'h' + h.n;
const HUBS = [...new Set(D.hymns.map(hubOf))];       // in the order of their first hymn

// The vertical plan. The title hangs from the top margin; the apparatus (legend, key to the hymns, colophon)
// stands on the bottom margin, built upwards; the graph takes what is left between them.
const KEY = {fs: 13.5, lead: 19, cols: MODE === 'gods' ? 4 : 3};       // a key to the hymns, or to the hubs
KEY.rows = Math.ceil(HUBS.length / KEY.cols);
const V = {title: MARGIN + 92, url: H - MARGIN + 6};
V.sub = V.title + 54;
V.colo = V.url - 44;                                 // first colophon line; the second is 18 below
V.rule2 = V.colo - 30;
V.key = V.rule2 - 26 - (KEY.rows - 1) * KEY.lead;    // baseline of the first row of the key
V.legend = V.key - 46;
V.rule1 = V.legend - 38;
const GRAPH = {cx: W / 2, ax: W / 2 - MARGIN};       // the graph's superellipse
GRAPH.top = V.sub + 66; GRAPH.bottom = V.rule1 - 30;
GRAPH.cy = (GRAPH.top + GRAPH.bottom) / 2; GRAPH.ay = (GRAPH.bottom - GRAPH.top) / 2;

function cssVars(file) {
  const out = {};
  const src = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const block of src.matchAll(/:root\s*\{([^}]*)\}/g))
    for (const m of block[1].matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
const C = {ink: '#221d17', muted: '#7a6f60', paper: '#faf6ec', rule: '#d9cfbb', hymn: '#f3ead6',
  ...cssVars(P('site/style.css')), ...cssVars(P('site/palette.css'))};
for (const k of KINDS) if (!C[k]) throw new Error(`palette.css has no --${k}`);

// ---------------------------------------------------------------- font metrics (cmap + hmtx; OTF or WOFF2)

function fontTables(buf) {
  const tables = {};
  if (buf.toString('latin1', 0, 4) === 'wOF2') {
    const KNOWN = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca',
      'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE',
      'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar',
      'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx',
      'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill'];
    const n = buf.readUInt16BE(12), packed = buf.readUInt32BE(20);
    let p = 48;
    const b128 = () => { let v = 0; for (let i = 0; i < 5; i++) { const c = buf[p++]; v = v * 128 + (c & 127); if (!(c & 128)) return v; } };
    const dir = [];
    for (let i = 0; i < n; i++) {
      const f = buf[p++];
      let tag = KNOWN[f & 63];
      if ((f & 63) === 63) { tag = buf.toString('latin1', p, p + 4); p += 4; }
      const tv = (f >> 6) & 3, orig = b128();
      const transformed = tag === 'glyf' || tag === 'loca' ? tv !== 3 : tv !== 0;
      dir.push({tag, len: transformed ? b128() : orig, transformed});
    }
    const data = zlib.brotliDecompressSync(buf.subarray(p, p + packed));
    let off = 0;
    for (const t of dir) { tables[t.tag] = t.transformed ? null : data.subarray(off, off + t.len); off += t.len; }
  } else {
    const n = buf.readUInt16BE(4);
    for (let i = 0; i < n; i++) {
      const r = 12 + 16 * i, o = buf.readUInt32BE(r + 8);
      tables[buf.toString('latin1', r, r + 4)] = buf.subarray(o, o + buf.readUInt32BE(r + 12));
    }
  }
  return tables;
}

function loadFont(file) {
  const t = fontTables(fs.readFileSync(file));
  const upm = t.head.readUInt16BE(18);
  const nh = t.hhea.readUInt16BE(34);
  const adv = i => t.hmtx.readUInt16BE(4 * Math.min(i, nh - 1));
  const cmap = new Map(), c = t.cmap;
  const subs = [];
  for (let i = 0; i < c.readUInt16BE(2); i++) {
    const pid = c.readUInt16BE(4 + 8 * i), eid = c.readUInt16BE(6 + 8 * i), off = c.readUInt32BE(8 + 8 * i);
    if (pid === 3 || pid === 0) subs.push({fmt: c.readUInt16BE(off), off, pid, eid});
  }
  const s = subs.find(s => s.fmt === 12) || subs.find(s => s.fmt === 4);
  if (s.fmt === 12) {
    const n = c.readUInt32BE(s.off + 12);
    for (let i = 0; i < n; i++) {
      const r = s.off + 16 + 12 * i, a = c.readUInt32BE(r), b = c.readUInt32BE(r + 4), g = c.readUInt32BE(r + 8);
      for (let u = a; u <= b; u++) cmap.set(u, g + u - a);
    }
  } else {
    const seg = c.readUInt16BE(s.off + 6) / 2, ends = s.off + 14, starts = ends + 2 * seg + 2,
      deltas = starts + 2 * seg, ranges = deltas + 2 * seg;
    for (let i = 0; i < seg; i++) {
      const e = c.readUInt16BE(ends + 2 * i), st = c.readUInt16BE(starts + 2 * i),
        dl = c.readInt16BE(deltas + 2 * i), ro = c.readUInt16BE(ranges + 2 * i);
      for (let u = st; u <= e && u !== 0xffff; u++) {
        let g;
        if (!ro) g = (u + dl) & 0xffff;
        else { g = c.readUInt16BE(ranges + 2 * i + ro + 2 * (u - st)); if (g) g = (g + dl) & 0xffff; }
        if (g) cmap.set(u, g);
      }
    }
  }
  return {
    adv(ch) { const g = cmap.get(ch.codePointAt(0)); return g === undefined ? null : adv(g) / upm; },
  };
}
// a CSS-style font stack: each character from the first font that has it (no kerning: callers pad)
const MISSING = new Set();
function stack(...fonts) {
  return {
    width(text, size) {
      let w = 0;
      for (const ch of text.normalize('NFC')) {
        let a = null;
        for (const f of fonts) if ((a = f.adv(ch)) !== null) break;
        if (a === null) { MISSING.add(ch); a = 0.5; }
        w += a;
      }
      return w * size;
    },
  };
}
const F_PORSON = loadFont(P('site/fonts/GFSPorson.otf'));
const F_GARAMOND = loadFont(P('site/fonts/ebgaramond-roman.woff2'));
const F_GARAMOND_I = loadFont(P('site/fonts/ebgaramond-italic.woff2'));
const PORSON = stack(F_PORSON, F_GARAMOND);          // as the CSS: "GFS Porson", "EB Garamond"
const GARAMOND = stack(F_GARAMOND, F_PORSON);
const GARAMOND_I = stack(F_GARAMOND_I, F_PORSON);

// ---------------------------------------------------------------- the graph (as site/hymnoi.js graphData(), either view)

const CORE = new Set(['name', 'epithet', 'patronymic', 'adjective', 'ethnic']);
const PHRASES = true, DOUBTFUL = false;

function graphData() {
  const nodes = new Map(), links = new Map();
  const entNode = id => {
    if (!nodes.has(id)) nodes.set(id, {id, ent: id, type: 'entity', kind: E[id].kind, n: 0, hymns: new Set()});
    return nodes.get(id);
  };
  const link = (s, t, ded) => {
    const key = s + '|' + t;
    if (!links.has(key)) links.set(key, {source: s, target: t, w: 0, ded: false});
    const l = links.get(key);
    if (ded) l.ded = true; else l.w++;
  };
  const ms = M.filter(m => (m.shown || DOUBTFUL) && (PHRASES || CORE.has(m.type)));
  if (MODE === 'hymns') {
    for (const h of D.hymns) nodes.set('h' + h.n, {id: 'h' + h.n, type: 'hymn', hub: true, hymn: h, n: h.lines});
    for (const m of ms) {
      const t = entNode(m.entity);
      t.n++; t.hymns.add(m.hymn);
      link('h' + m.hymn, t.id, false);
    }
    for (const h of D.hymns) for (const d of h.dedicatees) link('h' + h.n, entNode(d).id, true);
  } else {
    // a hub is an entity like any other (a hymn with no dedicatee is a labelled node of its own), and a god
    // named in its own hymns is no link
    for (const h of D.hymns) {
      if (h.dedicatees[0]) entNode(hubOf(h)).hub = true;
      else nodes.set(hubOf(h), {id: hubOf(h), type: 'entity', hub: true, title: h.title_grc, kind: null, n: 1, hymns: new Set()});
    }
    for (const m of ms) {
      const s = hubOf(HYMN.get(m.hymn)), t = entNode(m.entity);
      t.n++; t.hymns.add(m.hymn);
      if (s !== t.id) link(s, t.id, false);
    }
  }
  // the hubs that name a name (its sources); a petal is a name hanging from one hub only
  for (const n of nodes.values()) if (n.type === 'entity') {
    n.hubs = new Set([...n.hymns].map(h => hubOf(HYMN.get(h))).filter(id => id !== n.id));
    n.petal = !n.hub && n.hubs.size === 1;
  }
  const key = n => n.type === 'hymn' ? 'h' + String(n.hymn.n).padStart(3, '0') : 'e' + n.id;
  const ns = [...nodes.values()].sort((a, b) => d3.ascending(key(a), key(b)));
  const ls = [...links.values()].filter(l => l.w || l.ded)
    .sort((a, b) => d3.ascending(a.source + '|' + a.target, b.source + '|' + b.target));
  return {nodes: ns, links: ls};
}

const G = graphData();
const byId = new Map(G.nodes.map(n => [n.id, n]));

// sizes, in points on paper
const rEntity = n => 2.6 + Math.sqrt(n) * 1.35;
const LABEL_MIN = 9;                                  // pt, a name said once
for (const n of G.nodes) {
  if (n.type === 'hymn') {
    n.r = 7 + Math.sqrt(n.n) * 1.05;
    n.rs = 5 + Math.sqrt(n.n) * 0.95;                 // the site's radius, which drives the site's forces
    n.label = n.hymn.numeral;
    const w1 = PORSON.width(n.label, 1);
    n.fs = Math.min(n.r * 0.95, 1.5 * n.r / w1);
  } else {
    n.r = rEntity(n.n);
    n.rs = 3 + Math.sqrt(n.n) * 1.5;
    n.label = (n.ent ? E[n.ent].label : n.title).normalize('NFC');
    n.fs = Math.min(30, LABEL_MIN + 1.4 * Math.sqrt(n.n - 1));
    if (n.hub) {                                      // gods as hubs: as big as a hymn disc of its hymns' length, at least
      const lines = d3.sum(D.hymns.filter(h => hubOf(h) === n.id), h => h.lines);
      n.r = Math.max(n.r, 7 + Math.sqrt(lines) * 1.05);
      n.rs = Math.max(n.rs, 5 + Math.sqrt(lines) * 0.95);
      n.fs = Math.min(30, Math.max(n.fs || 0, 16 + 0.25 * n.r));   // || 0: a hub never named
    }
    n.w = PORSON.width(n.label, n.fs) * 1.03 + 0.6;
  }
}

// ---------------------------------------------------------------- the simulation

const S = 2.05;                                       // site px -> paper pt
// Start: the hymns on a ring, clockwise from the top, kin beside kin (Apollo's, Artemis', Hermes' and Hestia's …),
// so Hymn 3 opens at the top and Hymn 2 at the foot; each name starts at the mean of its hymns, on a small
// phyllotaxis spiral. Hymns missing from RING (new data) are appended. Gods as hubs: each god takes the place of
// its first hymn in RING (Apollo at the top, the Muses beside him, Demeter at the foot).
const RING = [3, 21, 25, 27, 9, 4, 18, 29, 24, 19, 20, 28, 11, 8, 31, 32, 14, 30, 13, 2, 22, 12, 23, 16, 15, 17, 33,
  34, 5, 6, 10, 1, 7, 26];
{
  const golden = Math.PI * (3 - Math.sqrt(5));
  const ringIds = [...new Set(RING.filter(h => HYMN.has(h)).map(h => hubOf(HYMN.get(h))))];
  const ring = [...ringIds, ...HUBS.filter(id => !ringIds.includes(id))];
  const names = new Map(ring.map(id => [id, new Set()]));
  for (const l of G.links) names.get(l.source).add(l.target);
  const wt = ring.map(id => Math.sqrt(names.get(id).size + 1));
  const tot = d3.sum(wt);
  let acc = -wt[0] / 2;
  ring.forEach((id, i) => {
    const a = -Math.PI / 2 + (acc + wt[i] / 2) / tot * 2 * Math.PI;
    acc += wt[i];
    const n = byId.get(id);
    n.x = GRAPH.cx + Math.cos(a) * GRAPH.ax * 0.55;
    n.y = GRAPH.cy + Math.sin(a) * GRAPH.ay * 0.6;
  });
  G.nodes.forEach((n, i) => {
    n.vx = n.vy = 0;
    if (n.hub) return;
    const hs = [...n.hubs].map(id => byId.get(id));
    if (!hs.length) hs.push({x: GRAPH.cx, y: GRAPH.cy});
    const rad = 4 * Math.sqrt(i + 0.5), a = i * golden;
    n.x = d3.mean(hs, d => d.x) + rad * Math.cos(a);
    n.y = d3.mean(hs, d => d.y) + rad * Math.sin(a);
  });
}

// keep every node (and a margin for its label) inside the superellipse
function forceBound(strength) {
  let nodes;
  const f = alpha => {
    for (const n of nodes) {
      const pad = n.type === 'hymn' ? n.r : n.r + 6;
      const ax = GRAPH.ax - pad - (n.w ? n.w * 0.5 : 0), ay = GRAPH.ay - pad - (n.fs || 0);
      const u = (n.x - GRAPH.cx) / ax, v = (n.y - GRAPH.cy) / ay;
      const rr = Math.pow(Math.pow(Math.abs(u), SUPER) + Math.pow(Math.abs(v), SUPER), 1 / SUPER);
      if (rr > 1) {
        const k = (1 - 1 / rr) * strength;
        n.vx -= (n.x - GRAPH.cx) * k;
        n.vy -= (n.y - GRAPH.cy) * k;
      }
    }
  };
  f.initialize = ns => { nodes = ns; };
  return f;
}

const TICKS = 3000;
for (const n of G.nodes) if (n.hub) n.single = 0;
for (const n of G.nodes) if (n.petal) byId.get([...n.hubs][0]).single++;
const sim = d3.forceSimulation(G.nodes)
  .alphaMin(0.0005)
  .alphaDecay(1 - Math.pow(0.0005, 1 / TICKS))
  .force('link', d3.forceLink(G.links).id(d => d.id)
    // a name in one hymn only sits on a ring whose radius grows with the number of such names (a sunburst)
    .distance(l => 18 * S + l.source.r + l.target.r + (l.target.petal && !l.ded ? TUNE.kd * l.source.single : 0))
    // as the site, but a name in one hymn only is held to it harder, so the petals stay petals
    .strength(l => l.target.petal && !l.ded ? TUNE.k1 : (l.ded ? 0.6 : 0.25) + Math.min(0.5, l.w * 0.05)))
  .force('charge', d3.forceManyBody().strength(n => (-30 - n.rs * 14) * S * S * TUNE.kc).distanceMax(TUNE.dmax))
  .force('collide', d3.forceCollide(n => n.r + (n.type === 'hymn' ? 9 : 3 + n.fs * 0.45)).iterations(3))
  .force('x', d3.forceX(GRAPH.cx).strength(TUNE.kx))
  .force('y', d3.forceY(GRAPH.cy).strength(TUNE.ky))
  .force('bound', forceBound(0.5))
  .stop();
// a component cut off from the rest (Hymn 34 names no one else's names) would drift to the wall: hold it in
{
  const comp = new Map(G.nodes.map(n => [n, n]));
  const find = n => comp.get(n) === n ? n : find(comp.get(n));
  for (const l of G.links) comp.set(find(l.source), find(l.target));
  const size = d3.rollup(G.nodes, v => v.length, find);
  const big = d3.greatest(size, ([, v]) => v)[0];
  const stray = n => find(n) !== big;
  sim.force('x').strength(n => stray(n) ? 0.25 : TUNE.kx);
  sim.force('y').strength(n => stray(n) ? 0.25 : TUNE.ky);
}
for (let i = 0; i < TICKS; i++) sim.tick();

// fit to the graph's rectangle: uniform scale, plus up to 12% extra stretch along the slack axis
{
  const ext = n => n.type === 'hymn' ? [n.r, n.r] : [n.r + n.w * 0.6, n.r + n.fs];
  const x0 = d3.min(G.nodes, n => n.x - ext(n)[0]), x1 = d3.max(G.nodes, n => n.x + ext(n)[0]);
  const y0 = d3.min(G.nodes, n => n.y - ext(n)[1]), y1 = d3.max(G.nodes, n => n.y + ext(n)[1]);
  const sx = (2 * GRAPH.ax) / (x1 - x0), sy = (2 * GRAPH.ay) / (y1 - y0), s = Math.min(sx, sy);
  const kx = Math.min(sx, s * 1.12), ky = Math.min(sy, s * 1.12);
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  for (const n of G.nodes) { n.x = GRAPH.cx + (n.x - mx) * kx; n.y = GRAPH.cy + (n.y - my) * ky; }
  console.log(`fit: × ${kx.toFixed(3)}, ${ky.toFixed(3)}`);
}
const atBound = G.nodes.filter(n => {
  const u = (n.x - GRAPH.cx) / GRAPH.ax, v = (n.y - GRAPH.cy) / GRAPH.ay;
  return Math.pow(Math.abs(u), SUPER) + Math.pow(Math.abs(v), SUPER) > Math.pow(0.9, SUPER);
}).length;
console.log(`simulation: ${Date.now() - T0} ms; ${atBound} nodes in the outer tenth; x ${d3.extent(G.nodes, n => n.x).map(Math.round)}, y ${d3.extent(G.nodes, n => n.y).map(Math.round)}`);

// ---------------------------------------------------------------- overrides

function readOverrides() {
  const file = P(OVERRIDES_CSV);
  if (!fs.existsSync(file)) fs.writeFileSync(file, 'id,dx,dy,x,y\n');
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#'));
  const head = lines.shift().split(',').map(s => s.trim());
  return lines.map(l => {
    const cells = l.split(',').map(s => s.trim());
    const o = Object.fromEntries(head.map((h, i) => [h, cells[i] ?? '']));
    const num = v => v === '' || v === undefined ? null : +v;
    return {id: o.id, dx: num(o.dx), dy: num(o.dy), x: num(o.x), y: num(o.y)};
  });
}
const OVERRIDES = readOverrides();
const unknown = [];
for (const o of OVERRIDES.filter(o => !o.id.endsWith('.label'))) {
  const n = byId.get(o.id);
  if (!n) { unknown.push(o.id); continue; }
  if (o.x !== null && o.y !== null) { n.x = o.x; n.y = o.y; } else { n.x += o.dx || 0; n.y += o.dy || 0; }
}

// ---------------------------------------------------------------- label placement

const ASC = 0.76, DESC = 0.24;                      // visual extent of Porson lowercase-with-accents, in em
const PAD = 1.4;                                    // clearance between a label and anything, pt
const FURNITURE = [];                               // rects the labels must avoid (title, key …), filled below

const boxHit = (a, b, pad = PAD) => a.x0 < b.x1 + pad && a.x1 > b.x0 - pad && a.y0 < b.y1 + pad && a.y1 > b.y0 - pad;
function boxCircle(b, cx, cy, r, pad = PAD) {
  const dx = Math.max(b.x0 - cx, 0, cx - b.x1), dy = Math.max(b.y0 - cy, 0, cy - b.y1);
  return dx * dx + dy * dy < (r + pad) * (r + pad);
}
function segBox(x1, y1, x2, y2, b) {                // Liang–Barsky
  let t0 = 0, t1 = 1;
  const dx = x2 - x1, dy = y2 - y1;
  for (const [p, q] of [[-dx, x1 - b.x0], [dx, b.x1 - x1], [-dy, y1 - b.y0], [dy, b.y1 - y1]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
}
function segCircle(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
  const t = Math.max(0, Math.min(1, ((cx - x1) * dx + (cy - y1) * dy) / l2));
  const px = x1 + t * dx - cx, py = y1 + t * dy - cy;
  return px * px + py * py < r * r;
}

const ents = G.nodes.filter(n => n.type === 'entity');
const segs = G.links.map(l => [l.source.x, l.source.y, l.target.x, l.target.y, l.source, l.target]);

// preferred direction: away from the centroid of the node's hymns (outward along its links)
for (const n of ents) {
  const nb = G.links.filter(l => l.target === n).map(l => l.source);
  const mx = d3.mean(nb, d => d.x), my = d3.mean(nb, d => d.y);
  let ux = n.x - mx, uy = n.y - my, len = Math.hypot(ux, uy);
  n.pref = len > 1 ? Math.atan2(uy, ux) : 0;
  n.prefW = nb.length === 1 ? 6 : 2.5;
}

function candidates(n, far) {
  const out = [];
  const dirs = far ? 32 : 16;
  const gaps = far ? [10, 18, 28, 40, 55, 72] : [1.5, 4.5];
  for (const g of gaps) for (let i = 0; i < dirs; i++) {
    const th = i / dirs * 2 * Math.PI, ux = Math.cos(th), uy = Math.sin(th);
    const d = n.r + g;
    const h = (ASC + DESC) * n.fs;
    const sx = Math.max(-1, Math.min(1, ux * 1.7)), sy = Math.max(-1, Math.min(1, uy * 1.7));
    const cx = n.x + ux * d + sx * n.w / 2, cy = n.y + uy * d + sy * h / 2;
    const b = {x0: cx - n.w / 2, x1: cx + n.w / 2, y0: cy - h / 2, y1: cy + h / 2};
    let cost = g * (far ? 0.6 : 0.8) + n.prefW * (1 - Math.cos(th - n.pref)) + 0.6 * Math.abs(uy);
    out.push({b, cost, th, g, leader: far});
  }
  return out;
}

function inBounds(b) {
  if (b.x0 < MARGIN - 40 || b.x1 > W - MARGIN + 40 || b.y0 < MARGIN || b.y1 > H - MARGIN) return false;
  for (const f of FURNITURE) if (boxHit(b, f, 6)) return false;
  return true;
}

// static obstacles: every node disc
function blockedByNodes(c, self) {
  for (const m of G.nodes) if (boxCircle(c.b, m.x, m.y, m.r, m === self ? 0.8 : PAD)) return true;
  return false;
}
function leaderPoints(n, b) {                        // from the disc's edge to the nearest point of the box
  const px = Math.max(b.x0, Math.min(n.x, b.x1)), py = Math.max(b.y0, Math.min(n.y, b.y1));
  const a = Math.atan2(py - n.y, px - n.x);
  return [n.x + Math.cos(a) * (n.r + 0.8), n.y + Math.sin(a) * (n.r + 0.8), px, py];
}

function placeLabels() {
  const placed = new Map();                          // node -> candidate
  const order = ents.slice().sort((a, b) => b.fs - a.fs || b.hymns.size - a.hymns.size || d3.ascending(a.id, b.id));
  const statics = new Map();
  for (const n of ents) {
    statics.set(n, [false, true].map(far => candidates(n, far).filter(c => inBounds(c.b) && !blockedByNodes(c, n))
      .map(c => {
        c.cross = 0;
        for (const s of segs) if (s[4] !== n && s[5] !== n && segBox(s[0], s[1], s[2], s[3], c.b)) c.cross++;
        if (c.leader) {
          c.lp = leaderPoints(n, c.b);
          for (const m of G.nodes) if (m !== n && segCircle(...c.lp, m.x, m.y, m.r + 1)) c.cost += 1e3;
        }
        c.total = c.cost + c.cross * 2.2;
        return c;
      }).sort((a, b) => a.total - b.total)));
  }
  const ok = (n, c) => {
    for (const [m, o] of placed) {
      if (m === n) continue;
      if (boxHit(c.b, o.b)) return false;
      if (o.lp && segBox(...o.lp, c.b)) return false;
      if (c.lp && segBox(...c.lp, o.b)) return false;
    }
    return true;
  };
  const best = n => {
    for (const set of statics.get(n)) for (const c of set) if (c.total < 1e3 && ok(n, c)) return c;
    return null;
  };
  for (const n of order) { const c = best(n); if (c) placed.set(n, c); }
  // improvement passes: re-seat each label against all the others
  for (let pass = 0; pass < 6; pass++) {
    let moved = 0;
    for (const n of order) {
      const cur = placed.get(n);
      placed.delete(n);
      const c = best(n);
      if (c) placed.set(n, c); else if (cur) placed.set(n, cur);
      if (c !== cur) moved++;
    }
    if (!moved) break;
  }
  // no clean seat: set it where it collides least rather than drop a name from the poster, and say so
  for (const n of order) if (!placed.has(n)) {
    const all = [...statics.get(n)[0], ...statics.get(n)[1]];
    const clash = c => d3.sum(placed, ([, o]) => boxHit(c.b, o.b) ? 1 : 0);
    const c = d3.least(all, c => clash(c) * 100 + c.total) || candidates(n, false)[0];
    if (!c.lp && c.leader) c.lp = leaderPoints(n, c.b);
    c.forced = true;
    placed.set(n, c);
  }
  return placed;
}

// ---------------------------------------------------------------- furniture

const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const f2 = v => +v.toFixed(2);
const furniture = [];                                // svg strings

// title block
FURNITURE.push({x0: W / 2 - 500, x1: W / 2 + 500, y0: 0, y1: V.sub + 10});
furniture.push(`<text class="grc title" x="${W / 2}" y="${V.title}" text-anchor="middle">Ὕμνοι</text>`);
furniture.push(`<text class="sub" x="${W / 2}" y="${V.sub}" text-anchor="middle">${MODE === 'gods'
  ? 'the names in the Homeric Hymns, gathered round the gods the hymns are sung to'
  : 'every god, nymph, hero, mortal, group, creature and place named in the Homeric Hymns'}</text>`);

// bottom band: legend, key to the hymns (or the hubs), colophon
FURNITURE.push({x0: 0, x1: W, y0: V.rule1 - 12, y1: H});
{
  let y = V.rule1;
  furniture.push(`<line class="rule" x1="${MARGIN}" x2="${W - MARGIN}" y1="${y}" y2="${y}"/>`);
  // legend: one centred line
  y = V.legend;
  const items = [];
  const LFS = 15;
  for (const k of KINDS) items.push({w: 16 + GARAMOND.width(KIND_PL[k], LFS), svg: x =>
    `<circle cx="${f2(x + 5)}" cy="${y - 5}" r="5" fill="${C[k]}"/><text class="leg" x="${f2(x + 15)}" y="${y}">${KIND_PL[k]}</text>`});
  {
    const rs = [1, 10, 100].map(rEntity), txt = 'named 1, 10, 100 times';
    const wd = d3.sum(rs, r => 2 * r) + 2 * 4;
    items.push({w: wd + 8 + GARAMOND.width(txt, LFS), svg: x => {
      let s = '', cx = x;
      for (const r of rs) { s += `<circle cx="${f2(cx + r)}" cy="${y - 5}" r="${f2(r)}" fill="${C.muted}" fill-opacity="0.55"/>`; cx += 2 * r + 4; }
      return s + `<text class="leg" x="${f2(x + wd + 8)}" y="${y}">${txt}</text>`;
    }});
  }
  if (MODE === 'hymns') {
    items.push({w: 30 + GARAMOND.width('a hymn, by length', LFS), svg: x =>
      `<circle class="hymn" cx="${f2(x + 10)}" cy="${y - 5}" r="10"/><text class="grc" x="${f2(x + 10)}" y="${y - 1.5}" text-anchor="middle" font-size="10">γʹ</text>` +
      `<text class="leg" x="${f2(x + 25)}" y="${y}">a hymn, by length</text>`});
    items.push({w: 34 + GARAMOND.width('names it', LFS), svg: x =>
      `<line class="link" x1="${x}" x2="${x + 28}" y1="${y - 5}" y2="${y - 5}" stroke-width="1"/><text class="leg" x="${f2(x + 33)}" y="${y}">names it</text>`});
    items.push({w: 34 + GARAMOND.width('is dedicated to', LFS), svg: x =>
      `<line class="link ded" x1="${x}" x2="${x + 28}" y1="${y - 5}" y2="${y - 5}"/><text class="leg" x="${f2(x + 33)}" y="${y}">is dedicated to</text>`});
  } else {
    const hubTxt = 'a god the hymns are sung to', linkTxt = 'joins a god to each name in the hymns sung to it';
    items.push({w: 25 + GARAMOND.width(hubTxt, LFS), svg: x =>
      `<circle class="node hub" cx="${f2(x + 10)}" cy="${y - 5}" r="10" fill="${C.god}"/><text class="leg" x="${f2(x + 25)}" y="${y}">${hubTxt}</text>`});
    items.push({w: 34 + GARAMOND.width(linkTxt, LFS), svg: x =>
      `<line class="link" x1="${x}" x2="${x + 28}" y1="${y - 5}" y2="${y - 5}" stroke-width="1"/><text class="leg" x="${f2(x + 33)}" y="${y}">${linkTxt}</text>`});
  }
  const gap = 26, tot = d3.sum(items, i => i.w) + gap * (items.length - 1);
  let x = (W - tot) / 2;
  for (const it of items) { furniture.push(it.svg(x)); x += it.w + gap; }

  y = V.key;
  const KFS = KEY.fs, LEAD = KEY.lead, COLS = KEY.cols, per = KEY.rows;
  if (MODE === 'gods') {
    // the hubs, four columns: name, English name, the numerals of its hymns (and in brackets those it shares as
    // second dedicatee, whose names hang from the first)
    const rows = HUBS.map(id => {
      const own = D.hymns.filter(h => hubOf(h) === id), shared = D.hymns.filter(h => hubOf(h) !== id && h.dedicatees.includes(id));
      return {grc: byId.get(id).label, en: E[id] ? E[id].label_en : own[0].title_en,
        nums: [...own.map(h => h.numeral), ...shared.map(h => `(${h.numeral})`)].join(' ')};
    });
    const wGrc = d3.max(rows, r => PORSON.width(r.grc, KFS));
    const wEn = d3.max(rows, r => GARAMOND_I.width(r.en, KFS));
    const wNums = d3.max(rows, r => PORSON.width(r.nums, KFS));
    const colW = wGrc + 12 + wEn + 14 + wNums;
    const colGap = (W - 2 * MARGIN - COLS * colW) / (COLS - 1);
    rows.forEach((row, i) => {
      const c = Math.floor(i / per), r = i % per;
      const x0 = MARGIN + c * (colW + colGap), yy = y + r * LEAD;
      furniture.push(`<g class="key"><text class="grc" x="${f2(x0)}" y="${f2(yy)}">${esc(row.grc)}</text>` +
        `<text class="en" x="${f2(x0 + wGrc + 12)}" y="${f2(yy)}">${esc(row.en)}</text>` +
        `<text class="grc" x="${f2(x0 + colW)}" y="${f2(yy)}" text-anchor="end">${esc(row.nums)}</text></g>`);
    });
  } else {
    // the 34 hymns, three columns
    const wNum = d3.max(D.hymns, h => PORSON.width(h.numeral, KFS));
    const wGrc = d3.max(D.hymns, h => PORSON.width(h.title_grc, KFS));
    const wEn = d3.max(D.hymns, h => GARAMOND_I.width(h.title_en, KFS));
    const wLn = d3.max(D.hymns, h => GARAMOND.width(String(h.lines), KFS));
    const colW = wNum + 10 + wGrc + 14 + wEn + 12 + wLn;
    const colGap = (W - 2 * MARGIN - COLS * colW) / (COLS - 1);
    D.hymns.forEach((h, i) => {
      const c = Math.floor(i / per), r = i % per;
      const x0 = MARGIN + c * (colW + colGap), yy = y + r * LEAD;
      furniture.push(`<g class="key"><text class="grc" x="${f2(x0 + wNum)}" y="${f2(yy)}" text-anchor="end">${esc(h.numeral)}</text>` +
        `<text class="grc" x="${f2(x0 + wNum + 10)}" y="${f2(yy)}">${esc(h.title_grc)}</text>` +
        `<text class="en" x="${f2(x0 + wNum + 10 + wGrc + 14)}" y="${f2(yy)}">${esc(h.title_en)}</text>` +
        `<text class="ln" x="${f2(x0 + colW)}" y="${f2(yy)}" text-anchor="end">${h.lines}</text></g>`);
    });
  }
  furniture.push(`<line class="rule" x1="${MARGIN}" x2="${W - MARGIN}" y1="${V.rule2}" y2="${V.rule2}"/>`);
  // colophon
  y = V.colo;
  const colo = ['Every name in the thirty-four Homeric Hymns, read line by line in the Greek. Text: H. G. Evelyn-White (1914), ' +
    'via the Perseus Digital Library;', 'Hymn 34, <tspan class="grc">Εἰς Ξένους</tspan>, from T. W. Allen (1912). ' +
    'After a graph drawn by hand by Peter Danenberg in 2009' +
    (MODE === 'gods' ? ', whose topology this is: each hymn folded into the god it is sung to.' : '.')];
  colo.forEach((t, i) => furniture.push(`<text class="colo" x="${W / 2}" y="${f2(y + i * 18)}" text-anchor="middle">${t}</text>`));
  furniture.push(`<text class="url" x="${W / 2}" y="${f2(V.url)}" text-anchor="middle">hymnoi.org</text>`);
}

// ---------------------------------------------------------------- run placement, label overrides

const placed = placeLabels();
console.log(`placement: ${Date.now() - T0} ms`);
const unplaced = ents.filter(n => placed.get(n).forced);
for (const o of OVERRIDES.filter(o => o.id.endsWith('.label'))) {
  const n = byId.get(o.id.slice(0, -6));
  if (!n || !placed.has(n)) { unknown.push(o.id); continue; }
  const c = placed.get(n), w = c.b.x1 - c.b.x0, h = c.b.y1 - c.b.y0;
  let x0 = c.b.x0 + (o.dx || 0), y0 = c.b.y0 + (o.dy || 0);
  if (o.x !== null && o.y !== null) { x0 = o.x; y0 = o.y - ASC * n.fs; }   // x,y: the label's baseline start
  c.b = {x0, x1: x0 + w, y0, y1: y0 + h};
  const nearDisc = boxCircle(c.b, n.x, n.y, n.r, 6);
  c.lp = nearDisc ? null : leaderPoints(n, c.b);
}
// audit the final page (overrides included): label on label, label on disc
const clashes = [];
{
  const ps = [...placed];
  for (let i = 0; i < ps.length; i++) {
    const [n, c] = ps[i];
    for (let j = i + 1; j < ps.length; j++) if (boxHit(c.b, ps[j][1].b, 0)) clashes.push(`${n.id} × ${ps[j][0].id}`);
    for (const m of G.nodes) if (boxCircle(c.b, m.x, m.y, m.r, m === n ? -0.5 : 0)) clashes.push(`${n.id} on ${m.id}`);
  }
}

// ---------------------------------------------------------------- SVG

const linkW = l => l.ded ? 1.1 : 0.45 + Math.sqrt(l.w) * 0.42;
const style = `
@font-face { font-family: "EB Garamond"; src: url(../fonts/ebgaramond-roman.woff2) format("woff2"); font-style: normal; font-weight: 400 800; }
@font-face { font-family: "EB Garamond"; src: url(../fonts/ebgaramond-italic.woff2) format("woff2"); font-style: italic; font-weight: 400 800; }
@font-face { font-family: "GFS Porson"; src: url(../fonts/GFSPorson.otf) format("opentype"); }
text { font-family: "EB Garamond", serif; fill: ${C.ink}; }
.grc { font-family: "GFS Porson", "EB Garamond", serif; }
.title { font-size: 120px; }
.sub { font-size: 24px; font-style: italic; fill: ${C.muted}; }
.leg { font-size: 15px; }
.key text { font-size: 13.5px; }
.key .en { font-style: italic; fill: ${C.muted}; }
.key .ln { fill: ${C.muted}; font-variant-numeric: oldstyle-nums; }
.colo { font-size: 14px; font-style: italic; fill: ${C.muted}; }
.colo .grc { font-style: normal; }
.url { font-size: 17px; letter-spacing: 0.06em; }
.rule { stroke: ${C.rule}; stroke-width: 0.8; }
.link { stroke: #8c7f6c; stroke-opacity: 0.38; fill: none; }
.link.ded { stroke: ${C.ink}; stroke-opacity: 0.6; stroke-dasharray: 3 2.5; stroke-width: 1.1; }
.leader { stroke: ${C.muted}; stroke-width: 0.5; fill: none; }
.node { stroke: ${C.paper}; stroke-width: 0.8; }
.hymn { fill: ${C.hymn}; stroke: ${C.ink}; stroke-width: 1.1; }
.lab { font-family: "GFS Porson", "EB Garamond", serif; paint-order: stroke; stroke: ${C.paper}; stroke-linejoin: round; }
.num { font-family: "GFS Porson", "EB Garamond", serif; }
` + (MODE === 'gods' ? `.node.hub { stroke: ${C.ink}; stroke-width: 1.1; }
` : '');

const out = [];
out.push(`<?xml version="1.0" encoding="UTF-8"?>`);
out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="24in" height="38.833in" viewBox="0 0 ${W} ${H}">`);
out.push(`<title>Ὕμνοι: the names in the Homeric Hymns${MODE === 'gods' ? ', gathered round the gods the hymns are sung to' : ''}</title>`);
out.push(`<style>${style}</style>`);
if (!ARGS.has('--no-fill')) out.push(`<rect width="${W}" height="${H}" fill="${C.paper}"/>`);
out.push(`<g id="links">`);
for (const l of G.links)
  out.push(`<line class="link${l.ded ? ' ded' : ''}" x1="${f2(l.source.x)}" y1="${f2(l.source.y)}" x2="${f2(l.target.x)}" y2="${f2(l.target.y)}"${l.ded ? '' : ` stroke-width="${f2(linkW(l))}"`}/>`);
out.push(`</g><g id="leaders">`);
for (const [n, c] of placed) if (c.lp) out.push(`<line class="leader" x1="${f2(c.lp[0])}" y1="${f2(c.lp[1])}" x2="${f2(c.lp[2])}" y2="${f2(c.lp[3])}"/>`);
out.push(`</g><g id="nodes">`);
for (const n of G.nodes) {
  if (n.type === 'hymn')
    out.push(`<g id="${n.id}"><circle class="hymn" cx="${f2(n.x)}" cy="${f2(n.y)}" r="${f2(n.r)}"/>` +
      `<text class="num" x="${f2(n.x)}" y="${f2(n.y + n.fs * 0.3)}" text-anchor="middle" font-size="${f2(n.fs)}">${esc(n.label)}</text></g>`);
  else out.push(`<circle id="n-${n.id}" class="node${n.hub ? ' hub' : ''}" cx="${f2(n.x)}" cy="${f2(n.y)}" r="${f2(n.r)}" fill="${C[n.kind] || C.hymn}"/>`);
}
out.push(`</g><g id="labels">`);
for (const n of ents) {
  const c = placed.get(n);
  if (!c) continue;
  out.push(`<text class="lab" x="${f2(c.b.x0 + 0.3)}" y="${f2(c.b.y0 + ASC * n.fs)}" font-size="${f2(n.fs)}" stroke-width="${f2(1.2 + n.fs * 0.12)}">${esc(n.label)}</text>`);
}
out.push(`</g><g id="furniture">`);
out.push(...furniture);
out.push(`</g></svg>`);
fs.mkdirSync(OUT, {recursive: true});
const svgFile = path.join(OUT, BASE + '.svg');
fs.writeFileSync(svgFile, out.join('\n') + '\n');

// ---------------------------------------------------------------- report, PDF, preview

const missing = [...MISSING];
console.log(`${G.nodes.length} nodes (${ents.length} names, ${HUBS.length} hubs), ${G.links.length} links; ` +
  `${placed.size} labels placed, ${[...placed.values()].filter(c => c.lp).length} with leaders, ${unplaced.length} unplaced` +
  (unplaced.length ? ': ' + unplaced.map(n => n.id).join(' ') : ''));
if (unknown.length) console.log('overrides naming nothing:', unknown.join(' '));
if (clashes.length) console.log(`WARNING: ${clashes.length} overlaps on the page:`, clashes.join(', '));
const minFs = d3.min(G.nodes, n => n.fs);
if (minFs < 6) console.log(`WARNING: smallest type is ${minFs.toFixed(1)} pt`);
if (missing.length) console.log('glyphs not in the fonts:', missing.join(' '));
console.log('wrote', path.relative(ROOT, svgFile));
if (ARGS.has('--svg')) process.exit(0);

const wrapper = path.join(OUT, BASE + '.html');
fs.writeFileSync(wrapper, `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: 24in 38.833in; margin: 0 }
html, body { margin: 0; padding: 0; }
svg { display: block; width: 24in; height: 38.833in; }
</style></head><body>
${out.slice(1).join('\n')}
</body></html>
`);
const pdf = path.join(OUT, BASE + '.pdf');
execFileSync('google-chrome', ['--headless=new', '--no-pdf-header-footer', '--disable-gpu', '--virtual-time-budget=10000',
  '--run-all-compositor-stages-before-draw', `--print-to-pdf=${pdf}`, 'file://' + wrapper], {stdio: ['ignore', 'ignore', 'pipe']});
console.log('wrote', path.relative(ROOT, pdf));
const fonts = execFileSync('pdffonts', [pdf], {encoding: 'utf8'});
const fontLines = fonts.split('\n').slice(2).filter(Boolean);
const want = ['Porson', 'Garamond'];
for (const w of want) if (!fontLines.some(l => l.includes(w) && /\byes\b/.test(l.slice(60))))
  { console.log(`ERROR: ${w} is not embedded (did Chrome print before the fonts loaded?):\n${fonts}`); process.exitCode = 1; }
console.log('fonts:', [...new Set(fontLines.map(l => `${l.split(/\s+/)[0]} (${l.slice(37, 54).trim()})`))].join(', '));
const png = path.join(OUT, BASE + '-preview');
execFileSync('pdftoppm', ['-png', '-singlefile', '-scale-to-x', '1200', '-scale-to-y', '-1', pdf, png]);
console.log('wrote', path.relative(ROOT, png + '.png'));
