// Hymnoi, the matrix: the 34 hymns across, every name down, a mark per (name, hymn).
// Data: data/hymnoi.json, built by tools/build.py. Filters keep the semantics of hymnoi.js.
'use strict';

const KINDS = ['god', 'nymph', 'hero', 'mortal', 'group', 'creature', 'place'];
const KIND_PL = {god: 'gods', nymph: 'nymphs', hero: 'heroes', mortal: 'mortals', group: 'groups',
  creature: 'creatures', place: 'places'};
const CORE = new Set(['name', 'epithet', 'patronymic', 'adjective', 'ethnic']);
const TYPE_LABEL = {epithet: 'epithet', patronymic: 'patronymic', adjective: 'adjective', ethnic: 'ethnic',
  periphrasis: 'periphrasis', personification: 'personification'};
const css = getComputedStyle(document.documentElement);
const color = k => css.getPropertyValue('--' + k).trim();
const norm = s => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ς/g, 'σ').replace(/[ʼ’'᾽]/g, '');
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const lineNum = l => parseInt(l, 10) + (/[a-z]$/.test(l) ? (l.charCodeAt(l.length - 1) - 96) / 10 : 0);
// Greek collation: diacritics stripped, then the Greek alphabet order of Intl.
const collator = new Intl.Collator('el', {sensitivity: 'base'});
const strip = s => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/[ʼ’'᾽]/g, '');
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// The poster: 24 × 38.83 in at 96 CSS px to the inch, the golden ratio of the 2009 print.
const POSTER = {w: 2304, h: 3727, margin: 58};

const state = {phrases: true, doubtful: false, sort: 'first', widths: 'equal', off: new Set(),
  selected: null, hymn: null, print: false};
let D, E, H, M, greekBy, englishBy, CMAX, rows, G;
const wrap = document.getElementById('wrap');
const svg = d3.select('#matrix'), head = d3.select('#head');
const tip = document.getElementById('tip');

fetch('data/hymnoi.json').then(r => r.json()).then(init);

function init(data) {
  D = data;
  E = D.entities;
  H = new Map(D.hymns.map(h => [h.n, h]));
  M = D.mentions.map(r => Object.fromEntries(D.mention_cols.map((c, i) => [c, r[i]])));
  greekBy = new Map();
  for (const [hymn, line, text, note] of D.greek) {
    if (!greekBy.has(hymn)) greekBy.set(hymn, new Map());
    greekBy.get(hymn).set(line, {hymn, line, text, note});
  }
  englishBy = d3.group(D.english.map(([hymn, line, text]) => ({hymn, line, text})), d => d.hymn);
  for (const [, v] of englishBy) v.sort((a, b) => lineNum(a.line) - lineNum(b.line));
  // The largest cell over every mention, so the size key does not move with the filters.
  CMAX = d3.max(d3.rollups(M, v => v.length, m => m.entity + '|' + m.hymn), d => d[1]);

  controls();
  key();
  const dl = d3.select('#names');
  for (const e of Object.values(E)) if (e.n) {
    dl.append('option').attr('value', e.label);
    dl.append('option').attr('value', e.label_en);
  }
  fromHash();
  const fonts = ['14px "GFS Porson"', '14px "EB Garamond"', 'italic 14px "EB Garamond"'].map(f => document.fonts.load(f));
  Promise.all(fonts).catch(() => null).then(() => {
    if (/(^|&)poster=1/.test(location.hash.slice(1))) state.print = true;
    render();
    if (state.selected) select(state.selected, state.hymn, {scroll: true, quiet: true});
  });
  let t;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { if (!state.print) render(); }, 120); });
  window.addEventListener('hashchange', () => {
    const before = state.selected;
    fromHash();
    render();
    if (state.selected && state.selected !== before) select(state.selected, state.hymn, {scroll: true, quiet: true});
  });
  const toPrint = on => { if (state.print !== on) { state.print = on; render(); } };
  window.addEventListener('beforeprint', () => toPrint(true));
  window.addEventListener('afterprint', () => toPrint(false));
  matchMedia('print').addEventListener('change', e => toPrint(e.matches));
}

// ---- URL hash: #e=leto&h=3 (also phrases=0, doubtful=1, sort=alpha, widths=lines, poster=1) ----

function fromHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  state.doubtful = p.get('doubtful') === '1';
  state.phrases = p.get('phrases') !== '0';
  state.sort = ['first', 'hymns', 'mentions', 'alpha'].includes(p.get('sort')) ? p.get('sort') : 'first';
  state.widths = p.get('widths') === 'lines' ? 'lines' : 'equal';
  state.selected = p.get('e') && E[p.get('e')] ? p.get('e') : null;
  state.hymn = state.selected && p.get('h') ? +p.get('h') : null;
  document.getElementById('doubtful').checked = state.doubtful;
  document.getElementById('phrases').checked = state.phrases;
  document.getElementById('sort').value = state.sort;
  document.getElementById('widths').value = state.widths;
}

function filterParams() {
  const p = new URLSearchParams();
  if (state.doubtful) p.set('doubtful', '1');
  if (!state.phrases) p.set('phrases', '0');
  return p;
}

function toHash() {
  const p = filterParams();
  if (state.sort !== 'first') p.set('sort', state.sort);
  if (state.widths !== 'equal') p.set('widths', state.widths);
  if (state.selected) p.set('e', state.selected);
  if (state.selected && state.hymn) p.set('h', state.hymn);
  const s = p.toString();
  if (location.hash.slice(1) !== s) history.replaceState(null, '', s ? '#' + s : location.pathname);
  const g = filterParams();
  if (state.selected) g.set('e', state.selected);
  document.getElementById('to-graph').href = 'index.html' + (g.toString() ? '#' + g : '');
}

// Same semantics as visibleMentions() in hymnoi.js.
function visibleMentions() {
  return M.filter(m => (m.shown || state.doubtful) && (state.phrases || CORE.has(m.type))
    && !state.off.has(E[m.entity].kind));
}

function buildRows() {
  const by = d3.group(visibleMentions(), m => m.entity);
  const out = [];
  for (const [id, ms] of by) {
    const cells = d3.group(ms, m => m.hymn);
    const first = d3.least(ms, (a, b) => a.hymn - b.hymn || lineNum(a.line) - lineNum(b.line));
    out.push({id, e: E[id], kind: E[id].kind, ms, cells, n: ms.length, hymns: cells.size, first,
      key: strip(E[id].label)});
  }
  const byFirst = (a, b) => a.first.hymn - b.first.hymn || lineNum(a.first.line) - lineNum(b.first.line);
  const cmp = {
    first: byFirst,
    hymns: (a, b) => b.hymns - a.hymns || b.n - a.n || byFirst(a, b),
    mentions: (a, b) => b.n - a.n || b.hymns - a.hymns || byFirst(a, b),
    alpha: (a, b) => collator.compare(a.key, b.key) || collator.compare(a.e.label, b.e.label),
  }[state.sort];
  out.sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || cmp(a, b));
  return out;
}

// ---- text measurement ----

const ctx = document.createElement('canvas').getContext('2d');
function textWidth(s, px, font = '"GFS Porson"', style = '') {
  ctx.font = `${style} ${px}px ${font}`;
  return ctx.measureText(s).width;
}
function fitText(s, px, max, font, style) {
  if (textWidth(s, px, font, style) <= max) return s;
  while (s.length > 1 && textWidth(s + '…', px, font, style) > max) s = s.slice(0, -1);
  return s.trimEnd() + '…';
}

// ---- layout ----

