#!/usr/bin/env python3
"""Import the Greek and English text of the Homeric Hymns into data/text/.

Source for hymns 1-33: ~/prg/canon/data/texts/0000-homeric.hymns.jsonl, which is
Perseus canonical-greekLit tlg0013 (perseus-grc2 + perseus-eng2): the Greek text
and English translation of H. G. Evelyn-White, *Hesiod, the Homeric Hymns and
Homerica* (Loeb, 1914). (canon's index.json calls the Greek "Allen"; the TEI
header says Evelyn-White 1914.)

Hymn 34, Εἰς Ξένους, is not in Evelyn-White's hymns (he prints it, from the
pseudo-Herodotean Life, as Epigram I). Its Greek is T. W. Allen, *Homeri Opera*
V (Oxford 1912), p. 92, transcribed from the page scan; Allen's apparatus notes
that the hymn manuscripts C D E Π T end the collection with it. The English is
Evelyn-White's Epigram I, which translates the *Life*'s text (Κύμην ἐριώπιδα
κούρην, Σαρδήνης), so it is given with a note, alongside a draft rendering of
Allen's text.

Perseus apparatus that leaked into the Greek lines (editorial notes run
together with the verse) is split out into a `note` column; see FIXES.

Writes data/text/greek.tsv (hymn, line, text, note) and
data/text/english.tsv (hymn, line, text, note); `line` is the first verse
line an English paragraph covers.
"""
import csv, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CANON = os.path.expanduser('~/prg/canon/data/texts/0000-homeric.hymns.jsonl')
OUT = os.path.join(ROOT, 'data', 'text')

# Lines where Perseus's <note> text was flattened into the verse.
FIXES = {
    '3.181': ('αὐτὸς δʼ αὖ Δήλοιο περικλύστης μέγʼ ἀνάσσεις.',
              'περικλύστοιο appears in later printings. περικλύστης is found in 1914 edition. '
              'This was a silent edit calling into question the publication date of the original print source.'),
    '18.4': ('Ἄτλαντος θυγάτηρ, Διὸς ἐν φιλότητι μιγεῖσα,',
             'Perseus has a doubled unaccented "Ατλαντος" before Ἄτλαντος; removed.'),
    '13.1': ('Δημήτηρ’ ἠύκομον, σεμνὴν θεάν, ἄρχομ’ ἀείδειν,',
             'Perseus has "Δημήτηρ’ Δημήτρ’" (two readings run together); kept Δημήτηρ’.'),
    '29.11': ('Ἑστίῃ· ἀμφότεροι γὰρ ἐπιχθονίων ἀνθρώπων',
              'Perseus has εἰδότες, repeated from 29.12; Ἑστίῃ as in Allen 1912 (p. 88) and as '
              'Evelyn-White translates ("you and Hestia"). Perseus prints 29.10 before 29.9, '
              'Evelyn-White\'s transposition; this file keeps numerical order.'),
}

# Word-level typos in the Perseus digitization: (line, wrong, right).
SUBS = [
    ('2.187', 'παρ αὐτὴν', 'παρʼ αὐτὴν'),
    ('2.376', 'Ἀιδωνευς', 'Ἀιδωνεύς'),
    ('3.388', 'Απόλλων', 'Ἀπόλλων'),
    ('3.395', 'φοίβου', 'Φοίβου'),
    ('4.158', 'Λητοίδου', 'Λητοΐδου'),
    ('4.366', 'Ερμῆς', 'Ἑρμῆς'),
    ('4.497', 'Ἐρμῇ', 'Ἑρμῇ'),
]

# Perseus mixes U+2019 and U+02BC for elision; use U+02BC (the majority) throughout.
APOS = ('\u2019', '\u02bc')

