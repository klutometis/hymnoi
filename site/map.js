// Hymnoi map: places pinned to their coordinates; hymns and beings float under a force layout.
// A being is anchored, in order of preference:
//   home  where the text puts it (data/homes.csv: born, dwells, cult, origin, with the line), or a
//         people's homeland (data/places.csv): pulled hard toward it, with a tether to each home;
//   near  toward the places named within three lines of its mentions (entities[].near, computed by
//         tools/build.py), more firmly the more those places agree;
//   free  nothing: only the links to its hymns place it, and it is drawn faded.
// Hymns are drawn toward the places they name.
// Data: data/hymnoi.json (tools/build.py), data/basemap.json (tools/basemap.py).
'use strict';

const KINDS = ['god', 'nymph', 'hero', 'mortal', 'group', 'creature', 'place'];
const KIND_PL = {god: 'gods', nymph: 'nymphs', hero: 'heroes', mortal: 'mortals', group: 'groups',
  creature: 'creatures', place: 'places'};
const ANCHOR = {home: 0.5, near: 0.3};  // pull strengths; near is scaled by how much its places agree
const ANCHOR_TEXT = {home: 'where the text puts it', near: 'drawn toward the places named near it',
  free: 'no place named near it: placed only by its hymns'};
const ROUTE_COLORS = ['#9b2f1f', '#1f4e8c', '#b5781a', '#1d7a72', '#6d3f8a', '#4f6b23', '#8a5a3c', '#c0506a', '#3b3631', '#2f8fbf'];
const LINKS = {pleiades: ['Pleiades', id => `https://pleiades.stoa.org/places/${id}`],
  topostext: ['ToposText', id => /^https?:/.test(id) ? id : `https://topostext.org/place/${id}`],
  wikidata: ['Wikidata', id => `https://www.wikidata.org/wiki/${id}`],
  theoi: ['Theoi', u => u], wikipedia: ['Wikipedia', t => `https://en.wikipedia.org/wiki/${encodeURIComponent(t.replace(/ /g, '_'))}`]};
