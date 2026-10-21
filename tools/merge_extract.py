#!/usr/bin/env python3
"""Merge the extraction chunks (data/extract/*.tsv) into the curated data files.

    tools/merge_extract.py [--force]

Writes
  data/mentions.csv  one row per mention, in text order:
                     hymn, line, form, lemma, entity, mention_type, certainty, note
  data/entities.csv  one row per entity: id, kind, subkind, name_grc, name_en
                     (only ids not already present are added, so hand edits survive)
  data/hymns.csv     one row per hymn (regenerated)

Entity ids are rewritten through data/extract/aliases.csv. After the first run
mentions.csv is the file to edit; this script refuses to overwrite it without
--force, since that would throw away edits made since.
"""
import collections, csv, glob, os, re, sys, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = lambda *p: os.path.join(ROOT, 'data', *p)

HYMNS = [  # n, title (Greek), title (English), dedicatees
    (1, 'Εἰς Διόνυσον', 'To Dionysus', 'dionysos'),
    (2, 'Εἰς Δημήτραν', 'To Demeter', 'demeter'),
    (3, 'Εἰς Ἀπόλλωνα', 'To Apollo', 'apollon'),
    (4, 'Εἰς Ἑρμῆν', 'To Hermes', 'hermes'),
    (5, 'Εἰς Ἀφροδίτην', 'To Aphrodite', 'aphrodite'),
    (6, 'Εἰς Ἀφροδίτην', 'To Aphrodite', 'aphrodite'),
    (7, 'Εἰς Διόνυσον', 'To Dionysus', 'dionysos'),
    (8, 'Εἰς Ἄρεα', 'To Ares', 'ares'),
    (9, 'Εἰς Ἄρτεμιν', 'To Artemis', 'artemis'),
    (10, 'Εἰς Ἀφροδίτην', 'To Aphrodite', 'aphrodite'),
    (11, 'Εἰς Ἀθηνᾶν', 'To Athena', 'athena'),
    (12, 'Εἰς Ἥραν', 'To Hera', 'hera'),
    (13, 'Εἰς Δημήτραν', 'To Demeter', 'demeter'),
    (14, 'Εἰς Μητέρα θεῶν', 'To the Mother of the Gods', 'meter_theon'),
    (15, 'Εἰς Ἡρακλέα λεοντόθυμον', 'To Heracles the Lion-Hearted', 'herakles'),
    (16, 'Εἰς Ἀσκληπιόν', 'To Asclepius', 'asklepios'),
    (17, 'Εἰς Διοσκούρους', 'To the Dioscuri', 'dioskouroi'),
    (18, 'Εἰς Ἑρμῆν', 'To Hermes', 'hermes'),
    (19, 'Εἰς Πᾶνα', 'To Pan', 'pan'),
    (20, 'Εἰς Ἥφαιστον', 'To Hephaestus', 'hephaistos'),
    (21, 'Εἰς Ἀπόλλωνα', 'To Apollo', 'apollon'),
    (22, 'Εἰς Ποσειδῶνα', 'To Poseidon', 'poseidon'),
    (23, 'Εἰς ὕπατον Κρονίδην', 'To the Son of Cronos, Most High', 'zeus'),
    (24, 'Εἰς Ἑστίαν', 'To Hestia', 'hestia'),
    (25, 'Εἰς Μούσας καὶ Ἀπόλλωνα', 'To the Muses and Apollo', 'mousai;apollon'),
    (26, 'Εἰς Διόνυσον', 'To Dionysus', 'dionysos'),
    (27, 'Εἰς Ἄρτεμιν', 'To Artemis', 'artemis'),
    (28, 'Εἰς Ἀθηνᾶν', 'To Athena', 'athena'),
    (29, 'Εἰς Ἑστίαν καὶ Ἑρμῆν', 'To Hestia and Hermes', 'hestia;hermes'),
    (30, 'Εἰς Γῆν μητέρα πάντων', 'To Earth, Mother of All', 'gaia'),
    (31, 'Εἰς Ἥλιον', 'To Helios', 'helios'),
    (32, 'Εἰς Σελήνην', 'To Selene', 'selene'),
    (33, 'Εἰς Διοσκούρους', 'To the Dioscuri', 'dioskouroi'),
    (34, 'Εἰς Ξένους', 'To Guest-friends', ''),
]

