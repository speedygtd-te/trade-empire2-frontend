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
| Alle Module in eine Kolonie setzen (eigenes Showcase-Konto) | `node tools/showcase.cjs` (`--dry-run` zeigt nur den Plan; braucht den Test-Grant; einmal je frischem Konto) |
| Showcase-Kolonie ansehen | `godot --path . --resolution 720x1280 res://smoke/showcase_view.tscn -- --out=build/showcase` |
| Entwicklerkonto, echte Antworten ansehen | `node tools/dev-account.cjs /v2/structures` (Zugang in `.local/`, nie committen) |
| Lokales Backend (nur Ausnahme) | `powershell -File tools\dev-backend.ps1 start` (auch `stop`, `status`, `sync`, `build`, `reset`) |
| Bildschirmfotos | `powershell -File tools\screenshots.ps1` → `build\screenshots\` |
| Android-Debug-APK | `powershell -File tools\android-debug.ps1` (`-Live` für den echten Server) |
| Spiel starten | `F:\Tools\Godot\godot.exe --path .` |
| 3D-Modelle bauen (Blender ohne Fenster) | `powershell -File tools\build-models.ps1` → `game\world\models\` (`-Only pump`; `-Only families -Types academy,rtg`) |
| 3D-Modelle aus Spielsicht ansehen | `powershell -File tools\preview-models.ps1 <ordner> build\model-preview -NoFit` (Übersicht: `all_45.png`) |
| Bodenfarben aus den V1-Kacheln | `godot --headless -s tools/biome_colors.gd` → `game/world/biome_colors.gd` |
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
