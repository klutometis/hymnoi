// Hymnoi: the names in the Homeric Hymns as a force-directed graph.
// Data: data/hymnoi.json, built by tools/build.py from data/*.csv.
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
const esc = s => s.replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const lineNum = l => parseInt(l, 10) + (/[a-z]$/.test(l) ? (l.charCodeAt(l.length - 1) - 96) / 10 : 0);

const state = {hubs: 'hymns', phrases: true, doubtful: false, alllabels: false, off: new Set(), selected: null};
let D, E, H, M, greekBy, englishBy, sim, nodeSel, linkSel, zoomG, svg, zoom, width, height, current;

fetch('data/hymnoi.json').then(r => r.json()).then(init);

function init(data) {
  D = data;
  E = D.entities;
  H = new Map(D.hymns.map(h => [h.n, h]));
  const cols = D.mention_cols;
  M = D.mentions.map(r => Object.fromEntries(cols.map((c, i) => [c, r[i]])));
  greekBy = d3.group(D.greek.map(([hymn, line, text, note]) => ({hymn, line, text, note})), d => d.hymn);
  englishBy = d3.group(D.english.map(([hymn, line, text]) => ({hymn, line, text})), d => d.hymn);
  for (const [, v] of greekBy) v.sort((a, b) => lineNum(a.line) - lineNum(b.line));
  for (const [, v] of englishBy) v.sort((a, b) => lineNum(a.line) - lineNum(b.line));

  svg = d3.select('#graph');
  zoomG = svg.append('g');
  zoomG.append('g').attr('class', 'links');
  zoomG.append('g').attr('class', 'nodes');
  zoom = d3.zoom().scaleExtent([0.15, 8]).on('zoom', e => zoomG.attr('transform', e.transform));
  svg.call(zoom);
  svg.on('click', e => { if (e.target === svg.node()) select(null); });

  legend();
  controls();
  const dl = d3.select('#names');
  Object.entries(E).filter(([, e]) => e.n).forEach(([, e]) => {
    dl.append('option').attr('value', e.label);
    dl.append('option').attr('value', e.label_en);
  });
  fromHash();
  render(true);
  window.addEventListener('resize', () => render(false));
}

// URL hash: #hubs=gods&e=apollon or #h=3 (also doubtful=1, phrases=0)
function fromHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  if (p.get('hubs') === 'gods') { state.hubs = 'gods'; document.querySelector('input[value=gods]').checked = true; }
  if (p.get('doubtful') === '1') { state.doubtful = true; document.getElementById('doubtful').checked = true; }
  if (p.get('phrases') === '0') { state.phrases = false; document.getElementById('phrases').checked = false; }
  state.want = p.get('e') ? 'e:' + p.get('e') : p.get('h') ? 'h' + p.get('h') : null;
}

function toHash() {
  const p = new URLSearchParams();
  if (state.hubs === 'gods') p.set('hubs', 'gods');
  if (state.doubtful) p.set('doubtful', '1');
  if (!state.phrases) p.set('phrases', '0');
  const n = state.selected;
  if (n && n.ent) p.set('e', n.ent);
  else if (n && n.hymn) p.set('h', n.hymn.n);
  history.replaceState(null, '', p.toString() ? '#' + p : location.pathname);
  const q = n && n.ent ? '#e=' + n.ent : n && n.hymn ? '#h=' + n.hymn.n : '';
  for (const id of ['to-matrix', 'to-map']) {
    const a = document.getElementById(id);
    if (a) a.href = a.href.split('#')[0] + (id === 'to-matrix' && p.toString() ? '#' + p : q);
  }
}

function visibleMentions() {
  return M.filter(m => (m.shown || state.doubtful) && (state.phrases || CORE.has(m.type))
    && !state.off.has(E[m.entity].kind));
}