XENOI_GREEK = [
    'Αἰδεῖσθε ξενίων κεχρημένον ἠδὲ δόμοιο',
    'οἳ πόλιν αἰπεινὴν νύμφης ἐρατώπιδος Ἥρης',
    'ναίετε, Σαιδήνης πόδα νείατον ὑψικόμοιο,',
    'ἀμβρόσιον πίνοντες ὕδωρ ξανθοῦ ποταμοῖο',
    'Ἕρμου καλὰ ῥέοντος ὃν ἀθάνατος τέκετο Ζεύς.',
]
XENOI_NOTE = ('Allen, Homeri Opera V (1912) p. 92, from the scan. Apparatus: "Poemation εἰς ξένους '
              'habent C D E Π T ed. pr.: exstat et in vita Herodotea c. ix"; 2 κύμην ἐριώπιδα κούρην Herod.; '
              '3 σαρδήνης Herod., Σαιδηνή, ὄρος Κύμης Steph. Byz.; 5 ἔβρου codd., ἕρμου Herod.; '
              'after it: τέλος τῶν ὕμνων ὁμήρου E T.')
XENOI_ENGLISH = [
    ('Have reverence for him who needs a home and stranger’s dole, all ye who dwell in the high city of '
     'Cyme, the lovely maiden, hard by the foothills of lofty Sardene, ye who drink the heavenly water of '
     'the divine stream, eddying Hermus, whom deathless Zeus begot.',
     'Evelyn-White 1914, Homer’s Epigrams I: translates the Life of Homer text (Cyme, Sardene), not Allen’s.'),
]
XENOI_DRAFT = ('Respect one who stands in need of hospitality and a roof, you who dwell in the steep city of '
               'Hera, the lovely-eyed nymph, at the very foot of high-wooded Saidene, drinking the ambrosial '
               'water of the tawny river, fair-flowing Hermos, whom deathless Zeus begot.')

LATIN = re.compile(r'[A-Za-z]')


def clean(path, text):
    verse, note = _clean(path, text)
    for p, wrong, right in SUBS:
        if p == path:
            assert wrong in verse, (path, wrong)
            verse = verse.replace(wrong, right)
            note = (note + ' ' if note else '') + f'Perseus prints {wrong}.'
    return verse.replace(*APOS), note


def _clean(path, text):
    if path in FIXES:
        return FIXES[path]
    m = LATIN.search(text)
    if not m:
        return text, ''
    # A flattened note starts at the first Latin letter ("ll. 136-8 ...",
    # "Allen.", "Suggested by ..."); a closing bracket at its end belongs to the verse.
    verse, note = text[:m.start()], text[m.start():]
    if note.rstrip().endswith(']'):
        note = note.rstrip()[:-1]
        verse = verse + ']'
    return verse.rstrip(), note.strip()


def key(path):
    h, l = path.split('.', 1)
    m = re.match(r'(\d+)(.*)', l)
    return int(h), int(m.group(1)), m.group(2)


def main():
    rows = [json.loads(l) for l in open(CANON)]
    greek, english = [], []
    for r in rows:
        h, l = r['path'].split('.', 1)
        if r['side'] == 'original':
            verse, note = clean(r['path'], r['text'])
            greek.append((int(h), l, verse, note))
        else:
            english.append((int(h), l, r['text'].strip(), ''))
    for i, v in enumerate(XENOI_GREEK, 1):
        greek.append((34, str(i), v, XENOI_NOTE if i == 1 else ''))
    english.append((34, '1', XENOI_ENGLISH[0][0], XENOI_ENGLISH[0][1] + ' Draft of Allen’s text: ' + XENOI_DRAFT))
    greek.sort(key=lambda r: key(f'{r[0]}.{r[1]}'))
    english.sort(key=lambda r: key(f'{r[0]}.{r[1]}'))
    os.makedirs(OUT, exist_ok=True)
    for name, data in (('greek.tsv', greek), ('english.tsv', english)):
        with open(os.path.join(OUT, name), 'w', newline='') as f:
            w = csv.writer(f, delimiter='\t', lineterminator='\n', quoting=csv.QUOTE_MINIMAL)
            w.writerow(['hymn', 'line', 'text', 'note'])
            w.writerows(data)
    print(f'greek: {len(greek)} lines, english: {len(english)} paragraphs', file=sys.stderr)
    for h, l, v, n in greek:
        if n:
            print(f'  note {h}.{l}: {v[:50]!r} | {n[:60]!r}', file=sys.stderr)


if __name__ == '__main__':
    main()
