from opt import *
base=["#D55E00","#009E73","#E69F00","#0072B2","#CC79A7","#221d17","#56B4E9"]
B=bounds_around(base,dL=8,dC=14,dh=8)
B[15:18]=[(10,26),(0,6),(40,90)]
anchor=np.array([rgb2lab(hex2rgb(h)) for h in base])
f=make_objective(anchor=anchor,w_anchor=0.03,extra=hierarchy2,gam_max=0.7)
res=differential_evolution(f,B,seed=3,maxiter=250,popsize=20,tol=1e-9,polish=False)
h=to_hex(res.x); print(res.fun); describe(h,'oi-adapt')
for a,b in zip(base,h): print(a,b,round(de(a,b),1))