function graphData() {
  const nodes = new Map(), links = new Map();
  const entNode = id => {
    const key = 'e:' + id;
    if (!nodes.has(key)) nodes.set(key, {id: key, ent: id, type: 'entity', kind: E[id].kind, n: 0, hymns: new Set()});
    return nodes.get(key);
  };
  const link = (s, t, ded) => {
    const key = s + '|' + t;
    if (!links.has(key)) links.set(key, {source: s, target: t, w: 0, ded: false});
    const l = links.get(key);
    if (ded) l.ded = true; else l.w++;
    return l;
  };
  const ms = visibleMentions();
  if (state.hubs === 'hymns') {
    for (const h of D.hymns) nodes.set('h' + h.n, {id: 'h' + h.n, type: 'hymn', hymn: h, n: h.lines});
    for (const m of ms) {
      const t = entNode(m.entity);
      t.n++; t.hymns.add(m.hymn);
      link('h' + m.hymn, t.id, false);
    }
    for (const h of D.hymns) for (const d of h.dedicatees) {
      if (state.off.has(E[d].kind)) continue;
      link('h' + h.n, entNode(d).id, true);
    }
  } else {
    const hub = h => {
      const d = H.get(h).dedicatees[0];
      if (!d || state.off.has(E[d].kind)) {
        if (!nodes.has('x:' + h)) nodes.set('x:' + h, {id: 'x:' + h, type: 'hub', hub: true, label: H.get(h).title_grc, n: 1, hymns: new Set([h])});
        return 'x:' + h;
      }
      const n = entNode(d);
      n.hub = true;
      return n.id;
    };
    for (const h of D.hymns) hub(h.n);
    for (const m of ms) {
      const s = hub(m.hymn), t = entNode(m.entity);
      t.n++; t.hymns.add(m.hymn);
      if (s !== t.id) link(s, t.id, false);
    }
  }
  for (const n of nodes.values()) {
    n.r = n.type === 'hymn' ? 5 + Math.sqrt(n.n) * 0.95 : 3 + Math.sqrt(n.n) * 1.5;
    if (n.hub) n.r = Math.max(n.r, 10);
  }
  return {nodes: [...nodes.values()], links: [...links.values()].filter(l => l.w || l.ded)};
}

function label(n) {
  if (n.type === 'hymn') return n.hymn.numeral;
  if (n.type === 'hub') return n.label;
  const e = E[n.ent];
  return e.label;
}