function geometry() {
  const P = state.print;
  const groups = d3.groups(rows, r => r.kind);
  const g = {P, groups};
  g.W = P ? POSTER.w : Math.max(wrap.clientWidth, 760);
  g.mx = P ? POSTER.margin : 10;
  g.title = P ? 210 : 0;            // poster title block
  g.headH = P ? 150 : 112;          // column heads
  g.foot = P ? 250 : 34;            // column totals (+ poster notes)
  g.top = P ? POSTER.margin + g.title + g.headH : 6;
  const gapRows = 0.9 * Math.max(0, groups.length - 1);
  if (P) {
    const avail = POSTER.h - 2 * POSTER.margin - g.title - g.headH - g.foot;
    g.row = Math.min(22, avail / (rows.length + gapRows));
  } else g.row = 17;
  g.gap = g.row * 0.9;
  g.font = P ? Math.min(15, g.row * 0.9) : 13.5;
  g.enFont = g.font * 0.92;
  g.kindFont = g.font * 1.05;
  // horizontal: [margin][kind gutter][labels] columns [count][English][margin]
  g.gutter = d3.max(KINDS, k => textWidth(KIND_PL[k], g.kindFont, '"EB Garamond"', 'italic')) + 14;
  g.labelW = d3.max(rows, r => textWidth(r.e.label, g.font)) + 12 || 80;
  g.cntW = textWidth('888', g.font * 0.85, '"EB Garamond"') + 10;
  const enMax = d3.max(rows, r => textWidth(r.e.label_en, g.enFont, '"EB Garamond"', 'italic')) || 0;
  g.enW = P ? Math.min(enMax, 330) + 8 : 0;
  if (!P && g.W > 1500) g.enW = Math.min(enMax, 230) + 8;
  g.x0 = g.mx + g.gutter + g.labelW;
  g.x1 = g.W - g.mx - g.cntW - g.enW;
  const avail = g.x1 - g.x0, n = D.hymns.length;
  let ws;
  if (state.widths === 'lines') {
    const floor = Math.min(avail / n, P ? 34 : 24);
    const total = d3.sum(D.hymns, h => h.lines);
    ws = D.hymns.map(h => floor + (avail - n * floor) * h.lines / total);
  } else ws = D.hymns.map(() => avail / n);
  let x = g.x0;
  g.cols = D.hymns.map((h, i) => { const c = {h, x, w: ws[i], cx: x + ws[i] / 2}; x += ws[i]; return c; });
  g.colBy = new Map(g.cols.map(c => [c.h.n, c]));
  // rows
  let y = g.top;
  g.groupY = [];
  groups.forEach(([kind, rs], gi) => {
    if (gi) y += g.gap;
    g.groupY.push({kind, y, n: rs.length});
    for (const r of rs) { r.y = y; y += g.row; }
  });
  g.bottom = y;
  g.H = P ? POSTER.h : y + g.foot;
  return g;
}

// mark size: 1 mention is a visible dot, CMAX fills the row
function radius(c) {
  const rmax = Math.min(G.row * 0.5 - 0.4, d3.min(G.cols, k => k.w) * 0.42);
  const rmin = Math.max(1.6, rmax * 0.26);
  return rmin + (rmax - rmin) * Math.sqrt((c - 1) / (CMAX - 1));
}

function render() {
  rows = buildRows();
  G = geometry();
  const g = G, P = g.P;
  svg.attr('width', g.W).attr('height', g.H).attr('viewBox', [0, 0, g.W, g.H]).classed('poster', P);
  svg.selectAll('*').remove();
  head.selectAll('*').remove();
  if (P) {
    svg.append('rect').attr('width', g.W).attr('height', g.H).attr('fill', css.getPropertyValue('--paper').trim());
    posterTitle(svg.append('g'));
    drawHead(svg.append('g').attr('transform', `translate(0,${g.top - g.headH})`));
  } else {
    head.attr('width', g.W).attr('height', g.headH);
    drawHead(head);
  }
  const under = svg.append('g').attr('class', 'under');
  g.colBand = under.append('rect').attr('class', 'colband').attr('visibility', 'hidden');
  g.rowBand = under.append('rect').attr('class', 'band').attr('visibility', 'hidden');
  g.selBand = under.append('rect').attr('class', 'band sel').attr('visibility', 'hidden');
  drawGrid(svg.append('g'));
  drawLabels(svg.append('g'));
  drawMarks(svg.append('g').attr('class', 'marks'));
  drawFoot(svg.append('g'));
  if (P) posterNotes(svg.append('g'));
  svg.on('mousemove', hover).on('mouseleave', () => hover(null)).on('click', click);
  markSelected();
  toHash();
  if (!P) drawKeySizes();   // the size key in the panel follows the row height
}

function drawHead(sel) {
  const g = G, P = g.P, h = g.headH;
  const nf = P ? 22 : 15.5, df = P ? 15 : 12, lf = P ? 12 : 10;
  const col = sel.selectAll('g.hcol').data(g.cols).join('g').attr('class', 'hcol')
    .attr('transform', c => `translate(${c.cx},0)`)
    .on('mouseenter', (e, c) => { headTip(e, c.h); lightCol(c); })
    .on('mousemove', e => moveTip(e))
    .on('mouseleave', () => { hideTip(); lightCol(null); })
    .on('click', (e, c) => { location.href = 'index.html#' + withParams({h: c.h.n}); });
  col.append('rect').attr('x', c => -c.w / 2).attr('width', c => c.w).attr('height', h).attr('fill', 'transparent');
  col.append('text').attr('class', 'numeral').attr('text-anchor', 'middle').attr('y', h - (P ? 30 : 22))
    .attr('font-size', c => Math.min(nf, c.w * 0.62)).text(c => c.h.numeral);
  col.append('text').attr('class', 'num').attr('text-anchor', 'middle').attr('y', h - (P ? 10 : 7))
    .attr('font-size', c => Math.min(lf, c.w * 0.45)).text(c => c.h.lines);
  // the addressee, rising at an angle
  col.append('text').attr('class', 'ded')
    .attr('transform', `translate(${P ? 2 : 1},${h - (P ? 54 : 41)}) rotate(-55)`)
    .attr('font-size', df)
    .text(c => c.h.dedicatees.length ? c.h.dedicatees.map(d => E[d].label).join(', ') : c.h.title_grc);
  sel.append('line').attr('class', 'headrule').attr('x1', g.x0).attr('x2', g.x1).attr('y1', h - 0.5).attr('y2', h - 0.5);
  sel.append('text').attr('class', 'en').attr('x', g.x0 - 8).attr('y', h - (P ? 10 : 7)).attr('text-anchor', 'end')
    .attr('font-size', lf * 1.05).text('lines');
}

