from opt import *
import sys
seed=int(sys.argv[1])
B=[(40,52),(52,70),(28,42), (45,60),(22,42),(155,190), (58,70),(38,58),(72,86), (32,50),(25,45),(250,285), (30,48),(25,45),(325,355), (12,26),(0,6),(40,90), (64,78),(10,24),(100,135)]
f=make_objective(extra=hierarchy2, gam_max=0.7)
res=differential_evolution(f,B,seed=seed,maxiter=350,popsize=20,tol=1e-9,polish=False)
h=to_hex(res.x); print(res.fun); describe(h,'pig s%d'%seed)