const css = getComputedStyle(document.documentElement);
const color = k => css.getPropertyValue('--' + k).trim();
const norm = s => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ς/g, 'σ').replace(/[ʼ’'᾽]/g, '');
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const lineNum = l => parseInt(l, 10) + (/[a-z]$/.test(l) ? (l.charCodeAt(l.length - 1) - 96) / 10 : 0);

const state = {beings: true, hymns: true, links: false, routes: true, doubtful: false, off: new Set(),
  routeOff: new Set(), selected: null, k: 1};
let D, E, H, M, greekBy, basemap, proj, svg, root, zoom, nodes, links, godLinks, tethers, sim, nodeSel, linkSel, tetherSel, width, height;

Promise.all([fetch('data/hymnoi.json').then(r => r.json()), fetch('data/basemap.json').then(r => r.json())])
  .then(([d, b]) => { D = d; basemap = b; init(); });

function init() {
  E = D.entities;
  H = new Map(D.hymns.map(h => [h.n, h]));
  M = D.mentions.map(r => Object.fromEntries(D.mention_cols.map((c, i) => [c, r[i]])));
  greekBy = d3.group(D.greek.map(([hymn, line, text, note]) => ({hymn, line, text, note})), d => d.hymn);
  D.routes.forEach((r, i) => { r.color = ROUTE_COLORS[i % ROUTE_COLORS.length]; });

  const box = document.getElementById('chart').getBoundingClientRect();
  width = box.width; height = box.height;
  svg = d3.select('#map').attr('viewBox', [0, 0, width, height]);
  // Fit the Aegean (Greece, western Anatolia, Crete); zoom out for Egypt, Cyprus, Italy.
  const core = Object.values(E).filter(e => e.lat != null && e.lon > 19.5 && e.lon < 30 && e.lat > 34.6 && e.lat < 41.8)
    .map(e => [e.lon, e.lat]);
  proj = d3.geoConicConformal().parallels([35, 41]).rotate([-24, 0])
    .fitExtent([[60, 40], [width - 40, height - 40]], {type: 'MultiPoint', coordinates: core});
  root = svg.append('g');
  drawBasemap();
  root.append('g').attr('class', 'routes');
  root.append('g').attr('class', 'mlinks');
  root.append('g').attr('class', 'tethers');
  root.append('g').attr('class', 'pnodes');
  zoom = d3.zoom().scaleExtent([0.35, 24]).on('zoom', zoomed);
  svg.call(zoom).on('dblclick.zoom', null);
  svg.on('click', e => { if (e.target.closest('.pnode') == null) select(null); });

  controls();
  legend();
  routesList();
  layout();
  draw();
  fromHash();
}

function drawBasemap() {
  const path = d3.geoPath(proj);
  const g = root.append('g').attr('class', 'basemap');
  g.append('rect').attr('class', 'sea').attr('x', -5 * width).attr('y', -5 * height)
    .attr('width', 11 * width).attr('height', 11 * height);
  g.append('path').attr('class', 'graticule').attr('d', path(d3.geoGraticule().step([2, 2]).extent([[6, 24], [40, 48]])()));
  for (const layer of ['land', 'lake', 'river']) {
    for (const f of basemap.features.filter(f => f.properties.layer === layer)) {
      g.append('path').attr('class', layer).attr('d', path(f));
    }
  }
  g.selectAll('path').attr('vector-effect', 'non-scaling-stroke');
}

function visible() {
  return M.filter(m => (m.shown || state.doubtful) && !state.off.has(E[m.entity].kind));
}

// Where a being is pulled: the weighted mean of its homes, or of the places named near it.
function anchor(n, e) {
  const at = id => { const p = E[id]; return p && p.lat != null && p.precision !== 'unlocated' && p.precision !== 'mythical'
    ? proj([p.lon, p.lat]) : null; };
  const mean = list => {  // [[xy, w]]
    const t = d3.sum(list, d => d[1]);
    return [d3.sum(list, d => d[0][0] * d[1]) / t, d3.sum(list, d => d[0][1] * d[1]) / t];
  };
  const homes = (e.homes || []).map(h => [at(h[0]), h[4], h[0]]).filter(h => h[0]);
  n.anchor = 'free';
  if (homes.length) {
    [n.ax, n.ay] = mean(homes);
    n.anchor = 'home'; n.pull = ANCHOR.home; n.homes = homes.map(h => h[2]);
  } else if (e.lat != null) {  // a people's homeland
    [n.ax, n.ay] = proj([e.lon, e.lat]);
    n.anchor = 'home'; n.pull = ANCHOR.home; n.homes = [];
  } else if (e.near && e.near.length) {
    const near = e.near.map(([p, share]) => [at(p), share]).filter(d => d[0]);
    if (near.length) {
      [n.ax, n.ay] = mean(near);
      // agreement: the share of the strongest place (1 for Anchises at Ida, 0.14 for Apollo)
      n.anchor = 'near'; n.pull = ANCHOR.near * Math.max(0.25, d3.max(e.near, d => d[1]));
    }
  }
}

function layout() {
  const ms = visible();
  const byId = new Map();
  const ent = id => {
    if (!byId.has(id)) {
      const e = E[id], n = {id: 'e:' + id, ent: id, type: e.kind === 'place' ? 'place' : 'being', kind: e.kind, n: 0,
        hymns: new Set()};
      if (e.kind === 'place') {
        if (e.lat != null) { const [x, y] = proj([e.lon, e.lat]); n.fx = n.x = x; n.fy = n.y = y; n.pinned = true; }
      } else anchor(n, e);
      byId.set(id, n);
    }
    return byId.get(id);
  };
  const hymns = new Map(D.hymns.map(h => [h.n, {id: 'h' + h.n, type: 'hymn', hymn: h, n: h.lines}]));
  const lmap = new Map();
  for (const m of ms) {
    const t = ent(m.entity);
    t.n++; t.hymns.add(m.hymn);
    const key = m.hymn + '|' + m.entity;
    if (!lmap.has(key)) lmap.set(key, {source: hymns.get(m.hymn), target: t, w: 0});
    lmap.get(key).w++;
  }
  nodes = [...hymns.values(), ...byId.values()];
  links = [...lmap.values()];
  // The same mentions with each hymn folded into the god it is sung to (the 2009 edges): what
  // "links" draws while the hymns are hidden. Hymn 34 has no god; a god's own name is no link.
  const gmap = new Map();
  for (const l of links) {
    const g = byId.get(l.source.hymn.dedicatees[0]);
    if (!g || g === l.target) continue;
    const key = g.id + '|' + l.target.id;
    if (!gmap.has(key)) gmap.set(key, {source: g, target: l.target, w: 0});
    gmap.get(key).w += l.w;
  }
  godLinks = [...gmap.values()];
  tethers = [];
  for (const n of byId.values()) for (const h of n.homes || []) if (byId.has(h)) tethers.push({source: n, target: byId.get(h)});
  // start each hymn at the centroid of its pinned places, each being at the centroid of its hymns
  for (const h of hymns.values()) {
    const ps = links.filter(l => l.source === h && l.target.pinned).map(l => l.target);
    h.x = ps.length ? d3.mean(ps, p => p.x) : width / 2;
    h.y = ps.length ? d3.mean(ps, p => p.y) : height / 2;
  }
  let seed = 1;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const n of byId.values()) {
    if (n.pinned) continue;
    if (n.ax != null) { n.x = n.ax; n.y = n.ay; continue; }
    const hs = [...n.hymns].map(h => hymns.get(h));
    n.x = d3.mean(hs, h => h.x) + (rand() - 0.5) * 30;
    n.y = d3.mean(hs, h => h.y) + (rand() - 0.5) * 30;
  }
  for (const n of nodes) {
    n.r = n.type === 'hymn' ? 4 + Math.sqrt(n.n) * 0.62 : 2.4 + Math.sqrt(n.n) * 1.05;
  }
  sim = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).distance(l => 6 + l.source.r + l.target.r)
      .strength(l => (l.target.pinned ? 0.6 : 0.9) / Math.min(l.source.deg, l.target.deg)))
    .force('charge', d3.forceManyBody().strength(n => n.pinned ? 0 : -10 - n.r * 3).distanceMax(140))
    .force('collide', d3.forceCollide(n => n.r + 1.2).iterations(2))
    .force('ax', d3.forceX(n => n.ax ?? n.x).strength(n => n.ax != null ? n.pull : 0))
    .force('ay', d3.forceY(n => n.ay ?? n.y).strength(n => n.ay != null ? n.pull : 0))
    .stop();
  for (const n of nodes) n.deg = 0;
  for (const l of links) { l.source.deg++; l.target.deg++; }
  sim.force('link').strength(l => (l.target.pinned ? 0.6 : 0.9) / Math.min(l.source.deg, l.target.deg));
  sim.tick(450);
  sim.on('tick', tick);
}