function drawGrid(sel) {
  const g = G;
  for (const c of g.cols.slice(1)) sel.append('line').attr('class', 'colrule')
    .attr('x1', c.x).attr('x2', c.x).attr('y1', g.top).attr('y2', g.bottom);
  // a dotted hairline every five rows, a solid one between kinds
  for (const [gi, gy] of g.groupY.entries()) {
    if (gi) sel.append('line').attr('class', 'grouprule').attr('x1', g.mx).attr('x2', g.W - g.mx)
      .attr('y1', gy.y - g.gap / 2).attr('y2', gy.y - g.gap / 2);
    for (let i = 5; i < gy.n; i += 5) sel.append('line').attr('class', 'fiverule')
      .attr('x1', g.mx + g.gutter).attr('x2', g.W - g.mx).attr('y1', gy.y + i * g.row).attr('y2', gy.y + i * g.row);
  }
}

function drawLabels(sel) {
  const g = G;
  for (const gy of g.groupY) {
    const t = sel.append('text').attr('class', 'kindlab').attr('x', g.mx).attr('y', gy.y + g.row * 0.72)
      .attr('font-size', g.kindFont).style('fill', color(gy.kind)).text(KIND_PL[gy.kind]);
    sel.append('text').attr('class', 'num').attr('x', g.mx).attr('y', gy.y + g.row * 1.72)
      .attr('font-size', g.kindFont * 0.8).text(gy.n);
    void t;
  }
  sel.selectAll('text.rl').data(rows).join('text').attr('class', 'rl')
    .attr('x', g.x0 - 7).attr('y', r => r.y + g.row * 0.72).attr('text-anchor', 'end')
    .attr('font-size', g.font).text(r => r.e.label);
  sel.selectAll('text.cnt').data(rows).join('text').attr('class', 'cnt')
    .attr('x', g.x1 + g.cntW - 4).attr('y', r => r.y + g.row * 0.72).attr('text-anchor', 'end')
    .attr('font-size', g.font * 0.85).text(r => r.n);
  if (g.enW) sel.selectAll('text.en').data(rows).join('text').attr('class', 'en')
    .attr('x', g.x1 + g.cntW + 6).attr('y', r => r.y + g.row * 0.72)
    .attr('font-size', g.enFont).text(r => fitText(r.e.label_en, g.enFont, g.enW - 8, '"EB Garamond"', 'italic'));
}

function drawMarks(sel) {
  const g = G;
  const ticks = state.widths === 'lines';
  for (const r of rows) {
    const fill = color(r.kind);
    const cy = r.y + g.row / 2;
    for (const [hn, ms] of r.cells) {
      const c = g.colBy.get(hn);
      if (ticks) {
        const pad = Math.min(3, c.w * 0.12), span = c.w - 2 * pad, len = H.get(hn).lines;
        sel.append('rect').attr('x', c.x + 0.5).attr('y', r.y + 0.5).attr('width', c.w - 1).attr('height', g.row - 1)
          .attr('fill', fill).attr('opacity', 0.1);
        for (const line of new Set(ms.map(m => m.line))) {
          const x = c.x + pad + span * Math.min(1, Math.max(0, (lineNum(line) - 0.5) / len));
          sel.append('line').attr('class', 'tick').attr('x1', x).attr('x2', x)
            .attr('y1', cy - g.row * 0.36).attr('y2', cy + g.row * 0.36)
            .attr('stroke', fill).attr('stroke-width', g.P ? 1.6 : 1.3);
        }
      } else {
        const rr = radius(ms.length);
        sel.append('circle').attr('cx', c.cx).attr('cy', cy).attr('r', rr).attr('fill', fill);
        if (ms.length > 1 && c.w >= 2 * radius(CMAX) + (g.P ? 30 : 26)) {
          sel.append('text').attr('class', 'cnt').attr('x', c.cx + rr + 2.5).attr('y', cy + g.font * 0.3)
            .attr('font-size', g.font * 0.72).text(ms.length);
        }
      }
    }
  }
  // the addressees: a ring, dashed where the hymn never names them under these filters
  const byId = new Map(rows.map(r => [r.id, r]));
  for (const c of g.cols) for (const d of c.h.dedicatees) {
    const r = byId.get(d);
    if (!r) continue;
    const ms = r.cells.get(c.h.n);
    if (ticks) sel.append('rect').attr('class', 'dedcell').attr('x', c.x + 1).attr('y', r.y + 1)
      .attr('width', c.w - 2).attr('height', g.row - 2);
    else sel.append('circle').attr('class', 'ring' + (ms ? '' : ' empty')).attr('cx', c.cx).attr('cy', r.y + g.row / 2)
      .attr('r', ms ? radius(ms.length) + 2 : radius(1) + 1.5);
  }
}

