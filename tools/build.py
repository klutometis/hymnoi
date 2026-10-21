#!/usr/bin/env python3
"""Build site/data/hymnoi.json from data/.

    tools/build.py

Inputs (data/): hymns.csv, entities.csv, mentions.csv, text/{greek,english}.tsv,
and, when present, labels.csv (display names), places.csv (coordinates),
links.csv (Wikidata, Theoi, ...).

Output schema:
  hymns:     [{n, numeral, roman, title_grc, title_en, dedicatees: [id], lines}]
  entities:  {id: {kind, subkind, label, label_en, grc (LSJ lemma), en, n (shown mentions),
                   unnamed, lat?, lon?, precision?, links?: {wikidata, theoi, pleiades, ...}}}
             `label` is the display name: Greek, in the hymns' own (epic-Ionic) forms,
             plural for groups, the text's own words for beings it never names.
  mention_cols + mentions: rows of [hymn, line, form, lemma, entity, type, certainty, note, shown]
  greek:     [[hymn, line, text, note]]   english: [[hymn, line, text]]
  routes:    {route: [[entity, hymn, line, note]]}   journeys as ordered stops (data/routes.csv)

`shown` applies the defaults of REVIEW.md, which Peter accepted on 2026-10-21.
"""
import collections, csv, json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = lambda *p: os.path.join(ROOT, 'data', *p)
OUT = os.path.join(ROOT, 'site', 'data', 'hymnoi.json')

# REVIEW.md A3, B16: shown although their rows are periphrases or names marked uncertain.
SHOW_ANYWAY = {'geron_onchestos', 'kreton_agos', 'leukippos_wife', 'keleos_daughters', 'homeros',
               'drakaina', 'thriai', 'hera_nymph'}
UNNAMED = SHOW_ANYWAY - {'hera_nymph'}
# REVIEW.md A4: collectives that are not particular beings.
HIDDEN = {'ouraniones', 'mainades', 'okeanides'}


def shown(m):
    if m['entity'] in HIDDEN:
        return False
    return m['certainty'] != 'uncertain' or m['entity'] in SHOW_ANYWAY


def table(name, key='id'):
    p = D(name)
    return {r[key]: r for r in csv.DictReader(open(p))} if os.path.exists(p) else {}


def routes():
    p = D('routes.csv')
    out = collections.defaultdict(list)
    if os.path.exists(p):
        for r in sorted(csv.DictReader(open(p)), key=lambda r: (r['route'], int(r['seq']))):
            out[r['route']].append([r['entity'], int(r['hymn']), r['line'], r['note']])
    return out


def main():
    hymns = list(csv.DictReader(open(D('hymns.csv'))))
    entities = table('entities.csv')
    labels, places, links = table('labels.csv'), table('places.csv'), table('links.csv')
    mentions = list(csv.DictReader(open(D('mentions.csv'))))
    greek = list(csv.DictReader(open(D('text', 'greek.tsv')), delimiter='\t'))
    english = list(csv.DictReader(open(D('text', 'english.tsv')), delimiter='\t'))
    count = collections.Counter(m['entity'] for m in mentions if shown(m))

    ents = {}
    for k, e in entities.items():
        lab = labels.get(k, {})
        o = {'kind': e['kind'], 'subkind': e['subkind'], 'grc': e['name_grc'], 'en': e['name_en'],
             'label': lab.get('label_grc') or e['name_grc'], 'label_en': lab.get('label_en') or e['name_en'],
             'n': count[k], 'unnamed': k in UNNAMED}
        p = places.get(k)
        if p and p.get('lat') and p.get('lon'):
            o.update(lat=float(p['lat']), lon=float(p['lon']), precision=p.get('precision', ''))
        ln = {c: v for c, v in {**links.get(k, {}), **{c: p.get(c, '') for c in ('pleiades', 'topostext', 'wikidata')
                                                      if p}}.items() if v and c in
              ('wikidata', 'theoi', 'pleiades', 'topostext', 'wikipedia')}
        if ln:
            o['links'] = ln
        ents[k] = o
    out = {
        'hymns': [{'n': int(h['hymn']), 'numeral': h['numeral'], 'roman': h['roman'],
                   'title_grc': h['title_grc'], 'title_en': h['title_en'],
                   'dedicatees': [d for d in h['dedicatees'].split(';') if d], 'lines': int(h['lines'])}
                  for h in hymns],
        'entities': ents,
        'mention_cols': ['hymn', 'line', 'form', 'lemma', 'entity', 'type', 'certainty', 'note', 'shown'],
        'mentions': [[int(m['hymn']), m['line'], m['form'], m['lemma'], m['entity'], m['mention_type'],
                      m['certainty'], m['note'], shown(m)] for m in mentions],
        'greek': [[int(r['hymn']), r['line'], r['text'], r['note']] for r in greek],
        'english': [[int(r['hymn']), r['line'], r['text']] for r in english],
        'routes': routes(),
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    n = sum(1 for m in mentions if shown(m))
    print(f'{OUT}: {len(hymns)} hymns, {len(ents)} entities ({sum(1 for c in count.values() if c)} shown, '
          f'{len(labels)} labelled, {sum(1 for e in ents.values() if "lat" in e)} located), '
          f'{len(mentions)} mentions ({n} shown), {os.path.getsize(OUT) // 1024} KB')


if __name__ == '__main__':
    main()
