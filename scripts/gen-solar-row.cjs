/**
 * SHIM: der alte Aufrufpfad des Solarpanel-Langbildes.
 *
 * Der Generator selbst ist typunabhaengig geworden (scripts/gen-iso-row.cjs).
 * Diese Datei haelt nur noch die Solarpanel-Parameter fest, mit denen
 * `src/assets/modules/solar_panel*` entstanden ist, damit der Lauf von damals
 * reproduzierbar bleibt:
 *
 *   node scripts/gen-solar-row.cjs            # Versuch 1 (Standard-Seed)
 *   node scripts/gen-solar-row.cjs v2 771203  # weiterer Versuch mit Seed
 *
 * Fuer einen NEUEN Reihentyp nicht diese Datei kopieren, sondern
 * gen-iso-row.cjs direkt mit --name/--prompt aufrufen.
 */
const path = require('path');
const { spawnSync } = require('child_process');

// Stil wörtlich aus src/assets/modules/solar_panel/solar_panel_0.webp abgelesen:
// dunkelblaues PV-Feld mit 3x3-Zellraster und hellem Silberrahmen, schräg
// aufgeständert über einem blaugrauen, verwitterten Gerätekasten mit gelben
// Kabelkanälen und kleinen orangen Anzeigen, auf einer Stahlplattform mit
// kurzen Füßen. Gedeckte Palette, mittlerer Detailgrad, Licht von oben links.
const PROMPT = [
  'isometric 2.5D game sprite: five identical solar panel units in one straight row,',
  'the row runs from lower left to upper right at a shallow 2:1 isometric diagonal,',
  'units evenly spaced and touching, joined into ONE continuous installation',
  'sharing a single long steel deck that runs the whole length.',
  'Each unit: a tilted dark navy blue photovoltaic panel with a 3x3 grid of pale',
  'silver cell dividers and a light silver frame, raised on thin struts above a',
  'dark blue grey weathered metal equipment box with yellow cable conduits and',
  'small orange gauges; short blocky feet under the deck.',
  'Muted desaturated palette, gritty worn steel, moderate detail,',
  'The Expanse sci-fi realism, 30 degree camera, lit from upper left,',
  'isolated object, plain flat white backdrop.',
].join(' ');

const tag = process.argv[2] || 'v1';
const seed = process.argv[3] || '515101';

const r = spawnSync(
  process.execPath,
  [
    path.join(__dirname, 'gen-iso-row.cjs'),
    '--name',
    'solar_panel',
    '--tag',
    tag,
    '--seed',
    seed,
    '--prompt',
    PROMPT,
  ],
  { stdio: 'inherit' },
);
process.exit(r.status ?? 1);
