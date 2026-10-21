from opt import *
import sys, json
fills = json.loads(sys.argv[2]); pinned = sys.argv[3].split(',')
h = text_opt3(fills, pinned=pinned, seed=int(sys.argv[4]))
print(sys.argv[1], h)
P = dict(zip(KINDS, h))
for k in KINDS: print('  ', k, P[k], round(contrast(P[k]), 2), round(de(P[k], dict(zip(KINDS, fills))[k]), 1))
for s in ['normal', 'deutan', 'protan', 'tritan']:
    print('  ', s, [(round(d, 1), a, b) for d, a, b in min_pair(P, s)[:3]])
