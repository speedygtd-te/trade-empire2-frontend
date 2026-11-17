# Biom-Zwillinge — Befund, Prüfung, und warum nichts angefasst wird

Stand 2026-09-05. Alle Zahlen an den ausgelieferten `.webp` gemessen.
Kontaktbogen: `assets/style-test/tiles/_zwillinge_sheet.html`.

> **Dies ist kein Arbeitsplan.** Es war einer, bis die Prüfung ihn widerlegt
> hat. Was bleibt, ist ein Befundbericht mit einer Entscheidung — damit die
> Messung nicht verlorengeht und niemand sie in sechs Monaten neu aufrollt.

---

## 1. Die Entscheidung

**Rudi, 2026-09-05:**

> „das sollte aber dann logisch nach planetentypen getrennt werden. deep ocean
> und ice shelf kommen nicht auf dem gleichen planeten vor, deep_stone und
> dust_plain vlt schon aber auf unterschiedlichen z-levels genauso dust plain
> und rock layer. deep stone und ice cavern sehen komplett unterschiedlich aus.
> eins hell-blau, eins grau-grün-dunkel. keines davon sehe ich als echtes
> problem. **ich würde alle so lassen**"

und, zur Herkunft:

> „ne, deep stone und ice cavern sind alte assets. **die wurden getrennt
> generiert**"

**Es wird kein bestehendes Biom wegen einer Zwillings-Korrelation angefasst.**
Die Entscheidung hat nach der Nachprüfung **zwei unabhängige Gründe**, und
beide sind unten durchgerechnet:

1. **Gleicher Körper ist nicht gleiche Ebene.** Von den 13 Paaren, die der
   erste Bericht als folgenreich auswies, können nur 7 überhaupt
   nebeneinanderliegen (§ 3).
2. **hpNCC misst die Quelle, nicht die Wirkung.** Von den 7 sind 5 in Pegel und
   Farbe so weit auseinander, dass die geteilte Struktur im Bild nicht
   wiederzuerkennen ist (§ 4).

Und der Befund selbst ist schwächer, als er aussah: **hpNCC kann eine geteilte
Quelle nicht beweisen** (§ 5), und die daraus abgeleitete Chargen-These hält der
Prüfung nicht stand (§ 6).

---

## 2. Was gemessen wurde, und was davon Bestand hat

220 Kacheln, 24 090 Kachelpaare, max|NCC| über die vier Orientierungen.
Zwei Zahlen:

| | misst | Bestand |
|---|---|---|
| **NCC** | rohe Korrelation | zählt geteilte **Beleuchtung** mit. `ocean` × `ice_shelf` erreicht 0.997, weil beide fast nur aus Rautenabschattung und Lichtrampe bestehen. 767 von 1485 Paaren über 0.15 — praktisch alles Rauschen |
| **hpNCC** | dasselbe nach Abzug des Helligkeitsfeldes (Hochpass r6 auf 256×128) | 31 Paare über 0.15. **Als Filter brauchbar, als Beweis nicht** — siehe § 5 |

Die Trennung der beiden Zahlen bleibt richtig und nützlich: sie hat 736
Scheintreffer entfernt. Was **nicht** trägt, ist der Schluss von einem hohen
hpNCC auf eine geteilte Aufnahme.

Gegen `D.nccAll` in voller Auflösung kalibriert, größte Abweichung 0.063.
Alle Werte in den Tabellen unten sind volle Auflösung.

---

## 3. Erste Korrektur: gleiche z-Ebene, nicht gleicher Körper

Der erste Bericht zählte alles als folgenreich, was auf einem gemeinsamen
Körper vorkommen kann — Oberfläche und Untergrund eingeschlossen. **Das ist zu
streng.** Nebeneinanderliegen kann nur, was auf **derselben Ebene** auftritt;
für alles andere wechselt man die Ebene, und dann sieht man immer nur eines von
beiden.

Bei den Untergrundbiomen entscheidet nicht die Familie, sondern das
**Tiefenband** aus `Docs/planet-biomes-by-type.md`:

| Biom | Tiefenband |
|---|---|
| `rock_layer` | Standard Tiefe 1–3 · vulkanisch 1–2 |
| `cave_floor` | Standard Tiefe 1–3 (moisture > 0.6) |
| `mineral_vein` | alle Familien, elevation > 0.7 |
| `deep_stone` | Standard ab Tiefe 4 · eisig ab Tiefe 6 |
| `ice_cavern` | eisig Tiefe 1–5 |
| `magma_pocket` | vulkanisch ab Tiefe 3 · **tiefer Kern (alle Typen) ab Tiefe 5** |
| `lava_flow` | Oberfläche VOLCANIC/MOON_VOLCANIC · **tiefer Kern ab Tiefe 5** |

