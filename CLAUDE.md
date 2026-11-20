# Trade Empire Client V2 — Arbeitsregeln

Godot-Client für das Backend V2 (Daemon `ted`). Ein Remake, kein Port: V1 liegt unter
`F:\Trade Empire\Frontend` und ist **nur Lesequelle** (Inspiration für Spiellogik) — dort nichts
ändern. Bei Lücken fragen statt erfinden. Diese Regeln sind bewusst schlank; sie werden
verschärft, wenn es nötig wird.

## Was das ist

- Godot 4.7.2, GDScript, Compatibility-Renderer, Hochformat, Canvas 720×1280.
- Ziel: Android und iOS. Entwickelt und geprüft wird zuerst unter Windows.
- **Vertrag:** `F:\Trade Empire\Backend-V2\openapi.yaml` ist die einzige Quelle — keine Kopie
  in diesem Repo. Vor API-Arbeit `info.version` lesen. Hintergrund: `Backend-V2\docs\PLAN.md`.
- Der Client baut nur, was der Vertrag hergibt, und wächst mit den Ausbaustufen des Backends.

## Harte Regeln

- **Der Server entscheidet.** Spielregeln werden im Client höchstens für Vorschau und Anzeige
  nachgebildet, nie als zweite Wahrheit.
- **Typisiert.** Untypisierte Deklarationen und unsichere Aufrufe sind Fehler (Projekt-Setting).
- **Zahlen an der Vertragsgrenze.** Godot liest jede JSON-Zahl als `float`; Ganzzahlen immer
  über `Wire.as_int` holen (exakt bis 2^53). Requests aus echten `int` bauen — ein `float` wird
  als `5.0` geschrieben und abgelehnt. `playerId` ist ein String und bleibt einer.
- **Session.** Gespeichert wird nur das opake Token, nie E-Mail oder Passwort. Verworfen wird es
  nur bei `UNAUTHENTICATED` oder beim Abmelden — nie, weil der Server nicht erreichbar ist.
- **Texte.** Alle sichtbaren Texte Englisch über `i18n/strings.csv`. Keine rohen Fehlercodes,
  Enums oder IDs als Text: Fehler laufen über `ErrorText`. Ein Test prüft, dass jeder im Code
  benutzte Schlüssel existiert.
- **Bedienung.** Wenige Formulare. Tippziele mindestens 88 px im Canvas (= 44 dp). Destruktive
  Aktionen zweistufig. Jede datengetriebene Ansicht hat Lade-, Leer- und Fehlerzustand. Zurück
  schließt die oberste Ebene, nie die App.
- **Navigation.** Nach dem Login `MainShell`: Bottom-Nav Base · Map · Fleet · Profile, jeder Tab
  ein `ScreenStack` (Wurzel + Ebenen). Ebenen haben `closed` und `handle_back() -> bool` und
  einen `LayerHeader` („‹ Back“); neue Ebenen über `ScreenStack.push_onto`, nie als eigene
  Overlays. In einer Struktur ersetzt die Struktur-Nav (Inspect · Build · Inventory) die
  Bottom-Nav; Vollbilder wie `StructureDetails` liegen über allem (`covers_nav`). Reisen und
  Routen leben im Fleet-Tab. Karten über Objekten der 3D-Welt: `WorldCard`.
- **Ein Aussehen.** Controls kommen aus der Fabrik `Ui`, Farben und Größen aus `AppTheme`.
  Farbe trägt Bedeutung: cyan Aktion/aktiv, rot Gefahr/Fehler, amber vorläufig, emerald in Ordnung.
- **Schichten.** `core/` reine Logik ohne Szenenbaum, jede öffentliche Funktion mit Test.
  `net/` spricht HTTP. `game/` enthält Szenen und UI; nur dort wird der Autoload `Services` benutzt.
- **V1-Material.** `assets/`, `src/assets/`, `scripts/`, `Docs/` sind Asset-Bestand und
  -Pipeline aus V1 und tragen `.gdignore`: Godot sieht sie nicht. Sprites werden bewusst in
  einen eigenen Ordner unter `game/` übernommen, nie von dort geladen.