function render(first) {
  const box = document.getElementById('chart').getBoundingClientRect();
  width = box.width; height = box.height;
  svg.attr('viewBox', [-width / 2, -height / 2, width, height]);
  if (!first && current) return;
  const old = new Map((current ? current.nodes : []).map(n => [n.id, n]));
  current = graphData();
  for (const n of current.nodes) {
    const o = old.get(n.id);
    if (o) { n.x = o.x; n.y = o.y; n.vx = o.vx; n.vy = o.vy; }
  }
  if (sim) sim.stop();
  sim = d3.forceSimulation(current.nodes)
    .force('link', d3.forceLink(current.links).id(d => d.id)
      .distance(l => 18 + l.source.r + l.target.r).strength(l => (l.ded ? 0.6 : 0.25) + Math.min(0.5, l.w * 0.05)))
    .force('charge', d3.forceManyBody().strength(n => -30 - n.r * 14).distanceMax(700))
    .force('collide', d3.forceCollide(n => n.r + (n.type === 'hymn' ? 6 : n.n >= 4 ? 5 : 2.5)).iterations(2))
    .force('x', d3.forceX(0).strength(0.04))
    .force('y', d3.forceY(0).strength(0.06));
  if (!old.size) { sim.stop(); sim.tick(320); }

  linkSel = zoomG.select('.links').selectAll('line').data(current.links, l => l.source.id + '|' + l.target.id)
    .join('line')
    .attr('class', l => 'link' + (l.ded ? ' ded' : ''))
    .attr('stroke-width', l => l.ded ? 1.4 : 0.6 + Math.sqrt(l.w) * 0.6);

  nodeSel = zoomG.select('.nodes').selectAll('g.node').data(current.nodes, n => n.id)
    .join(enter => {
      const g = enter.append('g');
      g.append('circle');
      g.append('text');
      return g;
    })
    .attr('class', n => 'node ' + n.type + (n.ent && E[n.ent].unnamed ? ' unnamed' : '') + (n.hub ? ' hub' : ''))
    .on('mouseenter', (e, n) => focus(n, e))
    .on('mousemove', e => moveTip(e))
    .on('mouseleave', () => focus(null))
    .on('click', (e, n) => { e.stopPropagation(); select(n); })
    .call(d3.drag()
      .on('start', (e, n) => { if (!e.active) sim.alphaTarget(0.2).restart(); n.fx = n.x; n.fy = n.y; })
      .on('drag', (e, n) => { n.fx = e.x; n.fy = e.y; })
      .on('end', (e, n) => { if (!e.active) sim.alphaTarget(0); n.fx = null; n.fy = null; }));
  nodeSel.select('circle')
    .attr('r', n => n.r)
    .attr('fill', n => n.type === 'hymn' ? null : n.type === 'hub' ? '#f3ead6' : color(n.kind));
  nodeSel.select('text')
    .text(label)
    .attr('class', n => (n.type === 'entity' && !state.alllabels && n.n < 4 && !n.hub) ? 'hide' : null)
    .attr('text-anchor', n => n.type === 'hymn' ? 'middle' : 'start')
    .attr('dy', n => n.type === 'hymn' ? '0.35em' : '0.32em')
    .attr('x', n => n.type === 'hymn' ? 0 : n.r + 2)
    .attr('font-size', n => n.type === 'hymn' ? Math.max(8, n.r * 0.75) : Math.min(28, 9 + Math.sqrt(n.n) * 1.15));
  sim.on('tick', tick);
  if (old.size) sim.alpha(0.5).restart(); else { tick(); fit(); sim.alpha(0.05).restart(); }
  const want = state.want || (state.selected && state.selected.id);
  state.want = null;
  if (want) {
    const again = current.nodes.find(n => n.id === want);
    if (again) select(again, true);
  }
  toHash();
}

function tick() {
  linkSel.attr('x1', l => l.source.x).attr('y1', l => l.source.y).attr('x2', l => l.target.x).attr('y2', l => l.target.y);
  nodeSel.attr('transform', n => `translate(${n.x},${n.y})`);
}

function fit() {
  const xs = current.nodes.map(n => n.x), ys = current.nodes.map(n => n.y);
  const [x0, x1, y0, y1] = [d3.min(xs), d3.max(xs), d3.min(ys), d3.max(ys)];
  const k = Math.min(width / (x1 - x0 + 120), height / (y1 - y0 + 60), 2);
  svg.call(zoom.transform, d3.zoomIdentity.scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2));
}

function neighbours(n) {
  const lit = new Set([n.id]);
  for (const l of current.links) {
    if (l.source.id === n.id) lit.add(l.target.id);
    if (l.target.id === n.id) lit.add(l.source.id);
  }
  return lit;
}

function focus(n, e) {
  const tip = document.getElementById('tip');
  if (!n) {
    svg.classed('focus', !!state.selected);
    if (state.selected) light(state.selected); 
    tip.hidden = true;
    return;
  }
  light(n);
  svg.classed('focus', true);
  let html;
  if (n.type === 'hymn') {
    const h = n.hymn;
    html = `<div class="grc">${h.numeral} ${esc(h.title_grc)}</div>${h.roman} · ${esc(h.title_en)} · ${h.lines} lines`;
  } else if (n.type === 'hub') {
    html = `<div class="grc">${esc(n.label)}</div>`;
  } else {
    const e = E[n.ent];
    html = `<div class="grc k-${e.kind}">${esc(e.label)}</div><i>${esc(e.label_en)}</i><br>${e.kind}${e.subkind ? ' · ' + esc(e.subkind) : ''}
      · ${n.n} mention${n.n > 1 ? 's' : ''} in ${n.hymns.size} hymn${n.hymns.size > 1 ? 's' : ''}`;
  }
  tip.innerHTML = html;
  tip.hidden = false;
  moveTip(e);
}

