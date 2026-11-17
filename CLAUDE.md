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
- **Git.** Commits und Pushes nur auf Rudis ausdrückliche Anweisung.

## Befehle (PowerShell, aus dem Projektordner)

| Zweck | Aufruf |
|---|---|
| Unit-Tests | `powershell -File tools\test.ps1` |
| Lokales Backend | `powershell -File tools\dev-backend.ps1 start` (auch `stop`, `status`, `sync`, `build`, `reset`) |
| Ablauf gegen das Backend | `powershell -File tools\smoke.ps1` (höchstens einmal pro Minute) |
| Bildschirmfotos | `powershell -File tools\screenshots.ps1` → `build\screenshots\` |
| Android-Debug-APK | `powershell -File tools\android-debug.ps1` (`-Live` für den echten Server) |
| Spiel starten | `F:\Tools\Godot\godot.exe --path .` |

Serveradresse: aus dem Editor-Binary das lokale Backend (`http://127.0.0.1:18080`), exportiert
`https://trade-empire.net`; Preset „Android Local" nimmt `http://10.0.2.2:18080`. Überschreiben:
`godot --path . -- --server=https://trade-empire.net`.

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
- `ready` und `resync` des Ereigniskanals tragen keine Spielzeit; die Uhr wird danach per
  `/v2/health` gesetzt und läuft nur, solange der Kanal steht.
- Lokales Backend: `stop` ist ein harter Abbruch, `build` geht nur bei gestoppter Instanz, und
  unter `F:\Trade Empire\Backend-V2` wird nie etwas geschrieben.
- Das Backend erlaubt zehn Anmeldungen/Registrierungen pro Minute und Adresse.
- PowerShell 5.1 schreibt mit `Set-Content -Encoding utf8` eine BOM; Godot-Konfigurationsdateien
  vertragen sie nicht.
- Emulator: Solange eine Hardware-Tastatur aktiv ist (Standard im AVD), öffnet Godot keine
  Bildschirmtastatur — das Verhalten bei offener Tastatur lässt sich dort nicht prüfen.
- Emulator: Der Speicher des AVD `Pixel_7a` ist knapp. Scheitert `adb install` mit
  `INSUFFICIENT_STORAGE`, zuerst die jeweils andere eigene Variante (`com.tradeempire.v2.local`
  bzw. `.debug`) deinstallieren. Bedient wird die App im Emulator über `adb shell input tap/text`,
  geprüft über `adb shell screencap`.