function drawFoot(sel) {
  const g = G, f = g.P ? 13 : 11;
  const vis = d3.rollup(rows.flatMap(r => [...r.cells.keys()]), v => v.length, h => h);
  const y = g.bottom + (g.P ? 26 : 20);
  sel.append('line').attr('class', 'headrule').attr('x1', g.x0).attr('x2', g.x1)
    .attr('y1', g.bottom + 4).attr('y2', g.bottom + 4);
  sel.selectAll('text.tot').data(g.cols).join('text').attr('class', 'num tot').attr('text-anchor', 'middle')
    .attr('x', c => c.cx).attr('y', y).attr('font-size', c => Math.min(f, c.w * 0.5)).text(c => vis.get(c.h.n) || '');
  sel.append('text').attr('class', 'en').attr('x', g.x0 - 8).attr('y', y).attr('text-anchor', 'end')
    .attr('font-size', f * 1.05).text('names');
}

// ---- the poster's title and notes ----

function posterTitle(sel) {
  const g = G, x = g.mx, y = POSTER.margin;
  sel.append('text').attr('x', x).attr('y', y + 92).attr('font-size', 104).text('Ὕμνοι');
  sel.append('text').attr('class', 'en').attr('x', x + 300).attr('y', y + 60).attr('font-size', 34).style('fill', 'var(--ink)')
    .text('every being and place named in the thirty-four Homeric Hymns, hymn by hymn');
  const vis = visibleMentions();
  sel.append('text').attr('class', 'en').attr('x', x + 300).attr('y', y + 102).attr('font-size', 22)
    .text(`${rows.length} names · ${vis.length} mentions · sorted ${{first: 'by first appearance', hymns: 'by number of hymns',
      mentions: 'by mentions', alpha: 'alphabetically'}[state.sort]} within each kind`
      + (state.phrases ? '' : ' · periphrases left out') + (state.doubtful ? ' · doubtful mentions included' : ''));
  // key, right-aligned
  const kx = g.W - g.mx, ky = y + 40;
  let cx = kx;
  const items = [...KINDS].reverse();
  for (const k of items) {
    const t = sel.append('text').attr('class', 'lat').attr('y', ky + 6).attr('font-size', 22).attr('text-anchor', 'end')
      .attr('x', cx).text(KIND_PL[k]);
    const w = textWidth(KIND_PL[k], 22, '"EB Garamond"');
    sel.append('circle').attr('cx', cx - w - 12).attr('cy', ky - 1).attr('r', 7).attr('fill', color(k));
    cx -= w + 40;
    void t;
  }
  sizeKey(sel.append('g').attr('transform', `translate(${kx},${ky + 52})`), 22, true);
  sel.append('line').attr('class', 'headrule').attr('x1', g.mx).attr('x2', g.W - g.mx)
    .attr('y1', y + g.title - 34).attr('y2', y + g.title - 34);
}

