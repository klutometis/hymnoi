import sys,os,csv,collections
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__))); from pl import P,WD
R='/home/danenberg/.harness/worktrees/hymnoi'
E='exact';A='approximate';G='region';U='unlocated';M='mythical'
# id: (pleiades, (lat,lon) override | None | 'blank', precision, note[, wikidata override[, topostext override]])
rows = {
'aigai':('540603',None,A,'3.32, 22.3: which Aigai is disputed (Euboia or Achaea); Euboian Aigai per REVIEW.md B4'),
'aigina':('579844',None,E,''),
'aigyptos':('981503',(27.1,30.7),G,'7.28: Egypt, the land; the Pleiades representative point lies in Nubia, so a central point in Egypt is used'),
'aigyptos_river':('727172',(29.85,31.25),A,'1.9: Αἰγύπτοιο ῥοάων taken as the Nile per REVIEW.md B14; the Pleiades point lies in South Sudan, so placed on the Egyptian Nile at Memphis'),
'aipy':('570226',None,A,"3.423: Homer's Aipy, identified with Ep(e)ion in Triphylia, as Pleiades and Wikidata do; Strabo 8.3.24 also offers Margalai"),
'aisagee':('','blank',U,"3.40: Αἰσαγέης ὄρος, named with Klaros in Leto's catalogue; unidentified, not in Pleiades"),
'alpheios':('570067',None,E,''),
'antron':('540644',None,E,''),
'arene':('573114',(37.5259,21.5962),A,'3.422: Homeric Arene in Triphylia, unlocated in Pleiades; placed at Samikon, where Strabo 8.3.19 and Paus. 5.6.2 put it'),
'argyphea':('','blank',U,'3.422: Ἀργυφέη, a town of the Triphylian coast between Arene and Thryon; unidentified, not in Pleiades'),
'arkadia':('570102',None,G,'4.2, 18.2, 19.30: the land'),
'asphodelos_leimon':('','blank',M,'4.344 (and 4.221): the meadow the cattle tracks lead to, in the words of the underworld meadow (Od. 11.539); left unplaced'),
'athenai':('579885',None,E,''),
'athos':('501366',None,E,''),
'autokane':('550616',None,A,"3.35: Autokane, the height of Mount Kane (Kara Dağ) in Aeolis; Pleiades 550618 names Kane/Autokane but has only a rough point at sea, so the mountain's point (550616) is used"),
'chalkis_elis':('573160',(37.555,21.56),A,'3.425: Chalkis on the Triphylian coast, unlocated; Strabo 8.3.13 puts it with Krounoi between the Alpheios mouth and Samikon, placed there'),
'chios':('550497',None,E,''),
'delos':('599588',None,E,''),
'dotion':('540741',None,E,''),
'doulichion':('530845',None,A,'3.429: Homeric Doulichion, sighted from the Cretan ship; identification disputed (Lefkas, part of Kephallenia, the Echinades); Pleiades identifies it with Dolicha in the Echinades'),
'drakanon':('599599',None,A,"1.1: location disputed, a headland on Ikaros or on Kos; Pleiades' Drakanon promontory on Ikaros, which 1.1 names beside it"),
'dyme':('570205',None,E,'3.425: out of order in the voyage (Dyme is north of Elis and Pheia); kept, REVIEW.md B8'),
'eleusis':('579920',None,E,''),
'elis':('570221',None,G,'3.426: the land of the Epeians'),
'erebos':('832339226','blank',M,'2.335, 2.349, 2.409: the underworld'),
'euboia':('540775',None,E,''),
'euripos':('540783',None,E,''),
'europe_mainland':('536074',(38.9,22.4),G,'3.251, 3.291: Europe as mainland Greece, beside the Peloponnese and the islands; unlocated in Pleiades, point chosen in central Greece'),
'haliartos':('540801',None,E,''),
'helikon':('540808',None,A,'22.3: Mount Helikon as printed; Helike in Achaea (Poseidon Helikonios) is the alternative, REVIEW.md B5'),
'hermos':('550575',None,E,''),
'ide':('550592',None,E,''),
'ikaros':('599667',None,E,''),
'ilios':('550595',None,E,''),
'imbros':('501439',None,E,''),
'inopos':('',(37.3981,25.2694),A,'3.18: the stream of Delos, not in Pleiades; point from Wikidata','Q108363834'),
'iolkos':('540837',None,E,''),
'ithake':('530906',None,E,''),
'kallichoron':('',(38.0413,23.5385),A,'2.272: the well at Eleusis (excavated outside the Greater Propylaia), not in Pleiades; placed at the sanctuary'),
'karpathos':('589841',None,E,'','Q204757'),
'kastalia':('203037083',None,A,'3.300: an unnamed κρήνη at Pytho; Kastalia is a guess, REVIEW.md B27 (hidden)'),
'kenaion':('540858',None,E,''),
'kephisis':('540715',None,E,''),
'kephisos':('540700',None,E,''),
'klaros':('599719',None,E,''),
'knidos':('599576',None,E,'3.43: Knidos at Burgaz (the older city); the later city at Tekir is Pleiades 599575'),
'knosos':('589872',None,E,''),
'korykos':('550666',None,E,''),
'kos':('599581',None,E,''),
'krete':('589748',None,E,''),
'krisa':('540889',None,E,''),
'krounoi':('573314',(37.585,21.545),A,'3.425: Krounoi on the Triphylian coast, unlocated; Strabo 8.3.13 puts it between the Alpheios mouth and Samikon, placed there'),
'kyllene':('570391',None,E,''),
'kynthos':('599740',None,E,''),
'kypros':('707498',None,E,''),
'lakonike':('570406',None,G,'3.410: the Lakonian land'),
'lekton':('550691','blank',U,"3.217: the only Lekton is the cape in the Troad (Pleiades 550691), off Apollo's road from Pieria into Thessaly; possibly corrupt, REVIEW.md B6"),
'lelanton':('540911',(38.43,23.69),A,"3.220: the plain between Chalkis and Eretria; the Pleiades point is Euboia's centre, so placed in the plain"),
'lemnos':('550693',None,E,''),
'lesbos':('550696',None,E,''),
'lilaia':('540915',None,E,''),
'lykia':('638965',None,G,'3.179: the land'),
'maionia':('550701',None,G,'3.179: Maionia, i.e. Lydia'),
'maleia':('570455',None,E,''),
'meles':('550729',(38.432,27.166),A,'9.3: the river of Smyrna; the Pleiades point is rough, placed at the Halkapınar springs, the usual identification'),
'messapion':('543787',None,A,'3.223: ὄρος ζάθεον, unnamed; Messapion is a guess, REVIEW.md B27 (hidden)'),
'miletos':('599799',None,E,''),
'mimas':('550744',None,E,''),
'mykale':('599805',None,E,''),
'mykalessos':('540953',None,E,''),
'naxos':('599822',None,E,''),
'neon_teichos':('550773',None,A,"34.2: the city is unnamed (πόλιν αἰπεινήν); Neon Teichos per the Vita Herodotea 9-10 (Evelyn-White's Vita: Kyme)"),
'nysa':('','blank',M,'1.8, 2.17, 26.5: the mountain where Dionysos was nursed, "far from Phoenicia, near the streams of Aigyptos" (1.8-9); mythical'),
'okalea':('540978',None,E,''),
'olympos':('491677',None,E,'seat of the gods; pinned to the Thessalian mountain'),
'onchestos':('540984',None,E,''),
'ortygia':('','blank',U,"3.16: Artemis' birthplace: its own island, Rheneia, a grove near Ephesos, or Delos; place unknown, REVIEW.md B3"),
'paphos':('707596',None,E,'5.59: the sanctuary at Old Paphos (Palaipaphos)'),
'parnassos':('541012',None,E,''),
'paros':('599868',None,E,''),
'parthenion_phrear':('',(38.0411,23.5374),A,'2.99: the Maiden Well beside the road at Eleusis, not in Pleiades and not securely identified (sometimes taken for the Kallichoron); placed at Eleusis'),
'peiresiai':('540674',None,A,'3.32: Peiresiai, which Pleiades identifies with Asterion/Peirasia in Thessaly; others place it in Magnesia'),
'pelion':('541021',None,E,''),
'peloponnesos':('570577',None,G,'3.250, 3.419 etc.: the land'),
'peneios':('541022',None,E,''),
'peparethos':('541024',None,E,''),
'pherai_elis':('570592',None,A,'3.427: Φεράς as printed; Odyssey 15.297 reads Φεάς, Pheia in Elis, REVIEW.md B7'),
'phoinike':('678334',None,G,'1.9: the land'),
'phokaia':('550823',None,E,''),
'phrygia':('609502',None,G,'5.112: the land'),
'pieria':('491696',None,G,'3.216, 4.70 etc.: the land below Olympos','Q7800388','402225RPie'),
'pylos':('573490',(37.4569,21.6447),A,'3.398, 3.424, 4.216 etc.: Triphylian Pylos (by the Alpheios ford, 4.398), REVIEW.md B13; unlocated in Pleiades, placed at Kakovatos, the usual candidate'),
'pytho':('540726',None,E,'Pytho = Delphi (27.14 Δελφῶν δῆμον)'),
'rharion':('585954',None,A,'2.450: the Rharian plain near Eleusis, unlocated; Pleiades places it at Eleusis'),
'rheneia':('599919',None,E,''),
'saidene':('',(38.71,27.02),A,'34.3: a mountain of Kyme (Steph. Byz. Σαιδηνή, ὄρος Κύμης), unidentified, not in Pleiades; placed in the hills between Kyme and Neon Teichos'),
'salamis_kypros':('707617',None,A,'10.4: Salamis on Cyprus (paired with Κύπρου), not the island off Attica, REVIEW.md B15'),
'same':('531093',None,E,'3.429: Homeric Same, i.e. Kephallenia; the Pleiades point is the town of Same on it'),
'samos':('599926',None,E,''),
'samothrake':('501597',None,E,''),
'skyros':('541108',None,E,''),
'smyrna':('550893',None,E,''),
'tainaron':('570703',None,E,''),
'tartaros':('595204976','blank',M,'3.336, 4.256, 4.374: below the earth'),
'taygetos':('570706',None,E,''),
'teumessos':('541133',None,E,''),
'thebai':('541138',None,E,''),
'thorikos':('580119',None,E,''),
'thrake':('501638',None,G,'3.33, 3.34: Thracian Athos, Thracian Samos'),
'thryon':('573559',(37.6321,21.4760),A,'3.423: Thryon, ford of the Alpheios, unlocated; placed at Epitalion, which Strabo 8.3.24 identifies with it','Q12878005',''),
'troia':('550944',None,G,'5.66: the Troad'),
'zakynthos':('531155',None,E,''),
}
# extra: a nymph who is also a place, and a stop on Apollo's road
extra = [dict(id='telphousa',pleiades='541148',lat='38.3711',lon='22.9945',precision=A,wikidata='',topostext='',
              note="nymph: her spring, the Tilphousa below Mount Tilphossion near Haliartos (3.244), on Apollo's road; placed at Pleiades' Tilphosaion")]
