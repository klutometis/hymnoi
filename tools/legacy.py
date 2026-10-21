#!/usr/bin/env python3
"""Flatten the 2009 graph (legacy/2009/hymnoi.dot) into data/legacy/{nodes,edges}.csv.

nodes.csv: id, label (Greek, as drawn), kind (theoi|anthropoi|chthones, the dot subgraph)
edges.csv: source, target, penwidth, line (line number in hymnoi.dot)

`source` is the god a hymn is dedicated to (or `xenos` for Εἰς Ξένους); the
edge means "target is mentioned in a hymn to source". The legend cluster and
commented-out edges are skipped.
"""
import csv, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOT = os.path.join(ROOT, 'legacy', '2009', 'hymnoi.dot')
OUT = os.path.join(ROOT, 'data', 'legacy')


def parse(path=DOT):
    nodes, edges, cur = {}, [], None
    for n, raw in enumerate(open(path, encoding='utf-8'), 1):
        s = raw.split('//')[0].strip()
        m = re.match(r'subgraph (\w+)', s)
        if m:
            cur = m.group(1)
            continue
        m = re.match(r'(\w+) \[label="([^"]+)"\];', s)
        if m and cur in ('theoi', 'anthropoi', 'chthones'):
            nodes[m.group(1)] = (m.group(2), cur)
            continue
        m = re.match(r'(\w+) -> (\w+)(?: \[penwidth=(\d+)\])?;', s)
        if m and cur != 'cluster_legend':
            edges.append((m.group(1), m.group(2), int(m.group(3) or 1), n))
    return nodes, edges


def main():
    nodes, edges = parse()
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, 'nodes.csv'), 'w', newline='') as f:
        w = csv.writer(f, lineterminator='\n')
        w.writerow(['id', 'label', 'kind'])
        for k, (label, kind) in nodes.items():
            w.writerow([k, label, kind])
    with open(os.path.join(OUT, 'edges.csv'), 'w', newline='') as f:
        w = csv.writer(f, lineterminator='\n')
        w.writerow(['source', 'target', 'penwidth', 'line'])
        w.writerows(edges)
    print(f'{len(nodes)} nodes, {len(edges)} edges')


if __name__ == '__main__':
    main()
