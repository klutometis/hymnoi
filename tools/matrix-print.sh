#!/bin/sh
# Print the matrix view (site/matrix.html) as 24 × 38.83 in posters, with PNG previews.
#   tools/matrix-print.sh [base-url]      # writes site/poster/matrix-24x38.8*.{pdf,png}      # default http://127.0.0.1:8765/
# Needs the site served (python3 -m http.server 8765 --bind 127.0.0.1 --directory site),
# google-chrome and pdftoppm. The page lays itself out for the poster on `beforeprint`.
set -eu
base=${1:-http://127.0.0.1:8765/}
dir=$(cd "$(dirname "$0")/../site/poster" && pwd)
print() {  # print <hash> <name>
  google-chrome --headless=new --no-pdf-header-footer --virtual-time-budget=15000 \
    --print-to-pdf="$dir/$2.pdf" "${base}matrix.html#$1" 2>/dev/null
  pdfinfo "$dir/$2.pdf" | grep -E '^(Pages|Page size)'
  pdftoppm -r 40 -png -singlefile "$dir/$2.pdf" "$dir/$2"
}
print "" matrix-24x38.8                    # equal columns, a disc per (name, hymn)
print "widths=lines" matrix-24x38.8-lines  # columns by length, a tick per line