function draw() {
  drawLinks();
  tetherSel = root.select('.tethers').selectAll('line').data(tethers).join('line')
    .attr('class', 'tether').attr('vector-effect', 'non-scaling-stroke').attr('stroke', t => color(t.source.kind));
  nodeSel = root.select('.pnodes').selectAll('g.pnode').data(nodes, n => n.id).join(enter => {
    const g = enter.append('g');
    g.append('circle');
    g.append('text');
    return g;
  });
  nodeSel
    .attr('class', n => {
      const e = n.ent && E[n.ent];
      const prec = e && e.precision ? ' ' + e.precision : '';
      return 'pnode ' + n.type + (n.type === 'place' && !n.pinned ? ' floating' : '') + (n.anchor ? ' anchor-' + n.anchor : '') + prec;
    })
    .sort((a, b) => (a.type === 'hymn') - (b.type === 'hymn'))
    .on('mouseenter', (e, n) => focus(n, e))
    .on('mousemove', e => moveTip(e))
    .on('mouseleave', () => focus(null))
    .on('click', (e, n) => { e.stopPropagation(); select(n); })
    .call(d3.drag()
      .filter(e => !e.button)
      .on('start', (e, n) => { if (n.pinned) return; if (!e.active) sim.alphaTarget(0.15).restart(); n.fx = n.x; n.fy = n.y; })
      .on('drag', (e, n) => { if (n.pinned) return; n.fx = e.x; n.fy = e.y; })
      .on('end', (e, n) => { if (n.pinned) return; if (!e.active) sim.alphaTarget(0); n.fx = null; n.fy = null; }));
  nodeSel.select('circle').attr('r', n => n.r)
    .attr('fill', n => n.type === 'hymn' ? null : color(n.kind));
  nodeSel.select('text')
    .text(n => n.type === 'hymn' ? n.hymn.numeral : E[n.ent].label)
    .attr('text-anchor', n => n.type === 'hymn' ? 'middle' : 'start')
    .attr('dy', n => n.type === 'hymn' ? '0.36em' : '0.33em')
    .attr('x', n => n.type === 'hymn' ? 0 : n.r + 2)
    .attr('font-size', n => n.type === 'hymn' ? Math.max(7, n.r * 0.8) : Math.min(20, 9.5 + Math.sqrt(n.n) * 0.9))
    .attr('font-style', n => n.ent && E[n.ent].precision === 'region' ? 'italic' : null)
    .attr('letter-spacing', n => n.ent && E[n.ent].precision === 'region' ? '0.12em' : null);
  drawRoutes();
  applyToggles();
  tick();
}

