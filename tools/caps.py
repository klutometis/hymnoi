#!/usr/bin/env python3
"""List every capitalized word in a span of the Greek text, for extraction coverage.

    tools/caps.py 3 1 178        # Hymn 3, lines 1-178 (inclusive; 'a' lines included)
    tools/caps.py 9-34           # whole hymns 9 through 34

Prints hymn, line, word. Every one of these must end up either as a mention in
data/extract/*.tsv or in that chunk's `skipped` list (a capital that only marks
a paragraph start, e.g. Τὸν, Ὣς, Βῆ).
"""
import csv, os, re, sys, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOK = re.compile(r"[^\W\d_]+", re.U)


def lines(spec):
    rows = list(csv.DictReader(open(os.path.join(ROOT, 'data', 'text', 'greek.tsv')), delimiter='\t'))
    if len(spec) == 1 and '-' in spec[0]:
        a, b = map(int, spec[0].split('-'))
        return [r for r in rows if a <= int(r['hymn']) <= b]
    h, a, b = int(spec[0]), int(spec[1]), int(spec[2])
    num = lambda r: int(re.match(r'\d+', r['line']).group(0))
    return [r for r in rows if int(r['hymn']) == h and a <= num(r) <= b]


def main():
    for r in lines(sys.argv[1:]):
        for m in TOK.finditer(r['text']):
            w = m.group(0)
            if unicodedata.normalize('NFD', w)[0].isupper():
                print(f"{r['hymn']}\t{r['line']}\t{w}")


if __name__ == '__main__':
    main()
