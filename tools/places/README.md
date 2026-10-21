# How data/places.csv and data/routes.csv were made (2026-10-21)

`gen.py` holds the decisions, one per place: the Pleiades id, a coordinate override
where the Pleiades point is wrong or missing, the precision, and the note citing the line.
`routes.py` holds the journeys as ordered stops. Both were run once against a pickle of the
Pleiades dumps (`pleiades-places-latest.csv.gz`, `pleiades-names-latest.csv.gz` from
https://atlantides.org/downloads/pleiades/dumps/, plus a Wikidata P1584 → Q-id table) built in
`$TMPDIR/pleiades`; `pl.py` is the lookup helper used while choosing.

From here on **data/places.csv and data/routes.csv are the files to edit by hand**; these scripts
are the record of how the first version was chosen, not a build step (they would need the
pickle rebuilt, and would overwrite hand edits).