// Hymn → name while the hymns are shown; god → name (the 2009 edges) while they are hidden.
function drawnLinks() { return state.hymns ? links : godLinks; }

function drawLinks() {
  linkSel = root.select('.mlinks').selectAll('line').data(drawnLinks(), l => l.source.id + '|' + l.target.id)
    .join('line').attr('class', 'mlink').attr('vector-effect', 'non-scaling-stroke')
    .attr('stroke-width', l => 0.5 + Math.sqrt(l.w) * 0.4)
    .attr('x1', l => l.source.x).attr('y1', l => l.source.y).attr('x2', l => l.target.x).attr('y2', l => l.target.y);
  const box = document.getElementById('links').parentNode;
  box.title = state.hymns ? 'A line from each hymn to every name in it'
    : 'A line from each god to every name in the hymns sung to that god (the 2009 edges)';
  box.lastChild.textContent = state.hymns ? ' links' : ' links (god → name)';
}

function tick() {
  linkSel.attr('x1', l => l.source.x).attr('y1', l => l.source.y).attr('x2', l => l.target.x).attr('y2', l => l.target.y);
  tetherSel.attr('x1', l => l.source.x).attr('y1', l => l.source.y).attr('x2', l => l.target.x).attr('y2', l => l.target.y);
  nodeSel.attr('transform', n => `translate(${n.x},${n.y}) scale(${1 / state.k})`);
}

function zoomed(e) {
  state.k = e.transform.k;
  root.attr('transform', e.transform);
  nodeSel.attr('transform', n => `translate(${n.x},${n.y}) scale(${1 / state.k})`);
  root.selectAll('.stop').attr('r', 3.2 / state.k);
  labels();
}

function labels() {
  // more labels as you zoom in; hymn numerals always
  const thr = 4 / (state.k * state.k);
  nodeSel.select('text').classed('hide', n => n.type !== 'hymn' && !(n.n >= thr || (n.pinned && state.k > 2.5)));
}

function applyToggles() {
  nodeSel.style('display', n => (n.type === 'hymn' && !state.hymns) || (n.type === 'being' && !state.beings) ? 'none' : null);
  linkSel.style('display', l => state.links && visibleNode(l.source) && visibleNode(l.target) ? null : 'none');
  root.select('.tethers').style('display', state.beings ? null : 'none');
  root.select('.routes').style('display', state.routes ? null : 'none');
  root.selectAll('.route-g').style('display', r => state.routeOff.has(r.id) ? 'none' : null);
  labels();
}

function drawRoutes() {
  const line = d3.line();  // straight legs: a smooth curve through a catalogue overshoots wildly
  const pos = id => {
    const e = E[id];
    if (!e || e.lat == null) return null;
    return proj([e.lon, e.lat]);
  };
  const defs = svg.select('defs').empty() ? svg.append('defs') : svg.select('defs');
  for (const r of D.routes) {
    defs.append('marker').attr('id', 'arrow-' + r.id).attr('viewBox', '0 0 10 10').attr('refX', 7).attr('refY', 5)
      .attr('markerWidth', 5).attr('markerHeight', 5).attr('orient', 'auto-start-reverse')
      .append('path').attr('d', 'M0,1 L9,5 L0,9 z').attr('fill', r.color);
  }
  const g = root.select('.routes').selectAll('g.route-g').data(D.routes, r => r.id).join('g').attr('class', 'route-g');
  g.each(function (r) {
    const pts = r.stops.map(s => pos(s[0])).filter(Boolean);
    const sel = d3.select(this);
    sel.selectAll('*').remove();
    sel.append('path').attr('class', 'route').attr('d', line(pts)).attr('stroke', r.color)
      .attr('vector-effect', 'non-scaling-stroke').attr('marker-end', `url(#arrow-${r.id})`)
      .append('title').text(`${r.grc} · ${r.en}`);
    sel.selectAll('circle.stop').data(pts).join('circle').attr('class', 'stop')
      .attr('cx', p => p[0]).attr('cy', p => p[1]).attr('r', 3.2 / state.k).attr('fill', r.color)
      .attr('vector-effect', 'non-scaling-stroke');
  });
}