ONES = ['', 'α', 'β', 'γ', 'δ', 'ε', 'ϛ', 'ζ', 'η', 'θ']
TENS = ['', 'ι', 'κ', 'λ']


def greek_numeral(n):
    return TENS[n // 10] + ONES[n % 10] + 'ʹ'


def roman(n):
    out = ''
    for v, s in ((10, 'X'), (9, 'IX'), (5, 'V'), (4, 'IV'), (1, 'I')):
        while n >= v:
            out += s
            n -= v
    return out


def strip(s):
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn').lower().replace('ς', 'σ')
    return re.sub("[\u02bc\u2019\u1fbd']", '', s)


def line_key(line):
    m = re.match(r'(\d+)(.*)', line)
    return int(m.group(1)), m.group(2)


def main():
    text = {(r['hymn'], r['line']): r['text'] for r in
            csv.DictReader(open(D('text', 'greek.tsv')), delimiter='\t')}
    alias = {r['from']: r['to'] for r in csv.DictReader(open(D('extract', 'aliases.csv')))}
    rows = []
    for f in sorted(glob.glob(D('extract', '*.tsv'))):
        if f.endswith('.skipped.tsv'):
            continue
        rows += list(csv.DictReader(open(f), delimiter='\t'))
    for r in rows:
        r['referent'] = alias.get(r['referent'], r['referent'])
        t = strip(text[(r['hymn'], r['line'])])
        r['_pos'] = t.find(strip(r['form'].split()[0]))
    rows.sort(key=lambda r: (int(r['hymn']), line_key(r['line']), r['_pos'], r['referent']))

    if os.path.exists(D('mentions.csv')) and '--force' not in sys.argv:
        sys.exit('data/mentions.csv exists; it may have hand edits. Use --force to overwrite.')
    cols = ['hymn', 'line', 'form', 'lemma', 'entity', 'mention_type', 'certainty', 'note']
    with open(D('mentions.csv'), 'w', newline='') as f:
        w = csv.writer(f, lineterminator='\n')
        w.writerow(cols)
        for r in rows:
            w.writerow([r['hymn'], r['line'], r['form'], r['lemma'], r['referent'], r['mention_type'],
                        r['certainty'], r['note']])

    # entities: most common kind/subkind/English name; Greek name from name-type lemmas
    by = collections.defaultdict(list)
    for r in rows:
        by[r['referent']].append(r)
    have = {}
    if os.path.exists(D('entities.csv')):
        have = {r['id']: r for r in csv.DictReader(open(D('entities.csv')))}
    ecols = ['id', 'kind', 'subkind', 'name_grc', 'name_en']
    out = dict(have)
    for k, v in by.items():
        if k in have:
            continue
        mc = lambda key, rs=v: collections.Counter(r[key] for r in rs if r[key]).most_common(1)[0][0] \
            if any(r[key] for r in rs) else ''
        names = [r for r in v if r['mention_type'] == 'name'] or v
        out[k] = {'id': k, 'kind': mc('kind'), 'subkind': mc('subkind'),
                  'name_grc': mc('lemma', names), 'name_en': mc('referent_en')}
    with open(D('entities.csv'), 'w', newline='') as f:
        w = csv.DictWriter(f, ecols, lineterminator='\n', extrasaction='ignore')
        w.writeheader()
        for k in sorted(out):
            w.writerow(out[k])
    unused = set(out) - set(by)
    if unused:
        print('entities with no mentions:', sorted(unused), file=sys.stderr)

    count = collections.Counter(h for h, _ in text)
    last = collections.defaultdict(int)
    for h, l in text:
        last[h] = max(last[h], line_key(l)[0])
    with open(D('hymns.csv'), 'w', newline='') as f:
        w = csv.writer(f, lineterminator='\n')
        w.writerow(['hymn', 'numeral', 'roman', 'title_grc', 'title_en', 'dedicatees', 'lines', 'last_line'])
        for n, tg, te, ded in HYMNS:
            w.writerow([n, greek_numeral(n), roman(n), tg, te, ded, count[str(n)], last[str(n)]])
    print(f'{len(rows)} mentions, {len(by)} entities ({len(out) - len(have)} new), 34 hymns', file=sys.stderr)


if __name__ == '__main__':
    main()
