#!/usr/bin/env python3
"""Audit the 2009 graph against data/mentions.csv.

    tools/audit_legacy.py

Reads data/legacy/{nodes,edges}.csv and data/legacy/node_map.csv (2009 node ->
candidate entity ids, ';'-separated; written on first run from lemma matches
plus the hand overrides below, then curated by hand).

Writes data/legacy/audit.csv, one row per 2009 edge:
  source, target, label, entity, status, hymns, lines, note
status:
  confirmed            the entity is mentioned in a hymn to the source god, and the 2009
                       name occurs there (lines = where the name occurs)
  confirmed_entity     the entity is there, but not under the 2009 name (a spelling of another
                       edition, or the wrong epithet: Κυλλήνιος in a hymn that calls Hermes Ἀργειφόντης)
  confirmed_doubtful   ... but only by mentions marked uncertain
  elsewhere            mentioned in the Hymns, but not in a hymn to that god
  absent               not in this text at all
and data/legacy/new.csv: (dedicatee, entity) pairs the text has and 2009 lacks,
counting only names, epithets, patronymics, adjectives and ethnics that are not
marked uncertain.
"""
import collections, csv, os, re, sys, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = lambda *p: os.path.join(ROOT, 'data', *p)

OVERRIDES = {  # 2009 node -> candidate entities (first is preferred), note
    'megamedeides': ('pallas_megamedeides', 'patronymic of Pallas, Selene\'s father'),
    'olumpios': ('zeus;olympos', ''),
    'pallas': ('athena', ''),
    'pallas0': ('pallas_megamedeides', ''),
    'tuche': ('tyche_oceanid;tyche', ''),
    'huperion': ('hyperion_titan;helios', ''),
    'delias': ('deliades', ''),
    'tros': ('tros;troes', ''),
    'aiguptos': ('aigyptos;aigyptos_river', ''),
    'samos': ('samos;samothrake', ''),
    'bakcheios': ('dionysos', '2009 spelling Βάγχειος for Βάκχειος'),
    'dos': ('demeter', 'Demeter\'s false name; this text has Δωσώ, 2009 Δώς'),
    'leukippe': ('leukippos_wife;leukippe', '2009 spelling Λευκίππε'),
    'meter': ('meter_theon', ''),
    'pandeie': ('pandeia', ''),
    'parthenios': ('parthenion_phrear', ''),
    'titen': ('titanes', ''),
    'tritogenes': ('athena', ''),
    'ainienes': ('ainianes', 'this text has Ἐνιῆνες, 2009 Αἰνιῆνες'),
    'arguphee': ('argyphea', ''),
    'diokleus': ('diokles', ''),
    'dioklos': ('diokles', ''),
    'epeios': ('epeioi', ''),
    'meropes': ('meropes', ''),
    'xenos': ('', 'the hymn Εἰς Ξένους itself (2009 spelling Χένος)'),
    'huperboreos': ('hyperboreoi', ''),
    'phlegus': ('phlegyas;phlegyai', ''),
    'amarunthos': ('', 'not in this text'),
    'arkadie': ('arkadia', ''),
    'atlantis': ('', 'Ἀτλαντίς, "daughter of Atlas": not in this text, which has Ἄτλαντος θυγάτηρ (18.4)'),
    'drakanos': ('drakanon', ''),
    'eiresiai': ('peiresiai', 'this text has Πειρεσιάς, 2009 Εἰρεσίαι'),
    'iaolkos': ('iolkos', ''),
    'kallichoros': ('kallichoron', ''),
    'kephissos': ('kephisos', ''),
    'kudne': ('', 'not in this text'),
    'lektos': ('lekton', ''),
    'lukie': ('lykia', ''),
    'meionie': ('maionia', ''),
    'parnesos': ('parnassos', ''),
    'pierie': ('pieria', ''),
    'puthon': ('pytho;drakaina', ''),
    'rharios': ('rharion', ''),
    'smurne': ('smyrna', ''),
    'tainaros': ('tainaron', ''),
    'troie': ('troia', ''),
    'phrugie': ('phrygia', ''),
    'here': ('hera;hera_nymph', 'in 34.2 νύμφης ἐρατώπιδος Ἥρης may be a nymph, not the goddess'),
}
DEFAULT_TYPES = {'name', 'epithet', 'patronymic', 'adjective', 'ethnic'}


def strip(s):
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn').lower().replace('ς', 'σ')
    return re.sub("[\u02bc\u2019\u1fbd']", '', s)


def node_map(nodes, mentions, entities):
    path = D('legacy', 'node_map.csv')
    if os.path.exists(path):
        return {r['node']: r for r in csv.DictReader(open(path))}
    lem = collections.defaultdict(collections.Counter)
    for m in mentions:
        lem[strip(m['lemma'])][m['entity']] += 1
        lem[strip(m['form'])][m['entity']] += 1
    for e in entities.values():
        lem[strip(e['name_grc'])][e['id']] += 100
    out = {}
    for n in nodes:
        if n['id'] in OVERRIDES:
            ent, note = OVERRIDES[n['id']]
        else:
            c = lem.get(strip(n['label']))
            ent, note = (c.most_common(1)[0][0] if c else ''), ''
        out[n['id']] = {'node': n['id'], 'label': n['label'], 'kind_2009': n['kind'], 'entity': ent, 'note': note}
    with open(path, 'w', newline='') as f:
        w = csv.DictWriter(f, ['node', 'label', 'kind_2009', 'entity', 'note'], lineterminator='\n')
        w.writeheader()
        w.writerows(out.values())
    return out


