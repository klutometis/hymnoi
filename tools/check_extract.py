#!/usr/bin/env python3
"""Validate one extraction chunk: data/extract/<chunk>.tsv (+ <chunk>.skipped.tsv).

    tools/check_extract.py 3a "3 1 178"

Checks columns and vocabularies, that every row's form occurs on its line, and
that every capitalized word in the span (tools/caps.py) is accounted for by a
mention row or a skipped row. Exit 1 on any problem.
"""
import csv, os, re, subprocess, sys, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COLS = ['hymn', 'line', 'form', 'lemma', 'referent', 'referent_en', 'kind', 'subkind',
        'mention_type', 'certainty', 'note']
KINDS = {'god', 'nymph', 'hero', 'mortal', 'group', 'creature', 'place'}
TYPES = {'name', 'epithet', 'patronymic', 'adjective', 'ethnic', 'periphrasis', 'personification'}
CERT = {'certain', 'probable', 'uncertain'}
ID = re.compile(r'^[a-z][a-z0-9_]*$')


def strip(s):
    s = unicodedata.normalize('NFD', s)
    return ''.join(c for c in s if unicodedata.category(c) != 'Mn').lower().replace('ς', 'σ').replace('ʼ', "'")


def main():
    chunk, spec = sys.argv[1], sys.argv[2].split()
    base = os.path.join(ROOT, 'data', 'extract', chunk)
    text = {(r['hymn'], r['line']): r['text'] for r in
            csv.DictReader(open(os.path.join(ROOT, 'data', 'text', 'greek.tsv')), delimiter='\t')}
    errs = []
    rows = list(csv.DictReader(open(base + '.tsv'), delimiter='\t'))
    if rows and list(rows[0].keys()) != COLS:
        errs.append(f'columns {list(rows[0].keys())} != {COLS}')
    for i, r in enumerate(rows, 2):
        where = f'{base}.tsv:{i} ({r.get("hymn")}.{r.get("line")} {r.get("form")})'
        t = text.get((r['hymn'], r['line']))
        if t is None:
            errs.append(f'{where}: no such line')
            continue
        for w in r['form'].split():
            if strip(w) not in strip(t):
                errs.append(f'{where}: form word {w!r} not on the line')
        if r['kind'] not in KINDS: errs.append(f'{where}: kind {r["kind"]!r}')
        if r['mention_type'] not in TYPES: errs.append(f'{where}: mention_type {r["mention_type"]!r}')
        if r['certainty'] not in CERT: errs.append(f'{where}: certainty {r["certainty"]!r}')
        if not ID.match(r['referent'] or ''): errs.append(f'{where}: referent id {r["referent"]!r}')
        if not r['lemma'].strip(): errs.append(f'{where}: empty lemma')
        if r['certainty'] != 'certain' and not r['note'].strip():
            errs.append(f'{where}: {r["certainty"]} needs a note')
    skipped = []
    if os.path.exists(base + '.skipped.tsv'):
        skipped = list(csv.DictReader(open(base + '.skipped.tsv'), delimiter='\t'))
    have = {}
    for r in rows:
        for w in r['form'].split():
            have[(r['hymn'], r['line'], strip(w))] = have.get((r['hymn'], r['line'], strip(w)), 0) + 1
    for r in skipped:
        have[(r['hymn'], r['line'], strip(r['word']))] = have.get((r['hymn'], r['line'], strip(r['word'])), 0) + 1
    caps = subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'caps.py')] + spec,
                          capture_output=True, text=True, check=True).stdout.splitlines()
    need = {}
    for c in caps:
        h, l, w = c.split('\t')
        need[(h, l, strip(w))] = need.get((h, l, strip(w)), 0) + 1
    for k, n in need.items():
        if have.get(k, 0) < 1:
            errs.append(f'capital not accounted for: {k[0]}.{k[1]} {k[2]}')
    for e in errs:
        print(e)
    print(f'{chunk}: {len(rows)} mentions, {len(skipped)} skipped, {len(need)} capitals in span, '
          f'{len(errs)} problems')
    sys.exit(1 if errs else 0)


if __name__ == '__main__':
    main()