people = {
'ainianes':('540611',None,"3.217: Homer's Enienes, later of Ainis in the Spercheios valley"),
'eleusinioi':('579920',None,'2.266: Eleusis'),
'epeioi':('570221',None,'3.426: Elis'),
'hyperboreoi':('','blank','7.29: beyond the north wind; mythical'),
'iones':('550597',None,'3.147: Ionia'),
'kretes':('589748',None,'3.393: Crete'),
'krisaioi':('540889',None,'3.446: Krisa'),
'meropes':('599581',None,'3.42: Kos'),
'perrhaiboi':('491689',None,'3.218: Perrhaibia'),
'phlegyai':('540987',None,"3.278-280: their city by the Kephisian lake; placed at Orchomenos, Phlegyas' city"),
'phryges':('609502',None,'5.137: Phrygia'),
'pylioi':('573490',(37.4569,21.6447),'3.398, 3.424: Triphylian Pylos (placed at Kakovatos)'),
'troes':('550944',None,'5.103: the Troad'),
'tyrsenoi':('413122',None,'7.8: the Tyrsenian pirates; Etruria (Lemnos is the other candidate)'),
}
ents=list(csv.DictReader(open(R+'/data/entities.csv')))
placeids=[e['id'] for e in ents if e['kind']=='place']; peopleids=[e['id'] for e in ents if e['subkind']=='people']
assert set(placeids)==set(rows), set(placeids)^set(rows)
assert set(peopleids)==set(people), set(peopleids)^set(people)
pt=lambda pid: (float(P[pid]['reprLat']),float(P[pid]['reprLong']))
def links(pid):
    w=WD.get(pid,[]) if pid else []
    return w[0] if w else ('','')
