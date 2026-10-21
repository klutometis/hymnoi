import pickle,os,unicodedata,re
T=os.environ['TMPDIR']+'/pleiades'
P,N,WD=pickle.load(open(T+'/db.pkl','rb'))
def norm(s):
    s=unicodedata.normalize('NFD',s.lower()); return ''.join(c for c in s if not unicodedata.combining(c))
idx=[(pid,norm(' | '.join([P[pid]['title']]+sorted(N.get(pid,[]))))) for pid in P]
def S(q,n=8):
    q=norm(q); out=[pid for pid,t in idx if re.search(q,t)]
    for pid in out[:n]:
        r=P[pid]
        print(f"  {pid:>8} {r['title'][:40]:40} {r['featureTypes'][:30]:30} {r['reprLat'][:8]:>8},{r['reprLong'][:8]:<8} {r['locationPrecision'][:5]} {WD.get(pid,'')}")
    if len(out)>n: print('  ...',len(out))
def run(qs):
    for k,q in qs.items(): print(k); S(q)
