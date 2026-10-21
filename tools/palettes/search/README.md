# The palette search (2026-10-21)

How the candidates in `site/palettes/*.css` were found, kept for the record.
`opt.py` holds the colour maths (it imports `../colorlib.py`) and the optimisers;
`run_oi.py`, `run_pig.py`, `run_tol.py` search the fills for each base palette
(hue kept inside the base colour's or pigment's range, lightness and chroma free,
scored on CIEDE2000 under normal vision and simulated deuteranopia, protanopia and
tritanopia, and kept inside the FOGRA39 gamut); `run_text*.py` search the darker
text colours. The `out_*` and `t*_*` files are their outputs.
`tools/palettes/build.py` regenerates the swatch sheet and every number on it from the CSS files.
These scripts were written in a scratch directory and may need their paths adjusted to rerun.
