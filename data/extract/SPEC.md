# Extraction spec: every named being and place in the Homeric Hymns

One chunk of the Greek text per worker. The Greek is `data/text/greek.tsv`
(Evelyn-White 1914 for hymns 1–33; Allen 1912 for 34, Εἰς Ξένους); the English
paragraphs in `data/text/english.tsv` are there for context only. Read **every
line** of your span in Greek. Do not work from the English or from memory of
an index: the point of this pass is to be exhaustive against the text, and
the 2009 graph (built from a book index) missed about forty mentions.

## What counts as a mention

Record a row for every word or phrase in your span that **refers to a
particular being, group, or place**:

1. **Proper names**, capitalized or not: Ἀπόλλων, Δῆλος, Ἀλφειός. Including
   names this text prints lowercase at a hymn's start (μοῦσα 5.1, μήνην 32.1).
2. **Epithets used as names**: Ἀργειφόντης, Ἑκάεργος, Φοῖβος, Κυλλήνιος,
   Κυπρογένεια, whether or not the god's name stands beside them.
   A *descriptive* epithet attached to a name (γλαυκῶπις Ἀθήνη,
   κυανοχαίτης next to Ποσειδάων) is **not** a separate row; the same word
   standing alone for the god (κυανοχαίτης = Poseidon) **is**, as `epithet`.
3. **Patronymics and metronymics**: Κρονίδης, Κρονίων, Λητοΐδης, Τυνδαρίδαι.
4. **Proper adjectives**: Κρήσιος, Ὀλύμπιος, Πύθιος, Δήλιος. If it is a cult
   title of a god (Πύθιος Ἀπόλλων), referent = the god, type `epithet`, and say
   in `note` which place it comes from. If it describes a thing (Κρήσιοι
   ἄνδρες, Ὀλύμπια δώματα), referent = the place or people, type `adjective`.
5. **Peoples and groups**: Κρῆτες, Τυρσηνοί, Φλεγύαι, Μοῦσαι, Χάριτες, Νύμφαι,
   Ὧραι. Type `ethnic` for peoples, `name` for divine groups.
6. **Periphrases**: a phrase that names someone without naming them,
   e.g. Κρόνου πολυώνυμος υἱός (= Hades), Διὸς κούρη, Διὸς κοῦροι. Put the whole
   phrase in `form`, type `periphrasis`. Only where the phrase is the
   reference: not every "daughter of Zeus" in apposition to a name.
7. **Personifications and lowercase deities**: γαῖα, ἠώς, οὐρανός, ὕπνος,
   ἥλιος where they may be the god rather than the thing. Type
   `personification`, and judge `certainty`; say why in `note`. When it is
   plainly the thing (the earth under one's feet, dawn as a time of day),
   still record it but mark `uncertain` and explain; the human reviewer
   decides what the graph shows.

Not mentions: pronouns, unexpressed subjects, generic θεός/θεά/ἄνθρωποι, and
common nouns that are only common nouns (ἄνεμος, ποταμός).

Every capitalized word in your span must be accounted for: either a mention
row, or a row in the skipped file with a reason (typically a capital that only
marks the start of a paragraph or speech: Τὸν, Ὣς, Βῆ, Ἠ). `tools/caps.py`
lists them; `tools/check_extract.py` enforces it.

## Output

`data/extract/<chunk>.tsv`, tab-separated, UTF-8, polytonic Greek, header row:

| column | content |
|---|---|
| hymn | 1–34 |
| line | as in greek.tsv (`137a` lines included) |
| form | the word(s) exactly as printed on that line (for a phrase running over two lines, put it on the line of its head word and list only that line's words) |
| lemma | dictionary headword, nominative, polytonic, LSJ spelling (Ἀπόλλων, Κρονίδης, Πύθιος, Κρής) |
| referent | entity id: lowercase ASCII, scholarly transliteration of the standard (LSJ) name of the **entity** (not the form): `apollon`, `zeus`, `hera`, `hestia`, `athena`, `poseidon`, `dionysos`, `persephone`, `hades`, `delos`, `kyllene`, `alpheios`, `kretes` (the people), `krete` (the island). υ→y, ου→ou, χ→ch, φ→ph, θ→th, ψ→ps, ξ→x, η→e, ω→o, rough breathing → h, no accents. Disambiguate homonyms with a suffix: `hyperion_titan`, `kyllene_mountain`, `pallas_athena`. |
| referent_en | conventional English name, with a gloss when it helps (`Hyperion (Helios)`, `Mount Kyllene`) |
| kind | `god` · `nymph` (nymphs, Oceanids, Nereids) · `hero` (demigods, deified mortals: Herakles, Asklepios, the Dioskouroi) · `mortal` · `group` (peoples, and collective beings: Muses, Charites, Horai, Nymphs, Kentauroi) · `creature` (monsters and beasts with names: Typhaon, the Pythian drakaina, Kerberos) · `place` |
| subkind | free but short and consistent: olympian, titan, primordial, personification, oceanid, muse, river, spring, mountain, island, city, region, sea, sanctuary, people, … |
| mention_type | `name` · `epithet` · `patronymic` · `adjective` · `ethnic` · `periphrasis` · `personification` |
| certainty | `certain` · `probable` · `uncertain` (anything not `certain` needs a `note`) |
| note | short; required for judgement calls (which Hyperion? goddess or nymph? textual problem?) |

`data/extract/<chunk>.skipped.tsv`: header `hymn	line	word	reason`.

Use real tab characters. No quoting unless a field contains a tab (none should).

## Done means

`python3 tools/check_extract.py <chunk> "<span>"` prints 0 problems. Then
report: rows, the five hardest judgement calls, and anything in the text
itself that looks broken (apparatus run into the verse, a missing line).