- **Git.** Nach jeder größeren, geprüften Umsetzung committen und auf `main` pushen (Rudi,
  2026-11-18). Nie `.local/`, `scripts/.env` oder `build/` mitnehmen; nichts Rotes committen.

## Befehle (PowerShell, aus dem Projektordner)

| Zweck | Aufruf |
|---|---|
| Unit-Tests | `powershell -File tools\test.ps1` |
| Ablauf gegen das Backend | `powershell -File tools\smoke.ps1` (Live-Server, höchstens einmal pro Minute) |
| Nur Spieldaten prüfen (ohne Konto) | `powershell -File tools\smoke.ps1 -DefinitionsOnly` |
| Bauen gegen das Backend (Entwicklerkonto) | `powershell -File tools\colony-smoke.ps1` (setzt Hülle, Modul, Rezept und räumt wieder auf) |
| Docks und Gäste gegen das Backend | `powershell -File tools\colony-smoke.ps1 -Scene dock_build` (gründet, erweitert, räumt auf) |
| Enterprises, Rollen, Steuern, Diplomatie gegen das Backend | `powershell -File tools\colony-smoke.ps1 -Scene enterprise_flow` (zwei eigene Konten `.local/enterprise-a-`/`-b-account.json`; löst am Ende beide Enterprises auf) |
| Enterprise-Bildschirme ansehen (live, dieselben zwei Konten) | `godot --path . --resolution 720x1280 res://smoke/enterprise_view.tscn -- --out=build/enterprise` |
| Ebenen und Schächte gegen das Backend (eigenes Konto `levels`) | `powershell -File tools\colony-smoke.ps1 -Scene level_build` (Stockwerke, Keller, Überhang, Treppe, räumt auf) |
| Ebenen ansehen (Wähler, Schnitt-Ansicht, Schacht, Stockwerke von außen) | `godot --path . --resolution 720x1280 res://smoke/level_view.tscn -- --out=build/levels` (Konto `levels`; baut auf und räumt ab) |
| Routen und Lagermodi gegen das Backend (eigenes Konto `routes`) | `powershell -File tools\colony-smoke.ps1 -Scene route_flow -TimeoutSeconds 900` (baut einmal Transporter + Station und lässt sie stehen; Route anlegen, Lieferung, Pause, Löschen; dauert Minuten) |
| Routen-, Fracht- und Editor-Ansichten ansehen | `godot --path . --resolution 720x1280 res://smoke/route_view.tscn -- --out=build/routes` (Konto `routes`, nach `route_flow`) |
| Fahrten gegen das Backend (eigenes Konto `travel`) | `powershell -File tools\colony-smoke.ps1 -Scene travel_flow` (baut Fahrzeug und Schiff, falls sie fehlen; Orbit + Andocken, Fahrt mit Wegpunkt + Andocken; dauert ~10 min) |
| Fahrt-Bildschirme ansehen (Konto `travel`, startet nichts) | `godot --path . --resolution 720x1280 res://smoke/travel_view.tscn -- --out=build/travel` |
| Flotten gegen das Backend (eigenes Konto `fleets`) | `powershell -File tools\colony-smoke.ps1 -Scene fleet_flow` (baut zwei Schiffe, falls sie fehlen — Treibstoff nur im ersten; Flotte bilden, Sperre, Haltung, gemeinsamer Vorrat, Flug in den Orbit, Austritt, Auflösen, beide docken wieder an; dauert ~15 min) |
| Flotten-Bildschirme ansehen (Konto `fleets`, startet nichts) | `godot --path . --resolution 720x1280 res://smoke/fleet_view.tscn -- --out=build/fleets` (während des Flugs von `fleet_flow` zeigt es den Flug; sonst bildet es eine Bilder-Flotte und löst sie wieder auf) |
| Alle Module in eine Kolonie setzen (eigenes Showcase-Konto) | `node tools/showcase.cjs` (`--dry-run` zeigt nur den Plan; braucht den Test-Grant; einmal je frischem Konto) |
| Showcase-Kolonie ansehen | `godot --path . --resolution 720x1280 res://smoke/showcase_view.tscn -- --out=build/showcase` |
| Normale gegen HD-Modelle vergleichen (Showcase-Konto; Bilder nah/mittel/fern, Frame-, CPU-/GPU-Zeit, Draw Calls, Primitive, Texturspeicher) | `godot --path . --resolution 720x1280 res://smoke/showcase_view.tscn -- --out=build/showcase-detail --detail-compare` |
| Masten, Radar und Lichtkegel um die Basis ansehen | `godot --path . --resolution 720x1280 res://smoke/perimeter_view.tscn -- --out=build/perimeter` (Modelle: `tools\build-models.ps1 -Only perimeter`) |
| Bewegte Modulteile ansehen (Rotoren, Lüfter, Schüsseln, Solarpanels; Showcase-Konto) | `godot --path . --resolution 720x1280 res://smoke/motion_view.tscn -- --out=build/motion` (Bildfolgen je Typ, Kosten je Frame) |
| Gelände um wachsende Basen ansehen (Rodung, Zaun, Beton, Mauer; nur im Client vergrößert) | `godot --path . --resolution 720x1280 res://smoke/grounds_view.tscn -- --out=build/grounds` (Schwellen in `core/base_grounds.gd`; Modelle: `tools\build-models.ps1 -Only grounds`; Beton: `python -I tools/paving_texture.py`) |
| Relief ansehen (Hügel, Struktur am Hang mit Fundament und Einschnitt, Stützwänden ab 0,75 Zelle, Nähte, Treffer, Kosten flach/Relief und mit/ohne Stützwände) | `godot --path . --resolution 720x1280 res://smoke/relief_view.tscn -- --out=build/relief` (Entwicklerkonto; Strukturen am Hang nur im Client; Maßstab, Rand und Stützwand-Schwelle in `core/terrain_relief.gd`; Modelle: `tools\build-models.ps1 -Only retaining`) |
| Basis bei Nacht ansehen (Lampen, Lichtschein, Kosten) | `godot --path . --resolution 720x1280 res://smoke/night_view.tscn -- --out=build/night [--account=showcase]` (Modelle nachts: `smoke/model_preview.tscn` mit `--night`) |
| Entwicklerkonto, echte Antworten ansehen | `node tools/dev-account.cjs /v2/structures` (Zugang in `.local/`, nie committen) |
| Lokales Backend (nur Ausnahme) | `powershell -File tools\dev-backend.ps1 start` (auch `stop`, `status`, `sync`, `build`, `reset`) |
| Bildschirmfotos | `powershell -File tools\screenshots.ps1` → `build\screenshots\` |
| Android-Debug-APK | `powershell -File tools\android-debug.ps1` (`-Live` für den echten Server) |
| Android-Release-APK zum Testen (Live-Server, eigener Schlüssel in `.local/`) | `powershell -File tools\android-release.ps1` → `build\android\trade-empire.apk` (Schlüssel aufheben: Updates brauchen denselben) |
| Spiel starten | `F:\Tools\Godot\godot.exe --path .` |
| 3D-Modelle bauen (Blender ohne Fenster) | `powershell -File tools\build-models.ps1` → `game\world\models\` (`-Only pump`; `-Only families -Types academy,rtg`) |
| HD-Modelle bauen (nur Module und Hüllen, oberste Detailstufe) | `powershell -File tools\build-models.ps1 -Detail hd` → `game\world\models_hd\` (gleiche Dateinamen, `-Only`/`-Types` wie oben; stellt danach per Godot-Import die Texturen auf verlustbehaftet) |
| HD-Paket bauen und hochladen (Asset-Host, AWS-Profil `trade-empire-assets`) | `powershell -File tools\hd-bundle.ps1` (`-DryRun` baut nur nach `build\hd\`; zeigt URL, Größe, SHA-256; frischt die Modell-Liste im Preset „HD Bundle“ auf) |
| HD-Paket prüfen (Download, Prüfsumme, Einbinden; ohne Konto) | `godot --path . --headless res://smoke/hd_package_check.tscn [-- --hd-manifest=<url>]` (im Projektordner sind die Modelle eingebaut; echten Download sehen: `game/world/models_hd` vorübergehend aus dem Projekt nehmen, ohne Import dazwischen, frisches APPDATA unter `build\`) |
| Ressourcen-Modelle bauen (eins je Ressource, Quelle der Icons) | `powershell -File tools\build-models.ps1 -Only resources [-Types iron,robot_t3]` → `game\world\models\resources\` (trägt `.gdignore`: nicht importiert, nicht im APK; für eine spätere 3D-Detailansicht entfernen) |
| Ressourcen-Icons rendern (+ Kontaktbogen) | `godot --path . --resolution 720x1280 res://smoke/resource_icons.tscn [-- --only=iron,water]` → `game/ui/resource_icons/<key>.png` (128 px, Import verlustbehaftet mit Mipmaps) und `build/resource_icons/sheet_44.png`, `sheet_128.png`; Nachschlagen im Spiel: `ResourceIcon`, Zeilen über `Ui.resource_icon` / `Ui.add_resource_icon` |
| Modul- und Hüllen-Icons rendern (Lager, Bau-Palette) | `godot --path . --resolution 720x1280 res://smoke/resource_icons.tscn -- --items [--only=pump_module,hull_dock]` → `game/ui/item_icons/<item>.png` aus dem Modell, das die Kolonie zeigt (Zuordnung Item → Modul/Hülle aus `/v2/definitions`, noch nicht ausgelieferte in `COMING_ITEMS`), Kontaktbogen `build/item_icons/`; schreibt die `.import` gleich mit; neues Modul: Modell bauen, Befehl laufen lassen, Schlüssel in `tests/game/test_item_icons.gd` |
| Requisiten (Bäume, Steine …) ansehen und messen | `F:\Tools\Godot\godot.exe --path . --resolution 720x1280 res://smoke/prop_view.tscn -- --out=build/props` (Entwicklerkonto; Modelle: `build-models.ps1 -Only props`) |
| 3D-Modelle aus Spielsicht ansehen | `powershell -File tools\preview-models.ps1 <ordner> build\model-preview -NoFit` (Übersicht: `all_45.png`) |
| Bodenfarben aus den V1-Kacheln | `godot --headless -s tools/biome_colors.gd` → `game/world/biome_colors.gd` |
| Biom-Kacheln neu erzeugen (kostet fal-Guthaben, ~0,04 $ je Bild) | `node tools/regen-v1-tiles.cjs` (Prompts/Seeds in `tools/v1-tile-prompts.json`) → `assets/tiles-square/` |
| Bodentexturen (Atlas) | `python -I tools/ground_atlas.py --source assets/tiles-square` → `game/world/ground/` (ohne `--source`: aus den V1-Rauten) |
| Boden ansehen (Zoom 3/9/40, weiche/harte Ränder) | `godot --path . --resolution 720x1280 res://smoke/ground_review.tscn -- --out=build/ground` |
| Materialtextur erzeugen (kostet fal-Guthaben) | `node scripts\3d\make-texture.cjs --preset metal` → `scripts\3d\textures\` |
| 3D-Modell aus Sprite (kostet fal-Guthaben) | `node scripts\3d\sprite-to-3d.cjs --model hunyuan-lowpoly --input assets\final\mine_0.png` |
| Generiertes 3D-Modell spielfertig machen | `powershell -File tools\postprocess-models.ps1` → `assets\3d-test\processed\` |

**3D-Assets (Versuch seit 2026-11-17):** Ein Modell ist Blender-Code unter `scripts\3d\models\`
(Bausatz `kit.py`, wiederverwendbare Teile `parts.py`); sein Aussehen wird aus Palette,
wenigen Materialtexturen und einem gemeinsamen Rezept in zwei Texturen je Modell gebacken:
Farbe sowie Glanz und Metallanteil; leuchtet etwas (`GLOWS` in `kit.py`, z. B. Fenster), kommt
eine Leuchtmaske dazu, die `ColonyView` in der Dämmerung, nachts und ohne Luft hochregelt.
Industrie und Versorgung sehen alt, dunkel und dreckig aus (wie V1); Hüllen und später Wohnen
bleiben sauberer — gesteuert über `kit.Builder(wear=…)`, nie über Farben einzelner Modelle.
Böden und Grundplatten sind Sichtbeton. Glas (`kit.PANE`) wird eine eigene durchsichtige
Fläche; hinter Glas stehen nur feste Requisiten, nie Module.
Von außen ist eine Struktur geschlossen (`StructureLook`): Innenhüllen zeigen ihr Modell
`hull_<typ>_closed` aus `hulls_closed.py` (sonst `hull_standard_closed`), nur Zellen mit
Außenmodulen bleiben offen; erst Bearbeiten/Bauen öffnet sie an Ort und Stelle. Glänzende und metallische Flächen spiegeln die Umgebung —
die Szene braucht dafür einen Himmel als Spiegelquelle (Muster: `smoke/model_preview.gd`),
sonst werden sie dunkel.
Bewegte Teile baut `kit.Builder.moving("<rolle>", drehpunkt)`: Sie werden Kindknoten
`move_<rolle>[_n]` desselben Modells (gleiche Texturen) und drehen um ihre eigene Hochachse;
`core/module_motion.gd` bewegt sie nach der Rolle (rotor, fan, dish, scope, sensor, drill, rod,
panel) so schnell, wie das Modul laut Raten-Lösung arbeitet — im Bau, aus oder untätig stehen
sie still. Eine neue Rolle braucht einen Eintrag in `ModuleMotion.ROLES`, sonst schlägt der
Modelltest an.
Der Boden hat Relief (nur Anzeige, `core/terrain_relief.gd`: 1 Einheit `e` = 0,1 Zelle,
Bezug ist die Basis der Heimatstruktur): Eine Struktur steht flach auf dem Mittel ihres
Grundrisses (`ColonyView.lift_of`), höherer Boden wird abgetragen, unter tieferem steht ein
Betonfundament. Ab 0,75 Zelle Höhenunterschied (`TerrainRelief.WALL_HEIGHT`) stehen Stützwände
(Modelle `scripts\3d\models\retaining.py`, Platzierung `core/retaining_walls.gd`, MultiMeshes in
`RetainingLayer`): talseitig statt des glatten Fundaments; bergseitig wird der Ringstreifen zur
ebenen Terrasse auf Basishöhe (`TerrainRelief.levelled_base`), und eine Wand hält den natürlichen
Boden dahinter, der bis an ihre Krone reicht. Alles auf dem Boden folgt `ColonyView.ground_height`,
nie y = 0.
Module und Hüllen gibt es zusätzlich in HD (`TE_DETAIL=hd`, `kit.HD_*`: doppelte Segmente, gerundete
Kanten, 1024-px-Texturen, verlustbehaftet importiert) unter `game/world/models_hd`; `ColonyView`
zeigt sie auf der obersten Detailstufe `DetailGovernor.Tier.ULTRA` (nur starke Geräte, Schalter im
Profil), ein fehlendes HD-Modell fällt auf das normale zurück — neue Modelle in beiden Varianten bauen.
Die HD-Modelle sind nicht im APK (Rudi, 2026-11-20): `tools\hd-bundle.ps1` packt sie als Godot-Pack auf den
Asset-Host (`game/hd/<version>/models_hd.pck` + `game/hd/manifest.json`), `HdPackageService` lädt es auf
Geräten, die ULTRA dürfen, nach `user://hd`, prüft SHA-256 und bindet es ein; erst dann gibt es ULTRA.
Nach geänderten HD-Modellen: committen, `hd-bundle.ps1` laufen lassen; passt ein altes Pack nicht mehr zum
Client (Namen, Ordner), `HdBundle.FORMAT` erhöhen; nach einem Godot-Update (major.minor) ebenfalls neu bauen
(eigener Manifest-Eintrag je Godot-Version, ältere Clients behalten ihren).
Wiederkehrende Formen gehören in `parts.py`, nicht kopiert in einzelne Modelle. Stiländerungen gehören in Palette,
Texturen oder Rezept, nie in einzelne Modelle. Ein 1×1×1-Modul bleibt innerhalb von 0,9 × 0,9
am Boden und unter 1,0 in der Höhe; `build-models.ps1` meldet Verstöße. Eine Hülle füllt ihre
Zelle als 0,06 hohe Bodenplatte (`hulls.py`, `ColonyView.HULL_FLOOR_HEIGHT`), Module stehen
darauf. Modultypen ohne eigenes Skript entstehen aus Vorlagen in `families.py`; die Dateinamen
sind die Typ-Schlüssel klein (`academy.glb`).