function light(n) {
  const lit = neighbours(n);
  nodeSel.classed('lit', d => lit.has(d.id));
  linkSel.classed('lit', l => l.source.id === n.id || l.target.id === n.id);
}

function moveTip(e) {
  if (!e) return;
  const tip = document.getElementById('tip'), box = document.getElementById('chart').getBoundingClientRect();
  tip.style.left = Math.min(e.clientX - box.left + 14, box.width - 260) + 'px';
  tip.style.top = (e.clientY - box.top + 14) + 'px';
}

// ---- side panel ----

function select(n, quiet) {
  state.selected = n;
  nodeSel.classed('selected', d => n && d.id === n.id);
  svg.classed('focus', !!n);
  if (n) light(n);
  document.getElementById('intro').hidden = !!n;
  toHash();
  const det = document.getElementById('detail');
  det.hidden = !n;
  if (!n) return;
  if (n.type === 'hymn') showHymn(n.hymn.n);
  else if (n.type === 'hub') showHymn([...n.hymns][0]);
  else showEntity(n.ent);
  if (!quiet) document.getElementById('panel').scrollTop = 0;
}

function englishFor(h, line) {
  const paras = englishBy.get(h) || [];
  let best = null;
  for (const p of paras) if (lineNum(p.line) <= lineNum(line)) best = p;
  return best ? best.text : '';
}

