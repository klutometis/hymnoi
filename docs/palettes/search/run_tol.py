from opt import *
base=["#882255","#44AA99","#999933","#CC6677","#117733","#332288","#88CCEE"]
B=bounds_around(base)
anchor=np.array([rgb2lab(hex2rgb(h)) for h in base])
f=make_objective(anchor=anchor,w_anchor=0.04,extra=hier_contrast,gam_max=0.7)
res=differential_evolution(f,B,seed=4,maxiter=250,popsize=20,tol=1e-9,polish=False)
h=to_hex(res.x); print(res.fun); describe(h,'tol-adapt2')
for a,b in zip(base,h): print(a,b,round(de(a,b),1))
