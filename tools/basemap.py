#!/usr/bin/env python3
"""Cut a small basemap for the map view from Natural Earth (public domain).

    tools/basemap.py

Downloads the 1:10m Natural Earth land, minor islands, rivers and lakes as
GeoJSON (github.com/nvkelso/natural-earth-vector) into $TMPDIR/hymnoi/ne if
they are not there, clips them to the eastern Mediterranean, simplifies them
(Douglas-Peucker), and writes site/data/basemap.json: a FeatureCollection with
`layer` = land | river | lake. Exterior rings are made clockwise, as d3-geo
wants. No dependencies beyond the standard library.
"""
import json, math, os, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(os.environ.get('TMPDIR', '/tmp'), 'hymnoi', 'ne')
OUT = os.path.join(ROOT, 'site', 'data', 'basemap.json')
BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/'
BBOX = (8.0, 25.0, 38.0, 46.0)  # lon0, lat0, lon1, lat1: Etruria to Phoenicia, Egypt to Thrace
TOL = 0.012                     # degrees, about 1 km
RIVERS = {'Nile', 'Alfeios', 'Alpheios', 'Pineios', 'Peneus', 'Acheloos', 'Achelous', 'Evros', 'Maritsa',
          'Axios', 'Vardar', 'Strymon', 'Struma', 'Hermus', 'Gediz', 'Büyük Menderes', 'Meander', 'Kifisos',
          'Tiber', 'Tevere', 'Orontes', 'Halys', 'Kızılırmak', 'Sakarya', 'Arno', 'Nestos', 'Aliakmonas',
          'Simoeis', 'Scamander', 'Karamenderes', 'Kaystros', 'Küçük Menderes', 'Euphrates'}


def fetch(name):
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, name + '.geojson')
    if not os.path.exists(p):
        urllib.request.urlretrieve(BASE + name + '.geojson', p)
    return json.load(open(p))


def inside(p, edge, v):
    return (p[0] >= v, p[1] >= v, p[0] <= v, p[1] <= v)[edge]


def cut(a, b, edge, v):
    i = 0 if edge in (0, 2) else 1
    t = (v - a[i]) / (b[i] - a[i])
    return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]


def clip_ring(ring):
    """Sutherland-Hodgman against the bbox (a convex window): fine for fills."""
    out = ring[:-1] if ring and ring[0] == ring[-1] else ring
    for edge, v in enumerate(BBOX):
        if not out:
            break
        src, out = out, []
        for j, cur in enumerate(src):
            prev = src[j - 1]
            if inside(cur, edge, v):
                if not inside(prev, edge, v):
                    out.append(cut(prev, cur, edge, v))
                out.append(cur)
            elif inside(prev, edge, v):
                out.append(cut(prev, cur, edge, v))
    return out


def clip_line(line):
    """Keep the runs of a line that fall inside the bbox (no interpolation at the edge)."""
    runs, cur = [], []
    for p in line:
        if BBOX[0] <= p[0] <= BBOX[2] and BBOX[1] <= p[1] <= BBOX[3]:
            cur.append(p)
        elif cur:
            runs.append(cur)
            cur = []
    if cur:
        runs.append(cur)
    return [r for r in runs if len(r) > 1]


def dp(pts, tol):
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        ax, ay = pts[i]
        bx, by = pts[j]
        dx, dy = bx - ax, by - ay
        n = math.hypot(dx, dy)
        best, k = -1, None
        for m in range(i + 1, j):
            if n:  # distance to the chord; for a closed ring's first chord, distance to the point
                d = abs(dy * (pts[m][0] - ax) - dx * (pts[m][1] - ay)) / n
            else:
                d = math.hypot(pts[m][0] - ax, pts[m][1] - ay)
            if d > best:
                best, k = d, m
        if best > tol:
            keep[k] = True
            stack += [(i, k), (k, j)]
    return [p for p, f in zip(pts, keep) if f]


def area(r):
    return sum(r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1] for i in range(len(r) - 1)) / 2


def polys(geom):
    if geom['type'] == 'Polygon':
        return [geom['coordinates']]
    if geom['type'] == 'MultiPolygon':
        return geom['coordinates']
    return []


def lines(geom):
    if geom['type'] == 'LineString':
        return [geom['coordinates']]
    if geom['type'] == 'MultiLineString':
        return geom['coordinates']
    return []


def rnd(pts):
    return [[round(x, 3), round(y, 3)] for x, y in pts]


def main():
    feats = []
    rings = []
    for name in ('ne_10m_land', 'ne_10m_minor_islands'):
        for f in fetch(name)['features']:
            for poly in polys(f['geometry']):
                ext = poly[0]  # holes dropped: lakes are drawn over the land
                xs, ys = [p[0] for p in ext], [p[1] for p in ext]
                if max(xs) < BBOX[0] or min(xs) > BBOX[2] or max(ys) < BBOX[1] or min(ys) > BBOX[3]:
                    continue
                r = clip_ring(ext)
                if len(r) < 3:
                    continue
                r = r + [r[0]]
                small = abs(area(r)) < 0.02
                r = dp(r, TOL / 4 if small else TOL)
                if len(r) < 4:
                    continue
                if area(r) > 0:  # make exterior rings clockwise (d3-geo)
                    r = r[::-1]
                rings.append(rnd(r))
    feats.append({'type': 'Feature', 'properties': {'layer': 'land'},
                  'geometry': {'type': 'MultiPolygon', 'coordinates': [[r] for r in rings]}})
    rv = []
    for name in ('ne_10m_rivers_lake_centerlines', 'ne_10m_rivers_europe'):
        for f in fetch(name)['features']:
            pr = f['properties']
            nm = pr.get('name') or pr.get('name_en') or ''
            if (pr.get('scalerank') or 99) > 6 and nm not in RIVERS:
                continue
            for ln in lines(f['geometry']):
                for run in clip_line(ln):
                    run = dp(run, TOL)
                    if len(run) > 1:
                        rv.append(rnd(run))
    feats.append({'type': 'Feature', 'properties': {'layer': 'river'},
                  'geometry': {'type': 'MultiLineString', 'coordinates': rv}})
    lk = []
    for name in ('ne_10m_lakes', 'ne_10m_lakes_europe'):
        for f in fetch(name)['features']:
            for poly in polys(f['geometry']):
                r = clip_ring(poly[0])
                if len(r) < 3:
                    continue
                r = dp(r + [r[0]], TOL / 2)
                if len(r) < 4:
                    continue
                if area(r) > 0:
                    r = r[::-1]
                lk.append([rnd(r)])
    feats.append({'type': 'Feature', 'properties': {'layer': 'lake'},
                  'geometry': {'type': 'MultiPolygon', 'coordinates': lk}})
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({'type': 'FeatureCollection', 'bbox': BBOX, 'source': 'Natural Earth 1:10m (public domain)',
               'features': feats}, open(OUT, 'w'), separators=(',', ':'))
    npts = sum(len(r) for r in rings)
    print(f'{OUT}: {len(rings)} land rings ({npts} points), {len(rv)} river lines, {len(lk)} lakes, '
          f'{os.path.getsize(OUT) // 1024} KB')


if __name__ == '__main__':
    main()