function marked(text, ms, self) {
  // wrap each word of each mention's form; ms: mentions on this line
  // in a phrase (Διὸς καὶ Λητοῦς υἱέ) mark the content words, not every καί on the line
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

function bindMarks(el) {
  el.querySelectorAll('mark[data-entity], .chip[data-entity]').forEach(m => m.addEventListener('click', () => {
    const n = current.nodes.find(d => d.ent === m.dataset.entity);
    if (n) select(n); else showEntity(m.dataset.entity);
  }));
  el.querySelectorAll('[data-hymn]').forEach(a => a.addEventListener('click', () => {
    const n = current.nodes.find(d => d.type === 'hymn' && d.hymn.n === +a.dataset.hymn);
    if (n) select(n); else showHymn(+a.dataset.hymn);
  }));
}

const EXT = {pleiades: ['Pleiades', v => `https://pleiades.stoa.org/places/${v}`],
  topostext: ['ToposText', v => /^https?:/.test(v) ? v : `https://topostext.org/place/${v}`],
  wikidata: ['Wikidata', v => `https://www.wikidata.org/wiki/${v}`], theoi: ['Theoi', v => v],
  wikipedia: ['Wikipedia', v => `https://en.wikipedia.org/wiki/${encodeURIComponent(v.replace(/ /g, '_'))}`]};

function extLinks(e) {
  const as = Object.entries(e.links || {}).filter(([k]) => EXT[k])
    .map(([k, v]) => `<a href="${esc(EXT[k][1](v))}" target="_blank" rel="noopener">${EXT[k][0]}</a>`);
  return as.length ? `<div class="extlinks">${as.join('')}</div>` : '';
}

function placeLine(e, id) {
  if (!e.precision) return '';
  const at = e.lat != null ? ` · ${e.lat.toFixed(2)}° N, ${e.lon.toFixed(2)}° E · <a href="map.html#e=${id}">on the map</a>` : '';
  return `<div class="where">${esc(e.precision)}${at}${e.place_note ? '<br>' + esc(e.place_note) : ''}</div>`;
}

function showEntity(id) {
  const e = E[id], det = document.getElementById('detail');
  const mine = M.filter(m => m.entity === id);
  const byHymn = d3.group(mine, m => m.hymn);
  const vis = new Set(visibleMentions());
  let html = `<h2 class="grc k-${e.kind}">${esc(e.label)}<span class="en">${esc(e.label_en)}</span></h2>
    <div class="meta">${e.kind}${e.subkind ? ' · ' + esc(e.subkind) : ''} · ${mine.length} mention${mine.length > 1 ? 's' : ''}
    in ${byHymn.size} hymn${byHymn.size > 1 ? 's' : ''} · <button class="link-btn" id="toggle-en">English</button></div>
    ${placeLine(e, id)}${extLinks(e)}
    <div class="cites">`;
  for (const [h, ms] of [...byHymn].sort((a, b) => a[0] - b[0])) {
    const hy = H.get(h);
    html += `<h3><a data-hymn="${h}"><span class="grc">${hy.numeral} ${esc(hy.title_grc)}</span></a> <span class="fine">${esc(hy.title_en)}</span></h3>`;
    for (const [line, lms] of d3.group(ms, m => m.line)) {
      const g = greekBy.get(h).find(r => r.line === line);
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
  bindMarks(det);
}

function showHymn(h) {
  const hy = H.get(h), det = document.getElementById('detail');
  const vis = visibleMentions().filter(m => m.hymn === h);
  const counts = d3.rollups(vis, v => v.length, m => m.entity).sort((a, b) => b[1] - a[1]);
  let html = `<h2 class="grc">${hy.numeral} ${esc(hy.title_grc)}<span class="en">${hy.roman} · ${esc(hy.title_en)}</span></h2>
    <div class="meta">${hy.lines} lines · ${vis.length} mentions of ${counts.length} names
    · <button class="link-btn" id="toggle-en">English</button></div><div class="chips">`;
  for (const [id, c] of counts) {
    const e = E[id];
    html += `<span class="chip k-${e.kind}" data-entity="${id}">${esc(e.label)}<sup>${c > 1 ? c : ''}</sup></span>`;
  }
  html += '</div><div class="text">';
  const byLine = d3.group(vis, m => m.line);
  const paras = new Map((englishBy.get(h) || []).map(p => [p.line, p.text]));
  for (const g of greekBy.get(h)) {
    if (paras.has(g.line)) html += `<div class="cite"><span class="ln"></span><span class="en">${esc(paras.get(g.line))}</span></div>`;
    html += `<div class="cite"><span class="ln">${g.line}</span><span class="gr">${marked(g.text, byLine.get(g.line) || [], null)}</span></div>`;
  }
  html += '</div>';
  det.innerHTML = html;
  det.querySelector('#toggle-en').addEventListener('click', () => det.querySelector('.text').classList.toggle('with-en'));
  bindMarks(det);
}

// ---- controls ----

function legend() {
  const lg = d3.select('#legend');
  lg.selectAll('span').data(KINDS).join('span')
    .html(k => `<i style="background:${color(k)}"></i>${KIND_PL[k]}`)
    .on('click', (e, k) => {
      state.off.has(k) ? state.off.delete(k) : state.off.add(k);
      d3.select(e.currentTarget).classed('off', state.off.has(k));
      render(true);
    });
  lg.append('span').html('<i style="background:#f3ead6;border:1px solid #221d17"></i>hymns');
}

function controls() {
  document.querySelectorAll('input[name=hubs]').forEach(r => r.addEventListener('change', () => {
    state.hubs = r.value; render(true);
  }));
  for (const id of ['phrases', 'doubtful', 'alllabels']) {
    document.getElementById(id).addEventListener('change', e => { state[id] = e.target.checked; render(true); });
  }
  document.getElementById('find').addEventListener('change', e => {
    const v = e.target.value.trim();
    const id = Object.keys(E).find(k => E[k].label === v || E[k].label_en === v || E[k].grc === v || k === v);
    if (!id) return;
    const n = current.nodes.find(d => d.ent === id);
    if (n) select(n); else { state.selected = null; document.getElementById('intro').hidden = true;
      document.getElementById('detail').hidden = false; showEntity(id); }
  });
}