// the size key: marks for 1, 5, 20 and CMAX mentions, and a ringed addressee; anchored right
function sizeKey(sel, fs, right) {
  const parts = [[1, '1'], [5, '5'], [20, '20'], [CMAX, CMAX + ' mentions']];
  const items = [];
  for (const [c, t] of parts) items.push({c, t, w: 2 * radius(c) + 6 + textWidth(t, fs, '"EB Garamond"') + 18});
  items.push({ring: true, t: 'the hymn’s addressee', w: 2 * radius(3) + 10 + textWidth('the hymn’s addressee', fs, '"EB Garamond"')});
  const total = d3.sum(items, i => i.w);
  let x = right ? -total : 0;
  for (const it of items) {
    const r = it.ring ? radius(3) : radius(it.c);
    sel.append('circle').attr('cx', x + r).attr('cy', 0).attr('r', r).attr('fill', it.ring ? color('god') : '#8c7f6c');
    if (it.ring) sel.append('circle').attr('class', 'ring').attr('cx', x + r).attr('cy', 0).attr('r', r + 2);
    sel.append('text').attr('class', 'lat').attr('x', x + 2 * r + (it.ring ? 8 : 5)).attr('y', fs * 0.32)
      .attr('font-size', fs).text(it.t);
    x += it.w;
  }
  return total;
}

function posterNotes(sel) {
  const g = G, y = g.bottom + 90, fs = 19;
  const lines = [
    'Each row is a being, group or place, each column a hymn, headed by its numeral, its addressee and its length in lines. A mark is sized by how many times the hymn names the row,',
    'by name, epithet, patronymic, ethnic or periphrasis, each counted at its line; a ring marks the god the hymn is addressed to. The numbers at the right count every mention.',
    'Greek: H. G. Evelyn-White, Hesiod, the Homeric Hymns and Homerica (1914), via the Perseus Digital Library; Hymn 34, Εἰς Ξένους, from T. W. Allen, Homeri Opera V (1912).',
    'Compiled by hand by Peter Danenberg in 2009, from the index of a Loeb edition; read again line by line against the Greek, with a citation for every mention, in 2026.',
  ];
  sel.append('line').attr('class', 'grouprule').attr('x1', g.mx).attr('x2', g.W - g.mx).attr('y1', y - 36).attr('y2', y - 36);
  lines.forEach((t, i) => sel.append('text').attr('class', 'lat').attr('x', g.mx).attr('y', y + i * fs * 1.45)
    .attr('font-size', fs).style('fill', i < 2 ? 'var(--ink)' : 'var(--muted)').text(t));
}

// ---- interaction ----

function locate(e) {
  const [x, y] = d3.pointer(e, svg.node());
  const g = G;
  const r = rows.find(r => y >= r.y && y < r.y + g.row);
  if (!r) return null;
  const c = x >= g.x0 && x < g.x1 ? g.cols.find(c => x >= c.x && x < c.x + c.w) : null;
  const onLabel = x >= g.mx + g.gutter - 4 && x < g.x0 || x >= g.x1;
  return {r, c, onLabel, x, y};
}

function hover(e) {
  const at = e && locate(e);
  const g = G;
  const cell = at && at.c && at.r.cells.get(at.c.h.n);
  svg.classed('hovering', !!(at && (cell || at.onLabel)));
  if (!at || (!cell && !at.onLabel)) {
    g.rowBand.attr('visibility', 'hidden');
    lightCol(at && at.c);
    svg.selectAll('text.rl').classed('lit', false);
    if (at && at.c) lightRow(at.r); 
    hideTip();
    return;
  }
  lightRow(at.r);
  lightCol(cell ? at.c : null);
  if (cell) cellTip(e, at.r, at.c.h, cell); else rowTip(e, at.r);
}

function lightRow(r) {
  const g = G;
  g.rowBand.attr('visibility', 'visible').attr('x', g.mx + g.gutter - 4).attr('width', g.W - g.mx - (g.mx + g.gutter - 4))
    .attr('y', r.y).attr('height', g.row);
  svg.selectAll('text.rl').classed('lit', d => d === r);
}

function lightCol(c) {
  const g = G;
  if (!c) { g.colBand && g.colBand.attr('visibility', 'hidden'); head.selectAll('.hcol').classed('lit', false); return; }
  g.colBand.attr('visibility', 'visible').attr('x', c.x).attr('width', c.w).attr('y', g.top).attr('height', g.bottom - g.top);
  head.selectAll('.hcol').classed('lit', d => d === c);
}

function click(e) {
  const at = locate(e);
  if (!at) return;
  const cell = at.c && at.r.cells.get(at.c.h.n);
  if (cell) select(at.r.id, at.c.h.n);
  else if (at.onLabel) select(at.r.id, null);
}

function markSelected() {
  const g = G;
  const r = state.selected && rows.find(r => r.id === state.selected);
  svg.selectAll('text.rl').classed('sel', d => d === r);
  if (!r) { g.selBand.attr('visibility', 'hidden'); return; }
  g.selBand.attr('visibility', g.P ? 'hidden' : 'visible').attr('x', g.mx + g.gutter - 4)
    .attr('width', g.W - g.mx - (g.mx + g.gutter - 4)).attr('y', r.y).attr('height', g.row);
}

