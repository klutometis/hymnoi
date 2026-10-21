# Judgement calls for Peter

**Status, 2026-10-21: Peter accepted every default below.** They are applied in
`tools/build.py` (what is shown) and in the data (identifications). Anything
here can still be revisited; this file is the record of why each call fell
the way it did.

The extraction (`data/mentions.csv`, 1,399 mentions of 286 beings, groups and
places) records everything it found, doubtful or not; these are the calls that
decide what the graph *shows*. Each has a default, already applied in the views,
so answering only the ones you disagree with is enough: "A1 all, B7 Pheia, …".

Counts below are mentions. "Hidden" means kept in the data, off in the default
view, one toggle away.

## A. Policy: each settles many rows at once

**A1. Personifications** (146): lowercase γαῖα, ἠώς, νύξ, ὕπνος, ἥβη, μοῖρα,
οὐρανός, πόντος … where they may be the god or the thing.
*Default:* show the 15 where the god is meant (Γαῖα invoked at 3.334, Ἠέλιον
revered at 4.381, Ἠὼ χρυσόθρονον 4.326); hide the 131 that are plainly the
earth under one's feet, dawn as a time of day, sleep as sleep.

**A2. Periphrases** (152): a phrase that names without naming.
*Default:* show the 83 the workers judged certain or probable (Κρόνου
πολυώνυμος υἱός for Hades 2.18, Διὸς κοῦροι, δῖα θεάων, Ἀζαντίδα κούρην for
Koronis); hide the 69 uncertain ones, mostly bare kinship words (παῖς for
Demophoon, μήτηρ for Demeter) and ζόφος ἠερόεις "misty gloom" for Erebos (7×).

**A3. Unnamed characters.** The text names them only by description:
the old man of Onchestos (later called Battos; 8 mentions in Hymn 4), the
leader of the Cretans (3.463, 525), the wife of Leukippos (3.212; your 2009
Λευκίππη), the daughters of Keleos as a group, the blind man of Chios (3.172),
the Pythian serpent (only ever δράκαινα, never "Python"), the three sisters
under Parnassus (4.552, the commentators' Thriai), the Ἥρη of 34.2.
*Default:* show them, labelled in English italics ("the old man of Onchestos"),
since they act in the stories. They are hidden today only because the workers
marked them uncertain; say yes and they appear.

**A4. Collectives that are not particular beings.** Οὐρανίωνες "the heavenly
ones" (2.408), μαινάς in a simile (2.386), the Okeanides as a group (beside the
twenty named ones). *Default:* hide.

**A5. Epithets beside a name.** ἑκατηβόλος Ἀπόλλων, ἀργυρότοξος, διάκτορος
Ἀργειφόντης. The workers drew this line differently, but it no longer matters
for the graph, which merges every form into its being; it only matters for the
"name forms" layer. *Default:* show an epithet as a form when it also stands
alone somewhere in the Hymns (ἑκηβόλος, ἀργυρότοξος, διάκτορος), not when it is
only ever decorative (γλαυκῶπις, βοῶπις, νεφεληγερέτα).

**A6. Kinds.** god · nymph (nymphs, Oceanids, Nereids, Styx, Telphousa) ·
hero (Herakles, Asklepios, the Dioskouroi, and the deified: Semele, Tithonos,
Ganymede) · mortal · group (peoples, Muses, Charites, Horai, Nymphs) ·
creature (Typhaon, the drakaina, the Chimaira) · place, with a finer subkind
(olympian, titan, oceanid, river, mountain, island, city, …). *Default:* these
seven, coloured; rivers are places (subkind river) even where they father
nymphs, except Okeanos, who is a god.

**A7. The three 2009 names not in this text**: Ἀμάρυνθος, Κυδνή, Ἀτλαντίς
(all under Apollo in 2009). Your book printed a different Greek text (see C1),
and these probably come from its index. *Default:* keep them in
`data/legacy/audit.csv` as "absent" and off the graph until we can cite a
line; a photo of those index entries would settle it.

## B. Identifications, one row or a few each