Serveradresse: überall der Live-Server `https://trade-empire.net` (Rudis Vorgabe vom
2026-11-17: „Nutz bitte den Server für alles“). Das lokale Backend (`tools\dev-backend.ps1`,
Preset „Android Local") bleibt nur für Ausnahmen; Überschreiben mit
`godot --path . -- --server=http://127.0.0.1:18080`. Jeder Smoke-Lauf legt auf dem Server ein
Wegwerf-Konto an.

## Vor jeder Fertigmeldung

1. `tools\test.ps1` grün.
2. Netz oder Session berührt: `tools\smoke.ps1` grün.
3. Oberfläche berührt: `tools\screenshots.ps1` laufen lassen und die Bilder ansehen.

## Fallen, die schon Zeit gekostet haben

- `godot -s skript.gd` kompiliert vor dem Registrieren der Autoloads: Skripte, die Screens
  benutzen, laufen nur als Szene (Muster: `smoke/screenshots.tscn`).
- Im `_initialize` eines SceneTree-Skripts ist `root` noch nicht im Baum; erst einen Frame warten.
- `HTTPRequest` puffert die ganze Antwort. Gestreamte Antworten (Ereigniskanal, später Layout
  und Oberfläche) laufen über `HTTPClient`; Muster ist `net/event_stream.gd`.
- Die Uhr läuft nur, solange der Ereigniskanal steht, und wird mit der Spielzeit aus `ready`
  bei jedem Verbinden neu gesetzt. Ereignis-IDs sind `<rev>-<seq>` und keine Zahlen; mit der
  letzten ID als `since` setzt der Kanal lückenlos fort.
- Lokales Backend: `stop` ist ein harter Abbruch, `build` geht nur bei gestoppter Instanz, und
  unter `F:\Trade Empire\Backend-V2` wird nie etwas geschrieben.
- Das Backend erlaubt zehn Anmeldungen/Registrierungen pro Minute und Adresse.
- PowerShell 5.1 schreibt mit `Set-Content -Encoding utf8` eine BOM; Godot-Konfigurationsdateien
  vertragen sie nicht.
- 3D-Modelle: Godot 4.7 kann die JPEG-Texturen nicht lesen, die Blender 5.3 in eine GLB
  schreibt — Texturen als WebP exportieren. Ein glTF-Material ohne `metallicFactor` gilt als
  voll metallisch und wird fast schwarz dargestellt.
- Blender über MCP (Rudis laufendes Blender): dort nur bauen und anzeigen, nie exportieren
  oder backen — der glTF-Export aus dem Add-on heraus lässt Blender 5.3 abstürzen. Code erst
  ohne Fenster oder in einer eigenen Instanz prüfen.
- Godot-Prozesse anderer Sitzungen (z. B. oil-tycoon) schreiben gleichzeitig die globalen
  Editor-Einstellungen; ein einzelnes „Could not load editor settings" beim Import ist dann ein
  Lesezeitpunkt-Problem, die Datei ist heil. Fremde Godot-Prozesse nie beenden.
- Emulator: Solange eine Hardware-Tastatur aktiv ist (Standard im AVD), öffnet Godot keine
  Bildschirmtastatur — das Verhalten bei offener Tastatur lässt sich dort nicht prüfen.
- Emulator: Der Speicher des AVD `Pixel_7a` ist knapp. Scheitert `adb install` mit
  `INSUFFICIENT_STORAGE`, zuerst die jeweils andere eigene Variante (`com.tradeempire.v2.local`
  bzw. `.debug`) deinstallieren. Bedient wird die App im Emulator über `adb shell input tap/text`,
  geprüft über `adb shell screencap`.
