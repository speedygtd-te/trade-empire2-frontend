# Trade Empire — Client V2

Godot-Client (4.7.2, GDScript) für das Backend V2 von Trade Empire. Ziel sind Android und iOS im
Hochformat; entwickelt wird unter Windows.

## Stand

Projektfundament: Konto anlegen, anmelden, abmelden, Session über Neustarts halten,
Ereigniskanal mit Wiederverbinden, mitlaufende Spielzeit. Die Spielwelt folgt.

## Loslegen

```powershell
powershell -File tools\dev-backend.ps1 start   # lokales Backend (braucht F:\Trade Empire\Backend-V2)
powershell -File tools\test.ps1                # Unit-Tests
powershell -File tools\smoke.ps1               # Ablauf gegen das Backend
F:\Tools\Godot\godot.exe --path .              # Spiel starten
```

## Aufbau

| Ordner | Inhalt |
|---|---|
| `core/` | reine Logik: Parser, Uhr, Fehlermodell, Session-Speicher |
| `net/` | HTTP: JSON-Aufrufe und Ereigniskanal |
| `game/` | Szenen und Oberfläche |
| `i18n/` | Texte |
| `tests/` | gdUnit4-Tests |
| `smoke/` | Abläufe gegen ein laufendes Backend, Bildschirmfotos |
| `tools/` | PowerShell-Skripte für Tests, Backend, Android-Build |
| `assets/`, `src/assets/`, `scripts/`, `Docs/` | Asset-Bestand und -Pipeline aus V1, für Godot unsichtbar |

Arbeitsregeln stehen in `CLAUDE.md`.
