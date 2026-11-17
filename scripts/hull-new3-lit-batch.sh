#!/usr/bin/env bash
# Lit-Fassungen fuer die drei Runde-3-Huellen (Varianten 0..3, also 12 Dateien).
# Quelle v0: assets/hulls/<t>/<t>_0.png (abgenommene Basis, unantastbar)
# Quelle v1..3: assets/style-test/hull-variants/<t>_<n>.png
# Ziel: assets/lit-batch/<t>_<n>_lit.png|.webp  (KEIN src-Write hier)
set -u
cd "$(dirname "$0")/.."

SUF_composite='the deep navy blue lacquered armor plates, the matt anthracite carbon fibre corner posts and edge frame rails, the wide yellow and black diagonal hazard chevron bands on the corner posts and top rails, the doors, the vent grilles and the flat top hatch all stay exactly identical in the same colors, the warm lights appear only at the existing doors and as tiny status indicators on the existing small wall panels, no new windows, no new openings'
SUF_glass_carbon='the existing bright cyan glowing light strips along the edge rails, corner posts and door frames stay switched on and keep glowing in the exact same bright cyan color exactly as before, the dark tinted glass panes stay solid and opaque and completely identical, the matt anthracite carbon fibre chassis, the heavy corner posts, the bolted frame rails and the flat top slab with its central hatch all stay exactly identical, the warm lights appear only as tiny warm amber status indicators on the existing frame fittings and service panels, no new windows, no new openings'
SUF_composite_platform_space='the deep navy blue lacquered deck plating, the matt anthracite carbon fibre railings running all around the deck, the wide yellow and black chevron hazard bands on the machinery base and the bolted base skirt all stay exactly identical in the same colors, the open deck surface stays completely empty and clear, nothing is placed on the deck, the warm lights appear only as small warm running lights on the existing railing posts and as tiny status indicators on the existing machinery base panels, no new structures, no new openings'

for t in composite glass_carbon composite_platform_space; do
  eval "suf=\$SUF_$t"
  for n in 0 1 2 3; do
    if [ "$n" = "0" ]; then src="assets/hulls/$t/${t}_0.png"; else src="assets/style-test/hull-variants/${t}_${n}.png"; fi
    echo "=== $t v$n  <- $src"
    node scripts/generate-lit-variant.cjs \
      --input "$src" \
      --output "assets/lit-batch/${t}_${n}_lit.png" \
      --type hull --bg '#ffffff' \
      --prompt-suffix "$suf" \
      --compare-html "${t}_${n}_compare.html" \
      --report-json "${t}_${n}_lit-report.json" \
      --reuse-check
    echo "--- exit $?"
  done
done
echo "BATCH DONE"
