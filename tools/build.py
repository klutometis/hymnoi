#!/usr/bin/env python3
"""Build site/data/hymnoi.json from data/.

    tools/build.py

The JSON carries everything the views need: hymns, entities, every mention
(with a `shown` flag from the default view rules below, which follow the
defaults in REVIEW.md), and the Greek and English text for the reader panes.
"""
import collections, csv, json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = lambda *p: os.path.join(ROOT, 'data', *p)
OUT = os.path.join(ROOT, 'site', 'data', 'hymnoi.json')

# REVIEW.md A3: unnamed characters are shown although their rows are periphrases marked uncertain.
UNNAMED = {'geron_onchestos', 'kreton_agos', 'leukippos_wife', 'keleos_daughters', 'homeros',
           'drakaina', 'thriai', 'hera_nymph'}
# REVIEW.md A4: collectives that are not particular beings.
HIDDEN = {'ouraniones', 'mainades', 'okeanides'}


def shown(m):
    if m['entity'] in HIDDEN:
        return False
    return m['certainty'] != 'uncertain' or m['entity'] in UNNAMED


def main():
    hymns = list(csv.DictReader(open(D('hymns.csv'))))
    entities = {r['id']: r for r in csv.DictReader(open(D('entities.csv')))}
    mentions = list(csv.DictReader(open(D('mentions.csv'))))
    greek = list(csv.DictReader(open(D('text', 'greek.tsv')), delimiter='\t'))
    english = list(csv.DictReader(open(D('text', 'english.tsv')), delimiter='\t'))
    count = collections.Counter(m['entity'] for m in mentions if shown(m))
    out = {
        'hymns': [{'n': int(h['hymn']), 'numeral': h['numeral'], 'roman': h['roman'],
                   'title_grc': h['title_grc'], 'title_en': h['title_en'],
                   'dedicatees': [d for d in h['dedicatees'].split(';') if d], 'lines': int(h['lines'])}
                  for h in hymns],
        'entities': {k: {'kind': e['kind'], 'subkind': e['subkind'], 'grc': e['name_grc'], 'en': e['name_en'],
                         'n': count[k], 'unnamed': k in UNNAMED} for k, e in entities.items()},
        'mention_cols': ['hymn', 'line', 'form', 'lemma', 'entity', 'type', 'certainty', 'note', 'shown'],
        'mentions': [[int(m['hymn']), m['line'], m['form'], m['lemma'], m['entity'], m['mention_type'],
                      m['certainty'], m['note'], shown(m)] for m in mentions],
        'greek': [[int(r['hymn']), r['line'], r['text'], r['note']] for r in greek],
        'english': [[int(r['hymn']), r['line'], r['text']] for r in english],
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    n = sum(1 for m in mentions if shown(m))
    print(f'{OUT}: {len(hymns)} hymns, {len(entities)} entities ({sum(1 for c in count.values() if c)} shown), '
          f'{len(mentions)} mentions ({n} shown), {os.path.getsize(OUT) // 1024} KB')


if __name__ == '__main__':
    main()