function highlightRoute(id) {
  root.selectAll('.route').classed('dim', function () { return id && d3.select(this.parentNode).datum().id !== id; })
    .classed('hl', function () { return id && d3.select(this.parentNode).datum().id === id; });
}

// ---- interaction ----

function neighbours(n) {
  const lit = new Set([n.id]);
  for (const l of drawnLinks()) {
    if (l.source.id === n.id) lit.add(l.target.id);
    if (l.target.id === n.id) lit.add(l.source.id);
  }
  return lit;
}

function visibleNode(n) {
  return !((n.type === 'hymn' && !state.hymns) || (n.type === 'being' && !state.beings));
}

// Light a node, its hymns (links) and its homes (tethers). A link is drawn only when both of its ends
// are visible: with the hymns switched off, a being's links would otherwise end in nothing.
function light(n) {
  const lit = neighbours(n);
  for (const t of tethers) {
    if (t.source === n) lit.add(t.target.id);
    if (t.target === n) lit.add(t.source.id);
  }
  nodeSel.classed('lit', d => lit.has(d.id));
  const mine = l => l.source.id === n.id || l.target.id === n.id;
  linkSel.classed('lit', mine)
    .style('display', l => !visibleNode(l.source) || !visibleNode(l.target) ? 'none' : (mine(l) || state.links ? null : 'none'));
  tetherSel.classed('lit', mine);
}

function focus(n, ev) {
  const tip = document.getElementById('tip');
  if (!n) {
    tip.hidden = true;
    if (state.selected) light(state.selected); else { svg.classed('focus', false); applyToggles(); }
    return;
  }
  svg.classed('focus', true);
  light(n);
  let html;
  if (n.type === 'hymn') {
    const h = n.hymn;
    html = `<div class="grc">${h.numeral} ${esc(h.title_grc)}</div>${h.roman} · ${esc(h.title_en)} · ${h.lines} lines`;
  } else {
    const e = E[n.ent];
    const where = e.kind === 'place' || e.lat != null ? ` · ${esc(e.precision || '')}` : '';
    html = `<div class="grc k-${e.kind}">${esc(e.label)}</div><i>${esc(e.label_en)}</i><br>${e.kind}${e.subkind ? ' · ' + esc(e.subkind) : ''}${where}
      · ${n.n} mention${n.n > 1 ? 's' : ''} in ${n.hymns.size} hymn${n.hymns.size > 1 ? 's' : ''}` +
      (n.anchor ? `<br><span class="fine">${anchorLine(n, e)}</span>` : '');
  }
  tip.innerHTML = html;
  tip.hidden = false;
  moveTip(ev);
}

function anchorLine(n, e) {
  if (n.anchor === 'home' && e.homes && e.homes.length)
    return 'home: ' + e.homes.map(h => `${esc(E[h[0]].label_en)} (${h[1]}, ${h[2]}.${h[3]})`).join('; ');
  if (n.anchor === 'home') return 'home: its land';
  if (n.anchor === 'near') return 'near ' + e.near.slice(0, 3).map(([p, s]) => `${esc(E[p].label_en)} ${Math.round(s * 100)}%`).join(', ');
  return ANCHOR_TEXT.free;
}

function moveTip(e) {
  if (!e) return;
  const tip = document.getElementById('tip'), box = document.getElementById('chart').getBoundingClientRect();
  tip.style.left = Math.min(e.clientX - box.left + 14, box.width - 260) + 'px';
  tip.style.top = (e.clientY - box.top + 14) + 'px';
}

function select(n) {
  state.selected = n;
  nodeSel.classed('selected', d => n && d.id === n.id);
  if (n) { svg.classed('focus', true); light(n); } else { svg.classed('focus', false); applyToggles(); }
  document.getElementById('intro').hidden = !!n;
  const det = document.getElementById('detail');
  det.hidden = !n;
  toHash();
  if (!n) return;
  if (n.type === 'hymn') showHymn(n.hymn.n); else showEntity(n.ent);
  document.getElementById('panel').scrollTop = 0;
}

function back() { return '<p class="back" id="back">← map and journeys</p>'; }