Damit fallen **6 der 13** heraus:

| Paar | Begründung |
|---|---|
| `deep_stone` × `rock_layer` | `rock_layer` nur Tiefe 1–3, `deep_stone` erst ab 4 — die Bänder berühren sich nicht |
| `deep_stone` × `ice_cavern` | `ice_cavern` nur Tiefe 1–5, `deep_stone` (eisig) erst ab 6 |
| `dust_basin` × `rock_layer` | Oberfläche gegen Untergrund |
| `deep_stone` × `dust_basin` | Oberfläche gegen Untergrund |
| `dust_plain` × `rock_layer` | Oberfläche gegen Untergrund |
| `deep_stone` × `dust_plain` | Oberfläche gegen Untergrund |

**Bemerkenswert:** die beiden Paare mit der größten behaupteten Reichweite —
`deep_stone`/`rock_layer` („zehn Planetentypen") — fallen genau hier heraus. Die
zehn Typen waren nie zehn Begegnungen.

---

## 4. Zweite Korrektur: die geteilte Struktur ist meist unsichtbar

Für die verbliebenen 7 steht neben der Korrelation, was das Auge tatsächlich
trennt: Pegel, Farbton, und **d′ auf Spielskala** — dieselbe Zahl, mit der die
Biom-Trennung in dieser Bibliothek immer beurteilt wurde.

| Paar | NCC | p70 A / B | Δp70 | B/R A / B | ΔB/R | d′-Pegel | d′-Textur | **d′-JOINT** |
|---|---|---|---|---|---|---|---|---|
| `mountain` × `snow_peak` | 0.675 | 60.3 / 95.9 | 35.6 | 0.709 / 1.322 | 0.613 | 101.07 | 2.40 | **101.10** |
| `deep_ocean` × `shallow_water` | 0.849 | 31.5 / 80.0 | 48.5 | 2.662 / 1.827 | 0.835 | 79.13 | 14.19 | **80.40** |
| `shallow_water` × `volcanic_vent` | 0.570 | 80.0 / 44.3 | 35.8 | 1.827 / 1.985 | 0.158 | 47.85 | 3.36 | **47.97** |
| `permafrost` × `tundra` | 0.925 | 58.4 / 66.3 | 8.0 | 0.700 / 0.820 | 0.120 | 29.95 | 16.06 | **33.98** |
| `deep_ocean` × `volcanic_vent` | 0.726 | 31.5 / 44.3 | 12.8 | 2.662 / 1.985 | 0.676 | 23.17 | 4.37 | **23.58** |
| `lava_flow` × `magma_pocket` | 0.604 | 34.9 / 33.1 | 1.8 | 0.833 / 0.727 | 0.106 | 1.44 | 0.31 | **1.48** |
| `crevasse` × `glacier` | 0.811 | 91.5 / 89.8 | 1.6 | 1.100 / 1.100 | 0.000 | 0.17 | 0.19 | **0.25** |

Referenz: das engste Paar, das in der ASTEROIDS-Runde als unkritisch durchging,
lag bei d′-JOINT **8.93**. Fünf der sieben liegen mit 23.6 bis 101.1 weit
darüber — **die geteilte Struktur ist da, aber Pegel und Farbe schieben die
beiden Biome so weit auseinander, dass sie im Bild nicht als Wiederholung
lesen.** Genau Rudis Argument, in Zahlen.

Am Kontaktbogen bestätigt: bei `mountain` × `snow_peak` sieht man es trotz
101.1 noch (dieselben Steine an denselben Stellen), bei `deep_ocean` ×
`volcanic_vent` nicht mehr.

**Übrig bleiben zwei Paare**, bei denen weder die z-Regel noch der Pegel- oder
Farbabstand greift:

- **`crevasse` × `glacier`** — d′ 0.25, identisches B/R, 1.6 Punkte Pegel
  Unterschied. Beide aus der ICE-Runde vom 2026-09-04, beide von Rudi
  nebeneinander abgenommen. Wichtig: d′ misst **Pegel und Textur-sd**, nicht
  Muster — `crevasse` trennt sich über sein Kluftnetz, und das sieht d′ nicht
  (dieselbe Grenze ist in LESSONS § 5 schon notiert: „dünne Risse trennen über
  Helligkeit statt über Textur").
- **`lava_flow` × `magma_pocket`** — d′ 1.48, beide 2026-06-26, im tiefen Kern
  ab Tiefe 5 tatsächlich auf derselben Ebene.

Beide sind **abgenommenes Material, das der Mensch bereits nebeneinander
gesehen hat.** Das ist die stärkere Evidenz als jede Kennzahl, und Rudis Urteil
lautet „alle so lassen".

---

## 5. Warum hpNCC eine geteilte Quelle nicht beweisen kann

Rudis Aussage über `deep_stone` / `ice_cavern` ist ein **direkter
Gegenbeleg**: zwei unabhängig erzeugte Kacheln, gemessen bei **0.600**. Also:
beide Ankergruppen messen und die Verteilungen nebeneinanderlegen.

**Gruppe A — bekannt geteilte Quelle, ungerollt** (dokumentierte Ableitungen
plus die biominternen Spiegelpaare, bei denen Slot 2/3 nachweislich eine Kopie
von 0/1 ist):

| Anker | hpNCC | | Anker | hpNCC |
|---|---|---|---|---|
| `canyon` 1/2 | 0.990 | | `cave_floor` 0/1 | 0.910 |
| `glacier_0` × `regolith_3` (dokumentiert) | 0.985 | | `chemical_vent` 1/2 | 0.885 |
| `glacier` 0/3 | 0.983 | | `permafrost` 1/2 | 0.667 |
| `ocean` 2/3 | 0.981 | | `oasis` 0/2 | 0.645 |
| `dust_basin_0` (vor dem Fix) × sein Hero | 0.980 | | `magma_pocket` 0/2 | 0.622 |
| `snow_peak` 2/3 | 0.980 | | `basalt_plain` 0/2 | 0.519 |
| `ice_shelf` 2/3 | 0.973 | | **`acid_lake` 0/3** | **0.225** |
| `crystal_field` 2/3, `shallow_water` 1/2 | 0.969 | | **`toxic_marsh` 1/3** | **0.205** |
| `deep_ocean` 2/3 | 0.960 | | | |
| `tundra` 1/2 | 0.954 | | | |

n = 19, Spanne **0.205 – 0.990**, Median 0.960.

**Gruppe B — bekannt getrennt erzeugt:** `deep_stone_0` × `ice_cavern_0` =
**0.600** (Rudis Aussage, kein Messartefakt).

**Die Bereiche überlappen. Drei von 19 bestätigt geteilten Paaren liegen
unter dem bestätigt unabhängigen Paar.** Damit ist hpNCC als Beleg für eine
geteilte Aufnahme untauglich — ein hoher Wert ist mit ihr *vereinbar*, beweist
sie aber nicht.

**Nach unten bleibt sie zuverlässig.** Gruppe C, dieselben Ableitungen nach der
Gitterrollung:

| Ableitung | hpNCC nach der Rollung |
|---|---|
| `impact_crater` aus `crater` | 0.021 |
| `dust_basin` aus dem eigenen Slot 1 | 0.031 |
| `crater` aus `regolith` | 0.037 |
| `void_edge` aus `cave_floor` | 0.089 |

**hpNCC ist ein guter Negativtest und ein schlechter Positivtest.** Unter ~0.12
gibt es keine sichtbare Wiederholung — das ist belastbar und bleibt das
Bau-Kriterium. Über 0.5 sagt sie „ähnlich", nicht „dasselbe Foto".

---

## 6. Die Chargen-These fällt

Der erste Bericht schloss aus „Zwillinge fallen in dieselbe Charge" auf einen
gemeinsamen Fotopool je Erzeugungslauf, und daraus, dass die Rollung bei
UNDERGROUND Pflichtprogramm werde. **Beides wird zurückgezogen.**

Die Assoziation ist real, aber vollständig verwechselt mit der Motivklasse:

| | Anteil aus derselben Charge |
|---|---|
| alle 1485 Biompaare (Grundrate) | 11.1 % |
| die 31 Paare über hpNCC 0.15 | 38.7 % (Faktor 3.5) |
| die 26 Paare über hpNCC 0.40 | 46.2 % (Faktor 4.2) |

Aber: **12 von 12 der Paare aus derselben Charge teilen auch die Motivklasse** —
die Wasser-Charge vom 2026-08-23 ist ganz Wasser, die 04-19-Charge ganz Fels,
die ICE-Runde ganz Eis. Eine Charge **ist** eine Motivklasse, deshalb lässt sich
die eine Erklärung von der anderen mit diesen Daten nicht trennen.

Über alle 31 Paare: 10 Fels × Fels, 11 Wasser × Wasser, 10 gemischt — **67.7 %
teilen schon die Motivklasse.** Gebrochener Fels korreliert mit gebrochenem
Fels, ohne dass dieselbe Aufnahme darunterliegen muss. Zusammen mit dem
Gegenbeleg aus § 5 ist das die einfachere Erklärung, und ohne einen zweiten
bestätigten Anker in Gruppe B gibt es keine Möglichkeit, sie auszuschließen.

→ **Für UNDERGROUND gilt keine Sonderregel.** Die Rollung bleibt Teil des
Bauens, weil sie nichts kostet — nicht, weil dort ein Zwillingsproblem
nachgewiesen wäre.

---

## 7. Was handwerklich Bestand hat

Diese drei Befunde sind von der Rücknahme **nicht** betroffen und bleiben
gültig:

1. **Ein Skalar kann eine Korrelation nicht bewegen.** `flatten`,
   `flattenRadial`, `grade` und `chromaFlatten` multiplizieren pro Pixel mit
   einem Skalar, und der kürzt sich in der mittelwertfreien, längennormierten
   Korrelation heraus. Gemessen an `fractured_zone` × `silicate_plain`:
   Originale **0.773** → volle Compositing-Kette **0.441** → mit Gitterrollung
   **0.041**. Der Teil, der beim Compositing verschwindet, ist geteilte
   *Beleuchtung*, nicht geteilter Inhalt.
2. **Nur das Verschieben des Fensters trennt zwei Kacheln, und es kostet
   nichts.** Dieselben Pixel, anderes Fenster auf dem Torus, kein Resampling,
   keine Spiegelung, keine Änderung an Pegel, Farbe oder Aussehen. Über sieben
   gemessene Paare fiel jedes mit **einer** Rollung unter 0.07.
3. **Die rohe NCC misst geteilte Beleuchtung mit** — 767 gegen 31 Paare über
   0.15. Wer Korrelation misst, muss vorher das Helligkeitsfeld abziehen, sonst
   misst er die Rautenabschattung.

---

## 8. Die Regel für neue Arbeit

Beim **Bauen** einer Kachel bleibt die Rollung Teil des Vorgangs, und die
Korrelationsprüfung bleibt Teil der Gates — sie kostet nichts und verhindert
den Fall, den die ASTEROIDS-Runde selbst produziert hat (`dust_basin` Slot 0
mit Versatz (0,0), 0.574 gegen `rock_layer`, behoben).

```
BEIM BAUEN, weiterhin verbindlich:
□ max|NCC| gegen jedes Biom, das auf DERSELBEN z-EBENE desselben
  Planetentyps vorkommen kann. Nicht über den ganzen Körper.
□ Schwelle 0.12 (Referenz: crater ohne Rollung 0.897, mit Rollung 0.096)
□ max|NCC| zwischen den vier eigenen Slots, dieselbe Schwelle
□ bei Ableitungen aus EINER Quelle: alle sechs Paardifferenzen der
  Versätze gegen das Torusgitter prüfen -- eine Differenz auf dem Gitter
  (erzeugt von (512,0) und (256,128)) macht zwei Kacheln identisch
```

```
NICHT MEHR:
✗ Korrelation als Abnahmekriterium für BESTANDSKACHELN. Ein hoher Wert
  begründet keine Runde. Was zählt, ist ob man es SIEHT -- und das
  entscheiden Pegel, Farbe und der Blick auf das gemischte Feld,
  nicht die Korrelation.
✗ "gleicher Körper" als Nachbarschaft. Nur gleiche z-Ebene zählt.
✗ die Chargen-These als Aufwandsvorhersage für kommende Familien.
```

---

## 9. Nachtrag: der einzige echte Fehler dieser Runde, behoben

`dust_basin` Slot 0 bekam beim Bau den Versatz **(0,0)** — es war der ungerollte
Hero und lag mit 0.574 auf `rock_layer`. Das ist ein **Baufehler**, kein
Bestandsproblem: der Versatz war schlicht vergessen. Am 2026-09-05 durch
**(192,96)** ersetzt, Slots 1–3 byteidentisch gehalten (md5 geprüft), Mips neu
erzeugt. Danach `rock_layer` 0.111, `deep_stone` 0.057, Raster 3.29 → 3.04,
Naht 1.30 → 1.25.

Nachkontrolle über alle sechs Biome der ASTEROIDS-Runde, schlechteste Paarung
je Biom, volle Auflösung:

| Biom | schlechtester Nachbar | max\|NCC\| | intern |
|---|---|---|---|
| impact_crater | silicate_plain | 0.098 | 0.073 |
| metallic_surface | rock_layer | 0.094 | 0.107 |
| dust_basin | rock_layer | 0.111 | 0.097 |
| fractured_zone | cave_floor | 0.104 | 0.038 |
| void_edge | rock_layer | 0.103 | 0.099 |
| silicate_plain | impact_crater | 0.098 | 0.033 |

Alle sechs unter 0.12.
