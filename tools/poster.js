#!/usr/bin/env node
// Hymnoi poster: the "hymns as hubs" graph, laid out offline and set for print at 24 × 24φ in.
//
//     node tools/poster.js            # site/data/hymnoi.json -> poster/hymnoi-hubs.{svg,pdf} + preview PNG
//     node tools/poster.js --svg      # stop after the SVG (no Chrome)
//     node tools/poster.js --no-fill  # leave the paper white instead of the site's cream
//
// Everything is derived from site/data/hymnoi.json, site/palette.css (kind colours; the paper and ink
// greys come from site/style.css unless palette.css defines them) and poster/overrides.csv, so when the
// labels or the palette change the poster follows on a re-run.
//
// Units: one SVG user unit is one PostScript point (1/72 in); the page is 1728 × 2796 pt.
//
// poster/overrides.csv, applied after the simulation (all values in points):
//     id,dx,dy,x,y
//     zeus,12,-8,,          move the node Zeus (and its label with it) by (12, -8)
//     h3,,,840,1200         put the disc of Hymn 3 at (840, 1200) from the top-left of the page
//     zeus.label,0,-6,,     nudge only the label of Zeus (after placement)
// Ids are entity ids (data/entities.csv) or h1 … h34 for the hymns.
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
const OUT = P('poster');
const BASE = 'hymnoi-hubs';

// ---------------------------------------------------------------- page

const PHI = (1 + Math.sqrt(5)) / 2;
const W = 24 * 72, H = +(24 * PHI * 72).toFixed(2);          // 1728 × 2795.96 pt
const MARGIN = 120;                                          // ≈ 1.67 in
const GRAPH = {cx: W / 2, cy: 1310, ax: 735, ay: 940};       // the graph's superellipse
const SUPER = 3.2;                                           // exponent: 2 ellipse, → ∞ rectangle

// ---------------------------------------------------------------- data

const D = JSON.parse(fs.readFileSync(P('site/data/hymnoi.json'), 'utf8'));
const E = D.entities;
const M = D.mentions.map(r => Object.fromEntries(D.mention_cols.map((c, i) => [c, r[i]])));
const KINDS = ['god', 'nymph', 'hero', 'mortal', 'group', 'creature', 'place'];
const KIND_PL = {god: 'gods', nymph: 'nymphs', hero: 'heroes', mortal: 'mortals', group: 'groups',
  creature: 'creatures', place: 'places'};

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

// ---------------------------------------------------------------- the graph (as site/hymnoi.js graphData(), default view)

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
  for (const h of D.hymns) nodes.set('h' + h.n, {id: 'h' + h.n, type: 'hymn', hymn: h, n: h.lines});
  for (const m of M.filter(m => (m.shown || DOUBTFUL) && (PHRASES || CORE.has(m.type)))) {
    const t = entNode(m.entity);
    t.n++; t.hymns.add(m.hymn);
    link('h' + m.hymn, t.id, false);
  }
  for (const h of D.hymns) for (const d of h.dedicatees) link('h' + h.n, entNode(d).id, true);
  const key = n => n.type === 'hymn' ? 'h' + String(n.hymn.n).padStart(3, '0') : 'e' + n.id;
  const ns = [...nodes.values()].sort((a, b) => d3.ascending(key(a), key(b)));
  const ls = [...links.values()].filter(l => l.w || l.ded)
    .sort((a, b) => d3.ascending(a.source + '|' + a.target, b.source + '|' + b.target));
  return {nodes: ns, links: ls};
}

const G = graphData();
const byId = new Map(G.nodes.map(n => [n.id, n]));

// sizes, in points on paper
const LABEL_MIN = 8;
for (const n of G.nodes) {
  if (n.type === 'hymn') {
    n.r = 7 + Math.sqrt(n.n) * 1.05;
    n.rs = 5 + Math.sqrt(n.n) * 0.95;                 // the site's radius, which drives the site's forces
    n.label = n.hymn.numeral;
    const w1 = PORSON.width(n.label, 1);
    n.fs = Math.min(n.r * 0.95, 1.5 * n.r / w1);
  } else {
    n.r = 2.6 + Math.sqrt(n.n) * 1.35;
    n.rs = 3 + Math.sqrt(n.n) * 1.5;
    n.label = E[n.ent].label.normalize('NFC');
    n.fs = Math.min(26, LABEL_MIN + 1.2 * Math.sqrt(n.n - 1));
    n.w = PORSON.width(n.label, n.fs) * 1.03 + 0.6;
  }
}

// ---------------------------------------------------------------- the simulation