function showEntity(id) {
  const e = E[id], det = document.getElementById('detail');
  const mine = M.filter(m => m.entity === id && (m.shown || state.doubtful));
  const byHymn = d3.group(mine, m => m.hymn);
  const ext = Object.entries(e.links || {}).filter(([k]) => LINKS[k])
    .map(([k, v]) => `<a href="${esc(LINKS[k][1](v))}" target="_blank" rel="noopener">${LINKS[k][0]}</a>`).join('');
  let html = back() + `<h2 class="grc k-${e.kind}">${esc(e.label)}<span class="en">${esc(e.label_en)}</span></h2>
    <div class="meta">${e.kind}${e.subkind ? ' · ' + esc(e.subkind) : ''} · ${mine.length} mention${mine.length === 1 ? '' : 's'}
    · <a href="index.html#e=${id}">graph</a> · <a href="matrix.html#e=${id}">matrix</a></div>`;
  if (e.precision) html += `<div class="where">${esc(e.precision)}${e.lat != null ? ` · ${e.lat.toFixed(2)}° N, ${e.lon.toFixed(2)}° E` : ''}${e.place_note ? ' · ' + esc(e.place_note) : ''}</div>`;
  if (ext) html += `<div class="extlinks">${ext}</div>`;
  if (e.homes && e.homes.length) html += `<div class="where"><b>Home</b>, as the text puts it: ` + e.homes.map(h =>
    `<a data-entity="${h[0]}" style="cursor:pointer">${esc(E[h[0]].label)}</a> <span class="fine">${esc(E[h[0]].label_en)}, ${h[1]}, ${h[2]}.${h[3]}${h[5] ? ': ' + esc(h[5]) : ''}</span>`).join('; ') + '</div>';
  if (e.kind !== 'place' && e.near && e.near.length) html += `<div class="where"><b>Named near</b> (within three lines): ` + e.near.slice(0, 6).map(([p, share, k]) =>
    `<a data-entity="${p}" style="cursor:pointer">${esc(E[p].label)}</a> ${Math.round(share * 100)}%`).join(', ') + '</div>';
  else if (e.kind !== 'place' && !(e.homes && e.homes.length) && e.lat == null) html += `<div class="where">No place is named near it: on the map it is placed only by its hymns.</div>`;
  const onRoutes = D.routes.filter(r => r.stops.some(s => s[0] === id));
  if (onRoutes.length) html += `<div class="where">on ${onRoutes.map(r => `<a class="routelink" data-route="${r.id}" style="color:${r.color};cursor:pointer">${esc(r.en)}</a>`).join(', ')}</div>`;
  for (const [h, ms] of [...byHymn].sort((a, b) => a[0] - b[0])) {
    const hy = H.get(h);
    html += `<h3><a data-hymn="${h}" style="cursor:pointer"><span class="grc">${hy.numeral} ${esc(hy.title_grc)}</span></a> <span class="fine">${esc(hy.title_en)}</span></h3>`;
    for (const [line, lms] of d3.group(ms, m => m.line)) {
      const g = greekBy.get(h).find(r => r.line === line);
      const words = new Set(lms.flatMap(m => m.form.split(/\s+/).map(norm)));
      const text = (g ? g.text : '').split(/([\p{L}\p{M}ʼ’']+)/u)
        .map(t => words.has(norm(t)) ? `<mark class="k-${e.kind} self">${esc(t)}</mark>` : esc(t)).join('');
      html += `<div class="cite"><span class="ln">${h}.${line}</span><span class="gr">${text}</span></div>`;
    }
  }
  det.innerHTML = html;
  bindPanel(det);
}

function showHymn(h) {
  const hy = H.get(h), det = document.getElementById('detail');
  const ms = visible().filter(m => m.hymn === h);
  const counts = d3.rollups(ms, v => v.length, m => m.entity).sort((a, b) => b[1] - a[1]);
  const places = counts.filter(([id]) => E[id].kind === 'place'), others = counts.filter(([id]) => E[id].kind !== 'place');
  const chips = list => list.map(([id, c]) => `<span class="chip k-${E[id].kind}" data-entity="${id}">${esc(E[id].label)}<sup>${c > 1 ? c : ''}</sup></span>`).join('');
  det.innerHTML = back() + `<h2 class="grc">${hy.numeral} ${esc(hy.title_grc)}<span class="en">${hy.roman} · ${esc(hy.title_en)}</span></h2>
    <div class="meta">${hy.lines} lines · <a href="index.html#h=${h}">read it</a> · <a href="matrix.html#h=${h}">matrix</a></div>
    <h3>places</h3><div class="chips">${chips(places) || '<span class="fine">none</span>'}</div>
    <h3>beings</h3><div class="chips">${chips(others)}</div>`;
  bindPanel(det);
}

function bindPanel(el) {
  el.querySelector('#back')?.addEventListener('click', () => select(null));
  el.querySelectorAll('[data-entity]').forEach(a => a.addEventListener('click', () => {
    const n = nodes.find(d => d.ent === a.dataset.entity);
    if (n) { select(n); centreOn(n); } else showEntity(a.dataset.entity);
  }));
  el.querySelectorAll('[data-hymn]').forEach(a => a.addEventListener('click', () => {
    const n = nodes.find(d => d.type === 'hymn' && d.hymn.n === +a.dataset.hymn);
    if (n) { select(n); centreOn(n); }
  }));
  el.querySelectorAll('[data-route]').forEach(a => a.addEventListener('click', () => {
    select(null); highlightRoute(a.dataset.route);
  }));
}

function centreOn(n) {
  const k = Math.max(state.k, 2.5);
  svg.transition().duration(600).call(zoom.transform, d3.zoomIdentity.translate(width / 2 - n.x * k, height / 2 - n.y * k).scale(k));
}

// ---- controls ----

function controls() {
  for (const id of ['beings', 'hymns', 'links', 'routes']) {
    document.getElementById(id).addEventListener('change', e => {
      state[id] = e.target.checked;
      if (id === 'hymns') drawLinks();
      applyToggles();
      if (state.selected) light(state.selected);
    });
  }
  document.getElementById('doubtful').addEventListener('change', e => { state.doubtful = e.target.checked; relayout(); });
}

function relayout() {
  const sel = state.selected && state.selected.id;
  layout();
  draw();
  if (sel) { const n = nodes.find(d => d.id === sel); if (n) select(n); }
}

function legend() {
  const lg = d3.select('#legend');
  lg.selectAll('span.kind').data(KINDS).join('span').attr('class', 'kind')
    .html(k => `<i style="background:${color(k)}"></i>${KIND_PL[k]}`)
    .on('click', (e, k) => {
      state.off.has(k) ? state.off.delete(k) : state.off.add(k);
      d3.select(e.currentTarget).classed('off', state.off.has(k));
      relayout();
    });
  lg.append('span').html('<i style="background:#f3ead6;border:1px solid #221d17"></i>hymns');
  lg.append('div').attr('class', 'anchors').html(
    '<span title="Pinned at its coordinates (Pleiades)"><i class="a-pin"></i>place</span>' +
    '<span title="Where the text puts it: born, lives, has its temple there (with the line); a tether to each home"><i class="a-home"></i>home in the text</span>' +
    '<span title="Drawn toward the places named within three lines of its mentions"><i class="a-near"></i>named near places</span>' +
    '<span title="No place is named near it: placed only by the links to its hymns"><i class="a-free"></i>free</span>');
}

function routesList() {
  const div = d3.select('#routes-list');
  const row = div.selectAll('label').data(D.routes).join('label');
  row.append('input').attr('type', 'checkbox').property('checked', true)
    .on('change', (e, r) => { e.target.checked ? state.routeOff.delete(r.id) : state.routeOff.add(r.id); applyToggles(); });
  row.append('i').style('background', r => r.color);
  row.append('span').html(r => `<span class="grc">${esc(r.grc)}</span> <span class="en">${esc(r.en)}</span>`);
  row.on('mouseenter', (e, r) => highlightRoute(r.id)).on('mouseleave', () => highlightRoute(null));
}

function fromHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const want = p.get('e') ? 'e:' + p.get('e') : p.get('h') ? 'h' + p.get('h') : null;
  if (!want) return;
  const n = nodes.find(d => d.id === want);
  if (n) { select(n); centreOn(n); }
}

function toHash() {
  const n = state.selected, p = new URLSearchParams();
  if (n && n.ent) p.set('e', n.ent); else if (n && n.hymn) p.set('h', n.hymn.n);
  history.replaceState(null, '', p.toString() ? '#' + p : location.pathname);
  const q = p.toString() ? '#' + p : '';
  for (const id of ['to-graph', 'to-matrix']) {
    const a = document.getElementById(id);
    if (a) a.href = a.href.split('#')[0] + q;
  }
}