| # | Where | Reading | Default |
|---|---|---|---|
| B1 | 3.369 Ὑπερίων | the Sun himself (ἠλέκτωρ Ὑπερίων, with Ἠελίοιο 371, 374), or the Titan, his father | Helios |
| B2 | 3.209 Ἀζαντίδα κούρην | Koronis, unnamed; plus a row for Azan, implied only by the adjective | Koronis yes, Azan hidden |
| B3 | 3.16 Ὀρτυγίη | Artemis' birthplace: its own island, Rheneia, a grove near Ephesus, or Delos | its own node, place unknown |
| B4 | 3.32, 22.3 Αἰγαί | which Aigai: Euboia, Achaea | one node, Euboia |
| B5 | 22.3 Ἑλικῶνα | Mount Helikon as printed, or Helike in Achaea (Poseidon Helikonios) | Helikon, noted |
| B6 | 3.217 Λέκτον | the only Lekton is in the Troad, off Apollo's route; possibly corrupt | keep, noted |
| B7 | 3.427 Φεράς | Odyssey 15.297 reads Φεάς here: Pheia in Elis | Pheia (Pherai as printed) |
| B8 | 3.425 Δύμη | out of order in the voyage | keep |
| B9 | 3.42 Μερόπων | the Meropes of Kos, or the formula μέροπες ἄνθρωποι | the Meropes |
| B10 | 3.367 Τυφωεύς | the same monster as Typhaon (3.306, 352) | same |
| B11 | 4.572 Ἀΐδην | the god (ὅς … δώσει γέρας makes him a person), or the place | the god |
| B12 | 2.414 Κρονίδεω | Zeus (beside "my father"), or Hades, also a son of Kronos | Zeus |
| B13 | 4.216 Πύλος | which Pylos: by the Alpheios (Triphylian), or Nestor's | Triphylian, one node |
| B14 | 1.9 Αἰγύπτοιο ῥοάων | the Nile (masculine Αἴγυπτος, as in Homer), or the country | the Nile |
| B15 | 10.4 Σαλαμῖνος | Salamis on Cyprus (paired with Κύπρου) | Cyprus |
| B16 | 34.2 νύμφης ἐρατώπιδος Ἥρης | a nymph, eponym of the city (the *Life* reads Κύμην ἐριώπιδα κούρην), or the goddess, with νύμφη "bride" | nymph |
| B17 | 4.141 Σελήνης | moonlight, though capitalized | the goddess, doubtful |
| B18 | 6.3 Ζεφύρου, 8.17 Κῆρας | the god and the death-spirits, or wind and violent deaths | gods |
| B19 | 3.500, 517 ἰηπαιήων; 3.518 παιήονες | the paean (the song), not Apollo | hidden |
| B20 | Hymn 4 | Apollo's insults as names of Hermes: σπαργανιῶτα, βουφόνε, μηχανιῶτα, φηλῆτα, πολύτροπε | hidden; δολομῆτα, ποικιλομῆτα shown |
| B21 | 4.100 | Pallas son of Megamedes, Selene's father, only here; not the Titan Pallas | his own node |
| B22 | 2.259, 2.423, 3.85, 4.519 Στύξ | one being (oath-river and Oceanid, as in Hesiod), or two | one |
| B23 | 2.418–423 | Persephone's twenty companions, all Oceanids (2.5), though five are not in Hesiod's list (Leukippe, Phaino, Melite, Iache, Rhodope) | all Oceanids |
| B24 | 2.122 Δωσώ | Demeter's false name, a form of Demeter; the manuscript reads Δώς, as your 2009 graph does | a form of Demeter |
| B25 | 3.172 τυφλὸς ἀνήρ | the singer of Chios: Homer (so Thucydides 3.104), or unnamed | shown as "the blind man of Chios", linked to Homer in the note |
| B26 | the serpent | name her δράκαινα on the site, or the conventional Python | δράκαινα, with "(Python)" in English |
| B27 | 3.223 ὄρος ζάθεον; 3.300 κρήνη | Messapion; Kastalia: both guesses for unnamed places | hidden |
| B28 | 2.17 Νύσιον πεδίον | the same Nysa as Hymns 1 and 26, or another | same node, noted |
| B29 | 2.105 Ἐλευσινίδαο | Keleos "son of Eleusis", or just "the Eleusinian" | Keleos |
| B30 | 3.211–213 | Phorbas Τριοπέῳ γένος, Triops = Triopas, Ereutheus: an obscure, perhaps corrupt passage | as read |
| B31 | 2.476–477 | a doublet of 474–475 (Triptolemos, Diokles again, plus Polyxeinos) | kept, noted |
| B32 | 2009 Ὀλύμπιος | an epithet of Zeus, or Olympian as an adjective of place | Zeus |

## C. Not decisions, but you should know

**C1. Your 2009 book.** Its Greek is neither of the public-domain texts we
have: you have Δώς (the manuscript reading at 2.122, where Evelyn-White prints
Hermann's Δωσώ), Εἰρεσίαι (Πειρεσιαί here), Αἰνιῆνες (Ἐνιῆνες), Ῥέη (Ῥείη).
M. L. West's Loeb (2003) is the likely candidate: a Loeb, with an index of names
in the back. If you have it, the index entries for Ἄτλας, Κυλλήνη and Φοῖβος
would show whether the Roman-numeral slips were yours or the index's.

**C2. Fixed in the text** (each noted in `data/text/greek.tsv`): 29.11 had lost
Ἑστίῃ (Perseus repeats εἰδότες from 29.12; Allen's page restored it);
editors' notes run into the verse at six lines; doubled words at 13.1, 18.4;
breathings and accents at 2.187, 2.376, 3.388, 3.395, 4.158, 4.366, 4.497.

**C3. Still open in the text:** bracketed lines (editors' supplements) at
2.137a, 2.236a, 2.403a, 3.81a, 3.317a, 3.325a, 3.402a, 4.91a, 4.409a–b,
4.526a, 4.568a–b, 18.12, 31.15a, to be shown bracketed in the reader;
an unmarked gap after 2.211; translator's footnotes run into the English at
2.415, 4.35, 4.85, 4.125, 4.190, 7.5, and a gap at 7.55.