const S = 2.05;                                       // site px -> paper pt
// Start: the hymns on a ring, clockwise from the top, kin beside kin (Apollo's, Artemis', Hermes' and Hestia's …),
// so Hymn 3 opens at the top and Hymn 2 at the foot; each name starts at the mean of its hymns, on a small
// phyllotaxis spiral. Hymns missing from RING (new data) are appended.
const RING = [3, 21, 25, 9, 27, 4, 18, 29, 24, 19, 20, 28, 11, 8, 13, 2, 14, 30, 31, 32, 22, 12, 23, 5, 6, 10, 1, 7, 26,
  15, 16, 17, 33, 34];
{
  const golden = Math.PI * (3 - Math.sqrt(5));
  const hymns = G.nodes.filter(n => n.type === 'hymn');
  const ring = [...RING.filter(h => byId.has('h' + h)), ...hymns.map(n => n.hymn.n).filter(h => !RING.includes(h))];
  const names = new Map(hymns.map(n => [n.hymn.n, new Set()]));
  for (const l of G.links) names.get(l.source.hymn ? l.source.hymn.n : +l.source.slice(1)).add(l.target);
  const wt = ring.map(h => Math.sqrt(names.get(h).size + 1));
  const tot = d3.sum(wt);
  let acc = -wt[0] / 2;
  ring.forEach((h, i) => {
    const a = -Math.PI / 2 + (acc + wt[i] / 2) / tot * 2 * Math.PI;
    acc += wt[i];
    const n = byId.get('h' + h);
    n.x = GRAPH.cx + Math.cos(a) * GRAPH.ax * 0.55;
    n.y = GRAPH.cy + Math.sin(a) * GRAPH.ay * 0.6;
  });
  G.nodes.forEach((n, i) => {
    n.vx = n.vy = 0;
    if (n.type === 'hymn') return;
    const hs = [...n.hymns].map(h => byId.get('h' + h));
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

const TICKS = 4000;
const sim = d3.forceSimulation(G.nodes)
  .alphaMin(0.0005)
  .alphaDecay(1 - Math.pow(0.0005, 1 / TICKS))
  .force('link', d3.forceLink(G.links).id(d => d.id)
    .distance(l => 18 * S + l.source.r + l.target.r)
    .strength(l => (l.ded ? 0.6 : 0.25) + Math.min(0.5, l.w * 0.05)))
  .force('charge', d3.forceManyBody().strength(n => (-30 - n.rs * 14) * S * S).distanceMax(700 * S))
  .force('collide', d3.forceCollide(n => n.r + (n.type === 'hymn' ? 9 : 3 + n.fs * 0.45)).iterations(3))
  .force('x', d3.forceX(GRAPH.cx).strength(0.05))
  .force('y', d3.forceY(GRAPH.cy).strength(0.032))
  .force('bound', forceBound(0.5))
  .stop();
for (let i = 0; i < TICKS; i++) sim.tick();

// ---------------------------------------------------------------- overrides

function readOverrides() {
  const file = P('poster/overrides.csv');
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
  return placed;
}

// ---------------------------------------------------------------- furniture

const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const f2 = v => +v.toFixed(2);
const furniture = [];                                // svg strings

// title block
const TITLE_Y = 250;
FURNITURE.push({x0: W / 2 - 300, x1: W / 2 + 300, y0: MARGIN, y1: TITLE_Y + 60});
furniture.push(`<text class="grc title" x="${W / 2}" y="${TITLE_Y}" text-anchor="middle">Ὕμνοι</text>`);
furniture.push(`<text class="sub" x="${W / 2}" y="${TITLE_Y + 44}" text-anchor="middle">every god, nymph, hero, mortal, group, creature and place named in the Homeric Hymns</text>`);

// bottom band: legend, hymn key, colophon
const BAND_Y = GRAPH.cy + GRAPH.ay + 40;
FURNITURE.push({x0: 0, x1: W, y0: BAND_Y - 20, y1: H});
{
  let y = BAND_Y;
  furniture.push(`<line class="rule" x1="${MARGIN}" x2="${W - MARGIN}" y1="${y}" y2="${y}"/>`);
  // legend: one centred line
  y += 42;
  const items = [];
  const LFS = 15;
  for (const k of KINDS) items.push({w: 16 + GARAMOND.width(KIND_PL[k], LFS), svg: x =>
    `<circle cx="${f2(x + 5)}" cy="${y - 5}" r="5" fill="${C[k]}"/><text class="leg" x="${f2(x + 15)}" y="${y}">${KIND_PL[k]}</text>`});
  items.push({w: 30 + GARAMOND.width('a hymn, by length', LFS), svg: x =>
    `<circle class="hymn" cx="${f2(x + 10)}" cy="${y - 5}" r="10"/><text class="grc" x="${f2(x + 10)}" y="${y - 1.5}" text-anchor="middle" font-size="10">γʹ</text>` +
    `<text class="leg" x="${f2(x + 25)}" y="${y}">a hymn, by length</text>`});
  items.push({w: 34 + GARAMOND.width('names it', LFS), svg: x =>
    `<line class="link" x1="${x}" x2="${x + 28}" y1="${y - 5}" y2="${y - 5}" stroke-width="1"/><text class="leg" x="${f2(x + 33)}" y="${y}">names it</text>`});
  items.push({w: 34 + GARAMOND.width('is dedicated to', LFS), svg: x =>
    `<line class="link ded" x1="${x}" x2="${x + 28}" y1="${y - 5}" y2="${y - 5}"/><text class="leg" x="${f2(x + 33)}" y="${y}">is dedicated to</text>`});
  const gap = 26, tot = d3.sum(items, i => i.w) + gap * (items.length - 1);
  let x = (W - tot) / 2;
  for (const it of items) { furniture.push(it.svg(x)); x += it.w + gap; }

  // the 34 hymns, three columns
  y += 46;
  const KFS = 13.5, LEAD = 19.5, COLS = 3;
  const per = Math.ceil(D.hymns.length / COLS);
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
  y += per * LEAD + 30;
  furniture.push(`<line class="rule" x1="${MARGIN}" x2="${W - MARGIN}" y1="${y - 14}" y2="${y - 14}"/>`);
  // colophon
  y += 22;
  const colo = ['Every name in the thirty-four Homeric Hymns, read line by line in the Greek. Text: H. G. Evelyn-White (1914), ' +
    'via the Perseus Digital Library;', 'Hymn 34, <tspan class="grc">Εἰς Ξένους</tspan>, from T. W. Allen (1912). ' +
    'After a graph drawn by hand by Peter Danenberg in 2009.'];
  colo.forEach((t, i) => furniture.push(`<text class="colo" x="${W / 2}" y="${f2(y + i * 18)}" text-anchor="middle">${t}</text>`));
  furniture.push(`<text class="url" x="${W / 2}" y="${f2(y + 2 * 18 + 22)}" text-anchor="middle">hymnoi.org</text>`);
}

// ---------------------------------------------------------------- run placement, label overrides

const placed = placeLabels();
const unplaced = ents.filter(n => !placed.has(n));
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

// ---------------------------------------------------------------- SVG

const linkW = l => l.ded ? 1.1 : 0.45 + Math.sqrt(l.w) * 0.42;
const style = `
@font-face { font-family: "EB Garamond"; src: url(../site/fonts/ebgaramond-roman.woff2) format("woff2"); font-style: normal; font-weight: 400 800; }
@font-face { font-family: "EB Garamond"; src: url(../site/fonts/ebgaramond-italic.woff2) format("woff2"); font-style: italic; font-weight: 400 800; }
@font-face { font-family: "GFS Porson"; src: url(../site/fonts/GFSPorson.otf) format("opentype"); }
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
`;

const out = [];
out.push(`<?xml version="1.0" encoding="UTF-8"?>`);
out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="24in" height="38.833in" viewBox="0 0 ${W} ${H}">`);
out.push(`<title>Ὕμνοι: the names in the Homeric Hymns</title>`);
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
  else out.push(`<circle id="n-${n.id}" class="node" cx="${f2(n.x)}" cy="${f2(n.y)}" r="${f2(n.r)}" fill="${C[n.kind]}"/>`);
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
console.log(`${G.nodes.length} nodes (${ents.length} names, ${D.hymns.length} hymns), ${G.links.length} links; ` +
  `${placed.size} labels placed, ${[...placed.values()].filter(c => c.lp).length} with leaders, ${unplaced.length} unplaced` +
  (unplaced.length ? ': ' + unplaced.map(n => n.id).join(' ') : ''));
if (unknown.length) console.log('overrides naming nothing:', unknown.join(' '));
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
  console.log(`WARNING: ${w} is not embedded:\n${fonts}`);
console.log('fonts:', fontLines.map(l => l.split(/\s+/)[0]).join(', '));
const png = path.join(OUT, BASE + '-preview');
execFileSync('pdftoppm', ['-png', '-singlefile', '-scale-to-x', '1200', '-scale-to-y', '-1', pdf, png]);
console.log('wrote', path.relative(ROOT, png + '.png'));
