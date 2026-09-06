#!/bin/sh
set -eu

# Die Pruefung verbindet sich nicht mit einer Datenbank und schreibt keine Daten.
node deploy/validate-free-demo.mjs
exec sh deploy/render-start.sh
