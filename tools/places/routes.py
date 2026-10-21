import csv,collections
R='/home/danenberg/.harness/worktrees/hymnoi'
# route: [(entity, hymn, line, note)]
routes = {
'leto': [  # 3.30-44: the lands that refused her, in the text's order, then Delos
 ('krete',3,'30',''),('athenai',3,'30','δῆμος Ἀθηνῶν'),('aigina',3,'31',''),('euboia',3,'31',''),
 ('aigai',3,'32','Euboian Aigai, REVIEW.md B4'),('peiresiai',3,'32',''),('peparethos',3,'32',''),
 ('athos',3,'33','Θρηίκιος Ἀθόως'),('pelion',3,'33',''),('samothrake',3,'34','Θρηικίη Σάμος'),('ide',3,'34',''),
 ('skyros',3,'35',''),('phokaia',3,'35',''),('autokane',3,'35',''),('imbros',3,'36',''),('lemnos',3,'36',''),
 ('lesbos',3,'37',''),('chios',3,'38',''),('mimas',3,'39',''),('korykos',3,'39',''),('klaros',3,'40',''),
 ('aisagee',3,'40','unlocated'),('samos',3,'41',''),('mykale',3,'41',''),('miletos',3,'42',''),
 ('kos',3,'42','πόλις Μερόπων ἀνθρώπων'),('knidos',3,'43',''),('karpathos',3,'43',''),('naxos',3,'44',''),
 ('paros',3,'44',''),('rheneia',3,'44',''),('delos',3,'49','where she gave birth: the end of the wandering'),
],
'apollo_road': [  # 3.216-282
 ('olympos',3,'216','start: down from Olympos'),('pieria',3,'216',''),
 ('lekton',3,'217','unlocated: the Troad cape is off the route, REVIEW.md B6'),('ainianes',3,'217','people'),
 ('perrhaiboi',3,'218','people: διὰ Περραιβούς'),('iolkos',3,'218',''),('kenaion',3,'219','Κηναίου ... Εὐβοίης'),
 ('lelanton',3,'220','he thought of building here, but not'),('euripos',3,'222','crossed'),
 ('messapion',3,'223','ὄρος ζάθεον, unnamed; Messapion a guess (REVIEW.md B27, hidden)'),
 ('mykalessos',3,'224',''),('teumessos',3,'224',''),('thebai',3,'225','still uninhabited forest'),
 ('onchestos',3,'230',"Poseidon's grove"),('kephisos',3,'240','crossed; it flows from Lilaia (3.241)'),
 ('okalea',3,'242',''),('haliartos',3,'243',''),('telphousa',3,'244','the spring; he lays foundations and is talked out of it'),
 ('phlegyai',3,'278','their city, by the Kephisian lake (3.280)'),('krisa',3,'282','under snowy Parnassos: the temple founded'),
],
'cretan_ship': [  # 3.388-439
 ('knosos',3,'393','the Cretans sail from Knossos, bound for Pylos (3.398)'),('maleia',3,'409','rounded'),
 ('lakonike',3,'410','along the Lakonian coast'),('tainaron',3,'412','they want to land and cannot'),
 ('arene',3,'422',''),('argyphea',3,'422','unlocated'),('thryon',3,'423','Θρύον, Ἀλφειοῖο πόρον'),
 ('alpheios',3,'423','the ford at Thryon'),('aipy',3,'423',''),('pylos',3,'424','their destination, passed'),
 ('krounoi',3,'425',''),('chalkis_elis',3,'425',''),('dyme',3,'425','out of order, REVIEW.md B8'),
 ('elis',3,'426','where the Epeians rule'),('pherai_elis',3,'427','Pheia, REVIEW.md B7'),
 ('ithake',3,'428','sighted: Ἰθάκης ὄρος αἰπύ'),('doulichion',3,'429','sighted'),('same',3,'429','sighted'),
 ('zakynthos',3,'429','sighted'),('krisa',3,'438','into the gulf of Krisa (3.431) and to its harbour'),
 ('pytho',3,'517','on foot behind Apollo, up to Pytho under Parnassos (3.521)'),
],
'hermes_cattle': [  # Hymn 4: the theft and the return
 ('kyllene',4,'2','start: the cave on Kyllene (he leaves it at 4.65)'),('pieria',4,'70',"the gods' cattle in Pieria's mountains"),
 ('onchestos',4,'88','driving the cattle past the old man'),('alpheios',4,'101','the cattle stalled; the sacrifice by the river'),
 ('kyllene',4,'142','home again by dawn'),
],
'apollo_search': [  # Hymn 4: Apollo tracks the cattle, then both go to Zeus
 ('pieria',4,'191','start: βοῦς ἀπὸ Πιερίης διζήμενος'),('onchestos',4,'186','he questions the old man'),
 ('pylos',4,'216','the tracks'),('kyllene',4,'228',"Maia's cave"),('olympos',4,'322','to Zeus, with Hermes'),
],
'cattle_return': [  # Hymn 4: the brothers fetch the cattle and go back to Olympos
 ('olympos',4,'325','start'),('pylos',4,'398','ἐς Πύλον ἠμαθόεντα ἐπʼ Ἀλφειοῦ πόρον'),
 ('alpheios',4,'398','the ford, where the cattle are penned'),('olympos',4,'505','back to Olympos with the lyre'),
],
'demeter': [  # Hymn 2
 ('olympos',2,'92','she leaves the gods'),('eleusis',2,'97',"to Keleos' house"),
 ('parthenion_phrear',2,'99','she sits by the Maiden Well'),('olympos',2,'484','back to Olympos after founding the rites'),
],
'doso_tale': [  # Hymn 2: Demeter's false story as Doso
 ('krete',2,'123','carried off by pirates'),('thorikos',2,'126','where the pirates land; she escapes'),
 ('eleusis',2,'133','δεῦρʼ ἱκόμην (Eleusis named 2.97)'),
],
'persephone_return': [  # Hymn 2: Hermes fetches Persephone
 ('olympos',2,'341','Hermes leaves Olympos'),('erebos',2,'335','to Hades in Erebos'),
 ('eleusis',2,'385','to Demeter before her temple (Eleusis named 2.356)'),
],
'aphrodite_ida': [  # Hymn 5
 ('kypros',5,'58',''),('paphos',5,'59','her temple and precinct'),('troia',5,'66','she speeds toward Troy'),
 ('ide',5,'68','to Anchises on Ida'),
],
}
ents={r['id'] for r in csv.DictReader(open(R+'/data/entities.csv'))}
lines={(r['hymn'],r['line']) for r in csv.DictReader(open(R+'/data/text/greek.tsv'),delimiter='\t')}
places={r['id']:r for r in csv.DictReader(open(R+'/data/places.csv'))}
out=[]
for rt,stops in routes.items():
    for i,(e,h,l,n) in enumerate(stops,1):
        assert e in ents, e; assert (str(h),l) in lines,(h,l)
        out.append(dict(route=rt,seq=i,entity=e,hymn=h,line=l,note=n))
        if e not in places or not places[e]['lat']: print('unplaced stop:',rt,e,places.get(e,{}).get('precision'))
with open(R+'/data/routes.csv','w',newline='') as f:
    w=csv.DictWriter(f,fieldnames='route,seq,entity,hymn,line,note'.split(',')); w.writeheader(); w.writerows(out)
print(len(out),collections.Counter(o['route'] for o in out))