function scrollToRow(id) {
  const r = rows.find(r => r.id === id);
  if (!r) return;
  const view = wrap.clientHeight - G.headH;
  if (r.y < wrap.scrollTop + G.row || r.y > wrap.scrollTop + view - 2 * G.row) wrap.scrollTop = Math.max(0, r.y - view / 3);
}

function select(id, hymn, opt = {}) {
  state.selected = id;
  state.hymn = id ? hymn : null;
  markSelected();
  toHash();
  document.getElementById('intro').hidden = !!id;
  const det = document.getElementById('detail');
  det.hidden = !id;
  if (!id) return;
  showEntity(id, hymn);
  if (opt.scroll) scrollToRow(id);
}

// ---- tooltips ----

function placeTip(e) {
  tip.hidden = false;
  moveTip(e);
}
function moveTip(e) {
  if (!e) return;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  let x = e.clientX + 16, y = e.clientY + 16;
  if (x + w > innerWidth - 8) x = Math.max(8, e.clientX - w - 16);
  if (y + h > innerHeight - 8) y = Math.max(8, innerHeight - h - 8);
  tip.style.left = x + 'px';
  tip.style.top = y + 'px';
}
function hideTip() { tip.hidden = true; }

function headTip(e, h) {
  const names = rows.filter(r => r.cells.has(h.n)).length;
  tip.innerHTML = `<div class="grc">${h.numeral} ${esc(h.title_grc)}</div>${h.roman} · ${esc(h.title_en)}<br>
    <span class="fine">${plural(h.lines, 'line')} · ${plural(names, 'name')}</span>`;
  placeTip(e);
}

function rowTip(e, r) {
  const ex = r.e;
  tip.innerHTML = `<div class="grc k-${r.kind}" style="font-size:1.15rem">${esc(ex.label)}</div><i>${esc(ex.label_en)}</i><br>
    <span class="fine">${r.kind}${ex.subkind ? ' · ' + esc(ex.subkind) : ''} · ${plural(r.n, 'mention')} in
    ${plural(r.hymns, 'hymn')} · first at ${r.first.hymn}.${r.first.line}</span>`;
  placeTip(e);
}

function cellTip(e, r, h, ms) {
  const lines = [...d3.group(ms, m => m.line)];
  const MAX = 7;
  let html = `<div class="hd"><span class="grc k-${r.kind}" style="font-size:1.1rem">${esc(r.e.label)}</span>
    <i class="fine">${esc(r.e.label_en)}</i> · <span class="grc">${h.numeral} ${esc(h.title_grc)}</span>
    <span class="fine">${plural(ms.length, 'mention')}</span></div>`;
  for (const [line, lms] of lines.slice(0, MAX)) {
    const g = greekBy.get(h.n).get(line);
    const kinds = [...new Set(lms.map(m => TYPE_LABEL[m.type]).filter(Boolean))].map(b => `<span class="badge">${b}</span>`).join('');
    html += `<div class="tl"><span class="ln">${h.n}.${line}</span><span class="gr">${marked(g ? g.text : '', lms, r.id)}${kinds}</span></div>`;
  }
  if (lines.length > MAX) html += `<div class="more">and ${plural(lines.length - MAX, 'more line')}; click for all</div>`;
  tip.innerHTML = html;
  placeTip(e);
}

// ---- the side panel: every citation of a name (as in the graph's reader pane) ----

function englishFor(h, line) {
  const paras = englishBy.get(h) || [];
  let best = null;
  for (const p of paras) if (lineNum(p.line) <= lineNum(line)) best = p;
  return best ? best.text : '';
}