def main():
    mentions = list(csv.DictReader(open(D('mentions.csv'))))
    entities = {r['id']: r for r in csv.DictReader(open(D('entities.csv')))}
    hymns = list(csv.DictReader(open(D('hymns.csv'))))
    nodes = list(csv.DictReader(open(D('legacy', 'nodes.csv'))))
    edges = list(csv.DictReader(open(D('legacy', 'edges.csv'))))
    nm = node_map(nodes, mentions, entities)
    words = collections.defaultdict(list)  # hymn -> [(line, stripped words)], to find the 2009 name itself
    for r in csv.DictReader(open(D('text', 'greek.tsv')), delimiter='\t'):
        words[r['hymn']].append((r['line'], [strip(w) for w in re.findall(r"[^\W\d_]+", r['text'])]))
    bad = {e for r in nm.values() for e in r['entity'].split(';') if e and e not in entities}
    if bad:
        sys.exit(f'node_map.csv names unknown entities: {sorted(bad)}')

    ded = collections.defaultdict(set)  # entity -> hymns dedicated to it
    for h in hymns:
        for d in h['dedicatees'].split(';'):
            if d:
                ded[d].add(h['hymn'])
    ded['xenos'] = {'34'}
    at = collections.defaultdict(list)  # entity -> mentions
    for m in mentions:
        at[m['entity']].append(m)

    def source_hymns(node):
        if node == 'xenos':
            return {'34'}
        return set().union(*(ded[e] for e in nm[node]['entity'].split(';') if e)) if nm[node]['entity'] else set()

    rows, have = [], set()
    for e in edges:
        s, t = e['source'], e['target']
        hs = source_hymns(s)
        cands = [c for c in nm[t]['entity'].split(';') if c]
        status, ent, where, lines = 'absent', cands[0] if cands else '', [], []
        for c in cands:
            ms = [m for m in at[c] if m['hymn'] in hs]
            if ms:
                sure = [m for m in ms if m['certainty'] != 'uncertain']
                lab = strip(nm[t]['label'].split()[0])
                st = lab[:max(3, len(lab) - 3)]
                if c == 'zeus':  # Ζεύς declines Διός, Διί, Δία, Ζῆνα
                    st = ('ζευ', 'διοσ', 'διι', 'δια', 'ζην')
                same = [f'{h}.{l}' for h in sorted(hs, key=int) for l, ws in words[h] if any(w.startswith(st) and (c != 'zeus' or w in ('ζευσ', 'ζευ', 'διοσ', 'διι', 'δια', 'ζηνα', 'ζηνοσ', 'ζηνι')) for w in ws)]
                status = 'confirmed_doubtful' if not sure else 'confirmed' if same else 'confirmed_entity'
                ent, lines = c, same or [f"{m['hymn']}.{m['line']}" for m in (sure or ms)]
                break
        else:
            for c in cands:
                if at[c]:
                    status, ent = 'elsewhere', c
                    lab = strip(nm[t]['label'].split()[0])
                    st = lab[:max(3, len(lab) - 3)]
                    lines = [f'{h}.{l}' for h in sorted(words, key=int) for l, ws in words[h]
                             if any(w.startswith(st) for w in ws)] or [f"{m['hymn']}.{m['line']}" for m in at[c]]
                    break
        for h in hs:
            have.add((h, ent))
        rows.append({'source': s, 'target': t, 'label': nm[t]['label'], 'entity': ent, 'status': status,
                     'hymns': ';'.join(sorted(hs, key=int)), 'lines': ';'.join(dict.fromkeys(lines)),
                     'note': nm[t]['note']})
    with open(D('legacy', 'audit.csv'), 'w', newline='') as f:
        w = csv.DictWriter(f, list(rows[0]), lineterminator='\n')
        w.writeheader()
        w.writerows(rows)

    # what the text has that 2009 lacks, grouped as 2009 grouped: by dedicatee
    new = collections.defaultdict(list)
    for m in mentions:
        if m['mention_type'] in DEFAULT_TYPES and m['certainty'] != 'uncertain' and (m['hymn'], m['entity']) not in have:
            new[(m['hymn'], m['entity'])].append(m)
    # 2009 never drew a god's own name in its own hymn as a separate fact unless it did; keep them, flagged
    with open(D('legacy', 'new.csv'), 'w', newline='') as f:
        w = csv.writer(f, lineterminator='\n')
        w.writerow(['hymn', 'entity', 'name_en', 'kind', 'dedicatee_self', 'count', 'lines', 'forms'])
        for (h, e), ms in sorted(new.items(), key=lambda kv: (int(kv[0][0]), kv[0][1])):
            dself = e in next(x for x in hymns if x['hymn'] == h)['dedicatees'].split(';')
            w.writerow([h, e, entities[e]['name_en'], entities[e]['kind'], 'yes' if dself else '', len(ms),
                        ';'.join(f"{m['hymn']}.{m['line']}" for m in ms), ';'.join(dict.fromkeys(m['form'] for m in ms))])
    c = collections.Counter(r['status'] for r in rows)
    print(dict(c), f'| new (hymn, entity) pairs: {len(new)}', file=sys.stderr)


if __name__ == '__main__':
    main()
