from opt import *
import sys, json
name = sys.argv[1]
fills = json.loads(sys.argv[2]); free = sys.argv[3].split(',')
h = text_opt2(fills, seed=1)
print(name, h)
P = dict(zip(KINDS, h))
for k in KINDS: print('  ', k, P[k], round(contrast(P[k]), 2), round(de(P[k], dict(zip(KINDS, fills))[k]), 1))
for s in ['normal', 'deutan', 'protan', 'tritan']:
    print('  ', s, [(round(d, 1), a, b) for d, a, b in min_pair(P, s)[:3]])