function marked(text, ms, self) {
  const STOP = new Set(['και', 'τε', 'δε', 'ηδε', 'η', 'ο', 'του', 'των', 'της', 'τον', 'την', 'το', 'εν', 'εκ', 'εσ', 'εισ']);
  const forms = ms.map(m => {
    const ws = m.form.split(/\s+/).map(norm);
    return {words: new Set(ws.length > 1 ? ws.filter(w => !STOP.has(w)) : ws), m};
  }).sort((a, b) => (b.m.entity === self) - (a.m.entity === self));
  return text.split(/([\p{L}\p{M}ʼ’']+)/u).map(tok => {
    const k = norm(tok);
    const f = k && forms.find(f => f.words.has(k));
    if (!f) return esc(tok);
    const e = E[f.m.entity];
    return `<mark class="k-${e.kind}${f.m.entity === self ? ' self' : ''}" data-entity="${f.m.entity}" title="${esc(e.label_en)}">${esc(tok)}</mark>`;
  }).join('');
}

function withParams(extra) {
  const p = filterParams();
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return p.toString();
}

function showEntity(id, hymn) {
  const e = E[id], det = document.getElementById('detail');
  const mine = M.filter(m => m.entity === id);
  const byHymn = d3.group(mine, m => m.hymn);
  const vis = new Set(visibleMentions());
  let html = `<div class="back" id="back">← all names</div>
    <h2 class="grc k-${e.kind}">${esc(e.label)}<span class="en">${esc(e.label_en)}</span></h2>
    <div class="meta">${e.kind}${e.subkind ? ' · ' + esc(e.subkind) : ''} · ${plural(mine.length, 'mention')}
    in ${plural(byHymn.size, 'hymn')} · <button class="link-btn" id="toggle-en">English</button>
    · <a class="graph-link" href="index.html#${withParams({e: id})}">in the graph →</a></div>
    <div class="cites">`;
  for (const [h, ms] of [...byHymn].sort((a, b) => a[0] - b[0])) {
    const hy = H.get(h);
    html += `<h3 data-h="${h}"${h === hymn ? ' class="here"' : ''}><a href="index.html#${withParams({h})}"><span class="grc">${hy.numeral}
      ${esc(hy.title_grc)}</span></a> <span class="fine">${esc(hy.title_en)}</span></h3>`;
    for (const [line, lms] of d3.group(ms, m => m.line)) {
      const g = greekBy.get(h).get(line);
      const onLine = M.filter(m => m.hymn === h && m.line === line && (vis.has(m) || m.entity === id));
      const badges = [...new Set(lms.flatMap(m => [TYPE_LABEL[m.type], m.certainty !== 'certain' ? m.certainty : null,
        !vis.has(m) ? 'hidden' : null]).filter(Boolean))].map(b => `<span class="badge">${b}</span>`).join('');
      const notes = [...new Set(lms.map(m => m.note).filter(Boolean))];
      html += `<div class="cite"><span class="ln">${h}.${line}</span><span class="gr">${marked(g ? g.text : '', onLine, id)}${badges}</span>
        ${notes.length ? `<span class="note">${esc(notes.join(' · '))}</span>` : ''}
        <span class="en">${esc(englishFor(h, line))}</span></div>`;
    }
  }
  det.innerHTML = html + '</div>';
  det.querySelector('#toggle-en').addEventListener('click', () => det.querySelector('.cites').classList.toggle('with-en'));
  det.querySelector('#back').addEventListener('click', () => select(null));
  det.querySelectorAll('mark[data-entity]').forEach(m => m.addEventListener('click', () =>
    select(m.dataset.entity, null, {scroll: true})));
  const panel = document.getElementById('panel');
  const here = hymn && det.querySelector(`h3[data-h="${hymn}"]`);
  panel.scrollTop = here ? here.offsetTop - panel.offsetTop - 8 : 0;
}

// ---- controls ----

function key() {
  const k = d3.select('#key');
  k.append('div').attr('class', 'kinds').selectAll('span').data(KINDS).join('span')
    .html(d => `<i style="background:${color(d)}"></i>${KIND_PL[d]}`)
    .attr('title', 'show or hide')
    .on('click', (e, d) => {
      state.off.has(d) ? state.off.delete(d) : state.off.add(d);
      d3.select(e.currentTarget).classed('off', state.off.has(d));
      render();
    });
}

function drawKeySizes() {
  const k = d3.select('#key');
  k.select('svg').remove();
  const s = k.append('svg').attr('height', 22);
  const w = sizeKey(s.append('g').attr('transform', 'translate(2,11)'), 13, false);
  s.attr('width', w + 4);
}

function controls() {
  for (const id of ['phrases', 'doubtful']) {
    document.getElementById(id).addEventListener('change', e => { state[id] = e.target.checked; render(); refreshPanel(); });
  }
  for (const id of ['sort', 'widths']) {
    document.getElementById(id).addEventListener('change', e => { state[id] = e.target.value; render(); });
  }
  document.getElementById('find').addEventListener('change', e => {
    const v = e.target.value.trim();
    const id = Object.keys(E).find(k => E[k].label === v || E[k].label_en === v || E[k].grc === v || k === v);
    if (id) select(id, null, {scroll: true});
  });
}

function refreshPanel() {
  if (state.selected) showEntity(state.selected, state.hymn);
}
