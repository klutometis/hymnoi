#!/usr/bin/env python3
"""Build site/data/hymnoi.json from data/.

    tools/build.py

Inputs (data/): hymns.csv, entities.csv, mentions.csv, text/{greek,english}.tsv,
and, when present, labels.csv (display names), places.csv (coordinates),
links.csv (Wikidata, Theoi, ...), homes.csv (where the text puts a being), routes.csv.

Output schema:
  hymns:     [{n, numeral, roman, title_grc, title_en, dedicatees: [id], lines}]
  entities:  {id: {kind, subkind, label, label_en, grc (LSJ lemma), en, n (shown mentions),
                   unnamed, precision?, place_note?, lat?, lon?, links?: {wikidata, theoi, pleiades, ...},
                   homes?: [[place, tie, hymn, line, weight, note]],
                   near?: [[place, share, mentions]]}}
             `homes`: ties the text states (born, dwells, cult, origin), from data/homes.csv.
             `near`: the located places named within NEAR lines of the being's (shown) mentions,
             each weighted 1/(1 + distance in lines), as shares summing to 1; `mentions` is how
             many of its mentions had that place nearby. Computed here, from the text alone.
             `label` is the display name: Greek, in the hymns' own (epic-Ionic) forms,
             plural for groups, the text's own words for beings it never names.
  mention_cols + mentions: rows of [hymn, line, form, lemma, entity, type, certainty, note, shown]
  greek:     [[hymn, line, text, note]]   english: [[hymn, line, text]]
  routes:    [{id, grc, en, stops: [[entity, hymn, line, note]]}]   journeys (data/routes.csv)

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


ROUTE_TITLES = {  # route id: (Greek, English); order = display order
    'leto': ('Λητοῦς πλάνη', "Leto's wanderings, 3.30–49"),
    'apollo_road': ('Ἀπόλλωνος ὁδός', "Apollo's road to Pytho, 3.216–282"),
    'cretan_ship': ('νηῦς Κρητῶν', 'The Cretan ship, 3.388–439'),
    'hermes_cattle': ('βόες Ἀπόλλωνος', "Hermes drives off Apollo's cattle, Hymn 4"),
    'apollo_search': ('Ἀπόλλων ζητῶν', "Apollo's search, Hymn 4"),
    'cattle_return': ('βοῶν ἀπόδοσις', 'The cattle given back, Hymn 4'),
    'demeter': ('Δημήτηρ', "Demeter's wandering, Hymn 2"),
    'doso_tale': ('Δωσοῦς μῦθος', "Doso's false tale, 2.122–126"),
    'persephone_return': ('Περσεφονείης ἄνοδος', "Persephone's return, Hymn 2"),
    'aphrodite_ida': ('Ἀφροδίτη εἰς Ἴδην', 'Aphrodite to Ida, 5.58–68'),
}


NEAR = 3  # lines either side


def located(e):
    return e and e.get('kind') == 'place' and e.get('lat') is not None and e.get('precision') not in ('unlocated', 'mythical')


def line_no(l):
    return int(''.join(c for c in l if c.isdigit()))


def nearby(mentions, ents):
    """For each non-place entity, the located places named within NEAR lines of its mentions."""
    by_hymn = collections.defaultdict(list)
    for m in mentions:
        if shown(m):
            by_hymn[m['hymn']].append(m)
    w = collections.defaultdict(collections.Counter)
    cnt = collections.defaultdict(collections.Counter)
    for ms in by_hymn.values():
        places = [(line_no(m['line']), m['entity']) for m in ms if located(ents.get(m['entity']))]
        for m in ms:
            if ents[m['entity']]['kind'] == 'place':
                continue
            here = line_no(m['line'])
            seen = set()
            for at, p in places:
                d = abs(at - here)
                if d <= NEAR:
                    w[m['entity']][p] += 1 / (1 + d)
                    seen.add(p)
            for p in seen:
                cnt[m['entity']][p] += 1
    out = {}
    for k, c in w.items():
        tot = sum(c.values())
        out[k] = [[p, round(v / tot, 3), cnt[k][p]] for p, v in c.most_common()]
    return out


def homes(ents):
    p = D('homes.csv')
    out = collections.defaultdict(list)
    if os.path.exists(p):
        for r in csv.DictReader(open(p)):
            if r['entity'] in ents and r['place'] in ents:
                out[r['entity']].append([r['place'], r['tie'], int(r['hymn']), r['line'], float(r['weight'] or 1),
                                         r.get('note', '')])
    return out


def routes():
    p = D('routes.csv')
    stops = collections.defaultdict(list)
    if os.path.exists(p):
        for r in sorted(csv.DictReader(open(p)), key=lambda r: (r['route'], int(r['seq']))):
            stops[r['route']].append([r['entity'], int(r['hymn']), r['line'], r['note']])
    order = list(ROUTE_TITLES) + sorted(set(stops) - set(ROUTE_TITLES))
    return [{'id': k, 'grc': ROUTE_TITLES.get(k, ('', k))[0], 'en': ROUTE_TITLES.get(k, ('', k))[1],
             'stops': stops[k]} for k in order if k in stops]


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
        if p:
            o.update(precision=p.get('precision', ''), place_note=p.get('note', ''))
            if p.get('lat') and p.get('lon'):
                o.update(lat=float(p['lat']), lon=float(p['lon']))
        ln = {c: v for c, v in {**links.get(k, {}), **{c: p.get(c, '') for c in ('pleiades', 'topostext', 'wikidata')
                                                      if p}}.items() if v and c in
              ('wikidata', 'theoi', 'pleiades', 'topostext', 'wikipedia')}
        if ln:
            o['links'] = ln
        ents[k] = o
    for k, v in nearby(mentions, ents).items():
        ents[k]['near'] = v
    for k, v in homes(ents).items():
        ents[k]['homes'] = v
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
          f'{len(labels)} labelled, {sum(1 for e in ents.values() if "lat" in e)} located, '
          f'{sum(1 for e in ents.values() if "homes" in e)} with homes, {sum(1 for e in ents.values() if "near" in e)} with places nearby), '
          f'{len(mentions)} mentions ({n} shown), {os.path.getsize(OUT) // 1024} KB')


if __name__ == '__main__':
    main()