def coords(pid,ov):
    if ov=='blank': return '',''
    lat,lon=ov if ov else pt(pid)
    return f'{lat:.4f}',f'{lon:.4f}'
out=[]
for k in placeids:
    t=rows[k]; pid,ov,prec,note=t[:4]
    lat,lon=coords(pid,ov); q,tt=links(pid)
    if len(t)>4: q=t[4]
    if len(t)>5: tt=t[5]
    assert prec==E or note, k
    assert (lat=='')==(prec in (U,M) or k=='x'), k
    out.append(dict(id=k,pleiades=pid,lat=lat,lon=lon,precision=prec,wikidata=q,topostext=tt,note=note))
out+=extra
for k in peopleids:
    pid,ov,n=people[k]; lat,lon=coords(pid,ov)
    out.append(dict(id=k,pleiades=pid,lat=lat,lon=lon,precision=G if lat else M,wikidata='',topostext='',note='people: homeland; '+n))
with open(R+'/data/places.csv','w',newline='') as f:
    w=csv.DictWriter(f,fieldnames='id,pleiades,lat,lon,precision,wikidata,topostext,note'.split(',')); w.writeheader(); w.writerows(out)
print(len(out),collections.Counter(o['precision'] for o in out))
print(' '.join(sorted(set(o['wikidata'] for o in out if o['wikidata']))))
