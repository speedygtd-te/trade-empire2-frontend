# Biom-Übergänge — Entscheidungsgrundlage

Stand 2026-09-06, **alle 55 Biome fertig**. Alle Zahlen aus
`Docs/planet-biomes-by-type.md`, dem Renderpfad (`src/views/grid/`) und den
Dateien in `src/assets/tiles/` ausgerechnet oder gemessen — nichts geschätzt.

Zwei Bögen gehören dazu:

| Bogen | erzeugt von | zeigt |
|---|---|---|
| **`assets/style-test/tiles/_uebergang_vergleich.html`** | `scripts/tiles-uebergang-vergleich.cjs`, Zahlen in `_uebergang_zahlen.txt`, Rohdaten `_uebergang_data.json` | fünf Paare in **vier Zuständen** (heute / Alpha glatt / Alpha verrauscht / **gebacken**) × drei Maßstäben, dazu 90 wirklich erzeugte Übergangskacheln und die vollständige Paartabelle |
| `assets/style-test/tiles/_transition_test_sheet.html` | `scripts/tiles-transition-alpha-test.cjs` | der Vorgängerversuch: Prämisse der Wasserkacheln, Rampenleitern, Chroma-Senke, glatt gegen verrauscht |

Nichts davon wurde nach `src/` geschrieben.

Voraussetzung: `Docs/LESSONS-asset-pipeline.md` und
`Docs/PLAN-biome-und-prop-layer.md` (§ 7 nennt die Übergangsfrage als offenen
Punkt).

> ✅ **Der Vorbehalt der ersten Fassung ist erledigt.** Der erste Versuch lief,
> während BARREN noch geschrieben wurde, und vor ASTEROIDS und UNDERGROUND.
> Am 6. September wurden die **40 Kacheln** der zehn seither überarbeiteten
> Biome (`impact_crater`, `metallic_surface`, `fractured_zone`,
> `silicate_plain`, `void_edge`, `dust_basin`, `rock_layer`, `deep_stone`,
> `mineral_vein`, `ice_cavern`) neu vermessen; die übrigen 180 sind
> byte-identisch geblieben. **Die Einordnung hat sich dadurch nicht
> verschoben** — sie hängt an der Materialfamilie. Verschoben hat sich nur die
> Zahl der harten Paare, und zwar aus einem anderen Grund (§ 1.3).

---

## 0. Das Ergebnis vorweg

| Frage | Antwort | Beleg |
|---|---|---|
| Wie viele Paare grenzen wirklich aneinander? | **131** (121 Oberfläche + 10 Untergrund) statt 1485 — davon **4 nie auf derselben z-Ebene**, also **127 wirksam** | § 1 |
| Was entscheidet weich gegen hart? | die **Materialfamilie**, nicht der optische Abstand | § 2, 11/11 gegen 7/11 |
| Wie viele bleiben hart? | **20** (+ 3 ungeklärt) von 127 | § 2.5 |
| Trägt Alpha-Blending für Wasser über Land? | **ja**, ohne gemalte Brandung | Bögen |
| Braucht die weiche Mehrheit Assets? | **nein** — eine Rauschfunktion in Weltkoordinaten | § 5 |
| Wie sieht eine gebackene Kante aus? | **jetzt zu sehen** — 90 erzeugte Kacheln, vier Grenzarten | § 5.5, Vergleichsbogen |
| Was kostet der harte Rest? | **0 Assets**, wenn die Silhouette gerechnet wird; gebacken 120 Kacheln (3,7 MB) bis 1 440 Kacheln (44,9 MB) | § 6 |
| Wann schlägt Alpha wirklich fehl? | wenn eine der Kacheln eine **Erhebung mit eingebackenem Schatten** trägt | § 2.6 |

---

## 1. Wie viele Paare wirklich aneinandergrenzen

### 1.1 Die naive Zahl

55 Biome (= 55 Ordner in `src/assets/tiles/`, je 4 Varianten, 220 Kacheln).
Volle Matrix: **55 × 54 / 2 = 1485 Paare**. Falsch, weil kein Planet alle Biome
trägt.

### 1.2 Oberfläche: Paare je Planetentyp, dedupliziert

| Planetentyp | n | Paare C(n,2) | davon neu | Doppelungen |
|---|---|---|---|---|
| EARTH_LIKE | 8 | 28 | 28 | — |
| DESERT | 6 | 15 | 15 | — |
| OCEAN | 6 | 15 | 15 | — |
| ICE | 6 | 15 | 15 | — |
| VOLCANIC | 6 | 15 | 15 | — |
| BARREN | 4 | 6 | 6 | — |
| TOXIC | 5 | 10 | 10 | — |
| GAS_GIANT | 1 | 0 | 0 | — (nur `plains`) |
| ICE_GIANT | 1 | 0 | 0 | — (nur `glacier`) |
| ASTEROID_M | 4 | 6 | 6 | — |
| ASTEROID_C | 4 | 6 | 6 | — |
| ASTEROID_S | 4 | 6 | 5 | **1** — `boulder_field\|impact_crater` (auch in ASTEROID_M) |
| MOON_ROCKY | 4 | 6 | 0 | **6** — Satz identisch mit BARREN |
| MOON_ICY | 6 | 15 | 0 | **15** — Satz identisch mit ICE |
| MOON_VOLCANIC | 6 | 15 | 0 | **15** — Satz identisch mit VOLCANIC |
| **Summe** | | **158** | **121** | **37** |

`ASTEROID_M ∩ ASTEROID_C = {DUST_BASIN}` und `ASTEROID_C ∩ ASTEROID_S =
{SILICATE_PLAIN}` sind je **ein** Element und erzeugen kein gemeinsames Paar;
nur `ASTEROID_M ∩ ASTEROID_S = {IMPACT_CRATER, BOULDER_FIELD}` hat zwei.

### 1.3 Untergrund: 10 nach Mengenlehre, 6 nach Tiefenlogik

> ⚠️ **Am 2026-09-06 gegen den Code korrigiert.** Die frühere Fassung führte
> einen „Tiefen Kern" aus MAGMA_POCKET und LAVA_FLOW. Beides ist falsch:
> `resolveVolcanicUnderground` (`Backend/shared/surface/underground-biome.ts`)
> gibt **nie LAVA_FLOW** zurück, und der tiefe Kern ruft dieselbe vulkanische
> Leiter mit **zurückgesetzter** Tiefe auf, trägt also ROCK_LAYER /
> MINERAL_VEIN / MAGMA_POCKET. Vollständige Herleitung samt Quellenangabe in
> `Docs/planet-biomes-by-type.md`; dort steht auch, dass die Schwelle
> typischerweise **7** ist und nicht 5.

| Untergrund-Familie | n | Paare | davon neu | Doppelung |
|---|---|---|---|---|
| Standard | 4 | 6 | 6 | — |
| Eisig | 3 | 3 | 2 | `deep_stone\|mineral_vein` |
| Vulkanisch | 3 | 3 | 2 | `mineral_vein\|rock_layer` |
| Tiefer Kern (= dieselben drei) | 3 | 3 | 0 | alle drei |
| **Summe** | | **15** | **10** | **5** |

Ein Übergang setzt voraus, dass beide Biome **auf derselben Tiefenebene**
auflösbar sind — ein z-Level ist genau eine Tiefe. T = `deepThresholdDepth`:

| Ebene | mögliche Biome | neue Paare |
|---|---|---|
| Standard, Tiefe 1–3 | MINERAL_VEIN, CAVE_FLOOR, ROCK_LAYER | 3 |
| Standard, Tiefe 4 … T−1 | MINERAL_VEIN, DEEP_STONE | 1 |
| Eisig, Tiefe 1 … min(5, T−1) | MINERAL_VEIN, ICE_CAVERN | 1 |
| Eisig, Tiefe 6 … T−1 (nur T ≥ 7) | DEEP_STONE allein | 0 |
| Vulkanisch, Tiefe 1–2 | MINERAL_VEIN, ROCK_LAYER | 1 |
| Vulkanisch, Tiefe 3 … min(5, T−1) | MINERAL_VEIN, MAGMA_POCKET | 1 |
| Tiefer Kern, rebasiert 0–2 | MINERAL_VEIN, ROCK_LAYER | Dublette |
| Tiefer Kern, rebasiert 3–5 | MINERAL_VEIN, MAGMA_POCKET | Dublette |
| Tiefer Kern, rebasiert ≥ 6 | MAGMA_POCKET allein | 0 |

**6 statt 10.** Vier Paare können nie auf derselben Ebene stehen:
`rock_layer|deep_stone`, `cave_floor|deep_stone`, `ice_cavern|deep_stone`,
`rock_layer|magma_pocket` — in jedem Fall schlägt eine Tiefenbedingung *vor*
der anderen zu und vereinheitlicht das ganze z-Level.

**Konsequent angewandt** laufen die vier in der Klassifikation als
**ENTFÄLLT**. Eines davon — **`deep_stone|ice_cavern`** — stand vorher in der
harten Liste; damit fiel die Zahl der harten Paare von 21 auf **20**.

Gemessen am Produktionsgenerator (12 Seeds je Ebene, 256 × 256 Zellen):
**Grenzzellenanteil 0,49 % bis 1,42 %** je Untergrundebene — noch niedriger als
an der Oberfläche (§ 6.4).

### 1.4 Ergebnis

| | Paare |
|---|---|
| naive Vollmatrix 55 × 54 / 2 | 1485 |
| Oberfläche nach Ko-Okkurrenz | 121 |
| Untergrund nach Mengenlehre | 10 |
| **Handrechnung 121 + 10** | **131 — nachgerechnet im Lauf vom 6.9.** |
| Untergrund zusätzlich tiefengefiltert | 6 |
| **wirksame Zahl** | **127** |

Reduktion gegen 1485: **91 %**. Die Tabellen führen alle **131** Zeilen, die
vier tiefengefilterten stehen darin als ENTFÄLLT.

**Namens-Mapping geprüft:** alle 55 Biomnamen der Kanon-Liste existieren exakt
als kleingeschriebener Ordner in `src/assets/tiles/`, ohne Rest auf beiden
Seiten. Das gesamte Mapping ist `tile.biome.toLowerCase()`
(`PlanetSurface.tsx:805`). Der in der Projektnotiz vermerkte Naming-Mismatch
besteht nicht mehr.

---

## 2. Was über weich und hart entscheidet

### 2.1 Zwei Gründe, aus denen eine Überblendung trägt

**Grund 1 — gleiche Materialfamilie.** Wasser in Wasser, Stein in Stein,
Vulkanisches in Vulkanisches. Die Mischzone kann nicht falsch aussehen, weil
sie zwischen zwei Zuständen desselben Materials liegt. Rudi: *„mesa gegen rocky
desert passt, die sehen sich optisch sehr ähnlich."*

**Grund 2 — der Verlauf bedeutet etwas Reales.** Die Kacheln sind sehr
verschieden, aber die Mischzone bildet einen tatsächlichen Zustand ab: Wasser
über Sand **ist** flaches Wasser. Nicht messbar, deshalb als ausdrückliche
Liste geführt (§ 2.4).

**Hart ist eine Grenze nur, wenn keiner der beiden Gründe greift.**

### 2.2 Der gemessene optische Abstand taugt nicht als Kriterium

Geprüft wurde ein Abstand aus p70, B/R, G/R, micro4, MESO und grain, jedes Bein
am Korpus aller 55 Biome normiert, gegen elf Paare, zu denen Rudi sich geäußert
hat:

Zahlen aus dem Lauf vom **6. September** (alle 55 Biome fertig); die Werte der
ersten Fassung stehen in Klammern, wo sie sich um mehr als 0.05 unterscheiden.

| Paar | Rudi | d | LEVEL | FARBE | TEXTUR | min MESO | Materialfamilie | trifft? |
|---|---|---|---|---|---|---|---|---|
| mesa \| rocky_desert | nah | 0.46 | 0.18 | 0.15 | 0.77 | 6.9 | Mineralisch \| Mineralisch | ✅ |
| regolith \| dust_plain | nah | 1.16 | 0.56 | 0.29 | 1.90 | 1.0 | Mineralisch \| Mineralisch | ✅ |
| regolith \| crater | nah | 1.51 | 1.80 | 0.39 | 1.86 | 9.7 | Mineralisch \| Mineralisch | ✅ |
| crater \| dust_plain | nah | 2.04 (1.91) | 2.35 | 0.68 | 2.55 | 1.0 | Mineralisch \| Mineralisch | ✅ |
| regolith \| rocky_outcrop | nah | 1.29 | 1.57 | 0.34 | 1.56 | 9.7 | Mineralisch \| Mineralisch | ✅ |
| reef \| shallow_water | nah | 0.42 | 0.58 | 0.41 | 0.13 | 7.8 | Wasser \| Wasser | ✅ |
| deep_ocean \| kelp_forest | nah | 1.42 (1.22) | 1.07 | 2.05 | 0.87 | 11.4 | Wasser \| Wasser | ✅ |
| **beach \| plains** | **weit** | **1.08** | 1.04 | 0.23 | 1.53 | 3.6 | Mineralisch \| Vegetation | ✅ |
| **plains \| mountain** | **weit** | **0.53** | 0.68 | 0.12 | 0.60 | 15.5 | Vegetation \| Mineralisch | ✅ |
| **ash_field \| basalt_plain** | **weit** | **0.40** | 0.63 | 0.16 | 0.23 | 12.1 | Ausnahme | ✅ |
| **basalt_plain \| lava_flow** | **weit** | **1.25** | 1.09 | 1.08 | 1.53 | 12.1 | Ausnahme | ✅ |

**Der Abstand trifft weiterhin 7 von 11 — und nur mit einer Schwelle bei 9.00,
die schlicht alles „nah" nennt.** Er ist damit nicht besser als raten. Die als
*hart* beurteilten Paare liegen im Mittel bei d = 0.81, die als *weich*
beurteilten bei d = 1.19: **die harten sind im Mittel die ähnlicheren.**
`plains|mountain` misst 0.53, `crater|dust_plain` misst 2.04.
Die Neumessung hat an diesem Bild nichts geändert — keine der elf Zeilen hat
die Seite gewechselt.

**Die Materialfamilie trifft 11 von 11.**

Der Grund ist einsichtig: hart ist eine Grenze aus *inhaltlichen* Gründen — eine
Vegetationslinie, ein erstarrter Deckenrand — und inhaltlich harte Paare sind
zufällig oft optisch nah. Grund 1 lässt sich also **nicht** als Pixelabstand
formulieren; die Materialfamilie ist seine tragfähige Fassung.

### 2.3 Materialfamilie je Biom

| Familie | Biome |
|---|---|
| **Wasser** (9) | ocean, deep_ocean, shallow_water, reef, kelp_forest, volcanic_vent, ice_shelf, oasis, acid_lake |
| **Mineralisch** (25) | mountain, snow_peak, mesa, canyon, rocky_desert, rocky_outcrop, regolith, crater, dust_plain, salt_flat, beach, sand_dunes, desert_patch, island, boulder_field, impact_crater, dust_basin, silicate_plain, carbon_crust, metallic_surface, fractured_zone, rock_layer, mineral_vein, cave_floor, deep_stone |
| **Eis** (6) | glacier, frozen_lake, crevasse, ice_cavern, tundra, permafrost |
| **Vulkanisch** (7) | lava_flow, basalt_plain, ash_field, caldera, obsidian_ridge, fumarole, magma_pocket |
| **Vegetation** (3) | plains, forest, swamp |
| **Chemisch** (4) | corroded_plain, chemical_vent, crystal_field, toxic_marsh |
| **offen** (1) | void_edge |

Die Grenzfälle, einzeln begründet:

| Biom | Familie | Begründung |
|---|---|---|
| `beach`, `sand_dunes`, `desert_patch`, `island` | Mineralisch | Sand ist verwitterter Fels; damit ist die ganze Wüsten- und Strandfläche familienintern weich, und `beach\|plains` bleibt trotzdem hart (Familienwechsel) |
| `oasis` | Wasser | ein Gewässer, kein Bewuchs |
| `ice_shelf` | Wasser | ist Wasser mit Schollen als Props (`PLAN § 3.2`) — seine Eis-Paare tragen deshalb über Grund 2 |
| `frozen_lake` | Eis | gefrorene Fläche, fester Grund |
| `tundra`, `permafrost` | Eis | Frostboden gehört zur Eisfamilie ihres Satzes; sonst wäre der ganze ICE-Satz gemischt |
| `snow_peak` | Mineralisch | Fels mit Schneehaube — weich gegen `mountain`, hart gegen Bewuchs, genau wie Rudi es für `plains\|mountain` sagt |
| `swamp` | Vegetation | bewachsener Nassboden |
| `toxic_marsh`, `crystal_field` | Chemisch | gehören zur Chemie ihres Satzes; damit ist TOXIC intern weich |
| `volcanic_vent` | Wasser | Unterwasserschlot im OCEAN-Satz |
| `salt_flat` | Mineralisch | Kruste auf Gestein |
| `magma_pocket` | Vulkanisch | fließendes Gestein |
| `void_edge` | **offen** | Motiv ungeklärt (`PLAN § 5.6`) — 3 Paare bleiben unentschieden |

### 2.4 Grund 2 — die Verlaufsliste (26 Paare)

Cross-Familie, aber der Verlauf bildet einen realen Zustand ab. Fast
ausschließlich ein Fluid über einem Grund:

| Paar | warum |
|---|---|
| `beach\|ocean`, `desert_patch\|ocean` | Wasser über Sand = flaches Wasser |
| `ocean\|plains`, `ocean\|forest`, `ocean\|swamp` | überflutete Wiese / Baumgrenze / Marsch |
| `island\|shallow_water`, `island\|reef`, `island\|kelp_forest`, `island\|volcanic_vent`, `deep_ocean\|island` | Wasser über Sandbank, Riffsaum, Tiefenzunahme |
| `oasis\|sand_dunes`, `oasis\|rocky_desert`, `oasis\|salt_flat`, `canyon\|oasis`, `mesa\|oasis` | Wasser über Sand / Fels / Kruste |
| `ice_shelf\|tundra`, `ice_shelf\|permafrost`, `frozen_lake\|ice_shelf`, `glacier\|ice_shelf`, `crevasse\|ice_shelf` | Wasser gegen Eis — Eisrand, Kalbungskante |
| `ash_field\|lava_flow`, `caldera\|lava_flow`, `fumarole\|lava_flow`, `lava_flow\|obsidian_ridge` | Lava über Grund = Abkühlzone |
| `acid_lake\|toxic_marsh`, `acid_lake\|corroded_plain`, `acid_lake\|chemical_vent`, `acid_lake\|crystal_field` | Säure über zerfressenem Grund |
| `magma_pocket\|rock_layer`, `magma_pocket\|mineral_vein` | Magma im Gestein |

### 2.5 Die neue Verteilung

| Einordnung | Paare | Anteil von 127 |
|---|---|---|
| **Alpha, gleiche Familie** (Grund 1) | 79 | 62 % |
| **Alpha, Verlauf** (Grund 2) | 25 | 20 % |
| **gebacken / harte Silhouette** | 20 | 16 % |
| **offen** (`void_edge`) | 3 | 2 % |
| **Summe wirksam** | **127** | |
| *entfällt* (nie auf derselben z-Ebene) | *4* | — |
| *Summe aller geführten Zeilen* | *131* | |

Aufgeschlüsselt nach Familie (Alpha, Grund 1): Mineralisch 40 · Vulkanisch 10 ·
Eis 10 · Wasser 10 · Chemisch 6 · Vegetation 3.

**Die 20 harten, vollständig:**

| Gruppe | Paare | | |
|---|---|---|---|
| **Vegetationslinie** — Mineralisch/Vegetation (12) | `beach\|forest` · `beach\|plains` · `beach\|swamp` · `desert_patch\|forest` · `desert_patch\|plains` · `desert_patch\|swamp` · `forest\|mountain` · `forest\|snow_peak` · `mountain\|plains` · `mountain\|swamp` · `plains\|snow_peak` · `snow_peak\|swamp` | | |
| **Ausnahme `basalt_plain`** — Deckenrand (5) | `ash_field\|basalt_plain` · `basalt_plain\|caldera` · `basalt_plain\|fumarole` · `basalt_plain\|lava_flow` · `basalt_plain\|obsidian_ridge` | | |
| **Kliff** — Wasser gegen Steilkante (2) | `mountain\|ocean` · `ocean\|snow_peak` | | |
| **Bruchkante** — Eis gegen Fels unter Tage (1) | `ice_cavern\|mineral_vein` | | |
| **offen** (3) | `void_edge` gegen `boulder_field`, `impact_crater`, `silicate_plain` | | |
| *entfallen* (4) | `cave_floor\|deep_stone` · `deep_stone\|ice_cavern` · `deep_stone\|rock_layer` · `magma_pocket\|rock_layer` | | |

Die vollständige Tabelle aller 131 Zeilen — mit Vorkommen, Grenzart, Verfahren,
`d` und `min MESO` — steht in **§ 11** und im Vergleichsbogen.

**Gegen die frühere Einordnung dieses Dokuments** (W 34 / HM 37 / HF 27 /
HH 25 / HK 6, also 98 harte): die Materialregel dreht das Verhältnis um. 77 der
98 früher als hart geführten Paare sind nach Rudis Regel weich — vor allem alle
Fluidlinien (Grund 2) und alle Höhensprünge innerhalb einer Familie.

### 2.6 Ein zweiter Effekt, der die Ausnahme erklärt: Struktur-Ghosting

Warum ist `basalt_plain` eine Ausnahme? Weil in der Mischzone **zwei kräftige,
verschiedene Muster übereinanderliegen** — die Plattenzeichnung des Basalts und
die Aderung der Lava beziehungsweise das Korn der Asche. Das liest sich als
Doppelbelichtung, nicht als Übergang (Bogen § 8).

Messbar als `min(MESO)` der beiden Kacheln, also *beide* stark strukturiert:

| Paar | MESO A | MESO B | min | Rudi |
|---|---|---|---|---|
| `plains\|mountain` | 15.53 | 16.67 | **15.53** | hart |
| `ash_field\|basalt_plain` | 15.77 | 12.07 | **12.07** | hart |
| `basalt_plain\|lava_flow` | 12.07 | 36.20 | **12.07** | hart |
| `deep_ocean\|kelp_forest` | 11.41 | 15.69 | 11.41 | weich |
| `mesa\|rocky_desert` | 12.85 | 6.92 | 6.92 | weich |
| `regolith\|crater` | 9.66 | 29.26 | 9.66 | weich |
| `beach\|plains` | 3.64 | 15.53 | 3.64 | **hart — hier schweigt die Zahl** |

Die drei bekannten Ghosting-Fälle liegen über 12, die weichen unter 11.5. Als
**Klassifikator überfeuert** die Zahl, als **Abnahme-Prüfliste** ist sie
brauchbar: sie benennt die Paare, die man vor dem Ausrollen ansehen sollte. Und
`beach|plains` zeigt, dass sie den zweiten Grund für Härte — die
Bedeutungslinie — nicht kennt.

### 2.7 Was der Vergleichsbogen darüber hinaus zeigt: Erhebungen

Der Lauf vom 6. September hat die Überblendung an fünf Paaren gegen die
gebackene Kante gestellt (Vergleichsbogen § 3–7). Über alle fünf hinweg gilt
ein Muster, das im Dokument bisher fehlte:

> **Alpha versagt genau dort, wo eine der beiden Kacheln eine ERHEBUNG mit
> eingebackenem Schatten trägt.** Eine Erhebung lässt sich nicht zur Hälfte
> einblenden — sie wird zum Geist. Eiskegel (`ice_cavern`), Basaltplatten
> (`basalt_plain`), Grasbüschel (`plains`) sind halbtransparent kein Zustand,
> den es gibt. Flache Motive — Risse, Krater, Furchen, Wasser, Sand — vertragen
> die Überblendung dagegen mühelos.

Das ist dieselbe Grenze, die `LESSONS § 6` für die Arbeitsteilung zieht:
*„Vertiefungen in die Kachel, Erhebungen in den Prop-Layer."* Wo eine Erhebung
trotzdem in der Kachel steckt, ist sie auch für den Übergang das Problem.
`min(MESO)` ist der brauchbare Indikator dafür, aber er misst die Ursache
(Strukturstärke) und nicht die Wirkung (Geisterbildung) — er markiert
`plains|mountain` korrekt und `beach|plains` gar nicht.

---

## 3. Konfigurationen je Paar

### 3.1 Gesetzt

Drei Kantenkonfigurationen — **unten links, unten rechts, unten beide** — mal
zwei Richtungen (X→Y und Y→X) = **6 je Paar**. Bei gebackenen Kacheln ist
„unten beide" ein eigenes Asset.

### 3.2 Warum 3 und nicht 15 oder 47

Eine Iso-Raute hat vier Kanten: ohne Einschränkung 2⁴ − 1 = **15** Belegungen,
mit den vier Eckkontakten ein volles Blob-Tileset mit **47**. Die Regel „nur
untere Kanten" schneidet das auf 2² − 1 = **3**.

**Die Regel ist vollständig und doppelt nichts** — nachgerechnet aus
`worldToScreen(wx,wy) = ((wx−wy)·TW/2, (wx+wy)·TH/2)` (`isoConstants.ts:85`):

| Nachbar | Bildschirmversatz | Kante |
|---|---|---|
| `(x+1, y)` | +24 / +12 | **SE — unten rechts** |
| `(x, y+1)` | −24 / +12 | **SW — unten links** |
| `(x−1, y)` | −24 / −12 | NW (oben links) |
| `(x, y−1)` | +24 / −12 | NE (oben rechts) |

Jede waagerechte Nachbarschaft ist die SE-Kante genau einer der beiden Kacheln,
jede senkrechte die SW-Kante genau einer. Jede Grenze wird **genau einmal**
gezeichnet.

### 3.3 Unten oder oben? — Befund aus dem Renderpfad

**Der Painter's Algorithm entscheidet es nicht.** Die Bodenschleife
(`PlanetSurface.tsx:794–815`) zeichnet jede Zelle über `drawGroundTile` **in
ihren eigenen Rautenpfad geclippt** (`isoConstants.ts:184–188`); Bodenkacheln
überlappen nie, die Reihenfolge ist für sie folgenlos. Die Sortierung nach
`posZ` und `posX + posY` betrifft den vereinigten Pass aus Props und Hüllen.

**Entscheidend ist die Verdeckung durch die Sprites derselben Zelle.** Props
sind an der Südspitze verankert und wachsen nach oben (`py = gyPx − drawH`,
`PROP_BASE_HEIGHT = 28` gegen `TH = 24`, `PlanetSurface.tsx:1002`,
`isoConstants.ts:6,20`); Hüllen werden mit 48 × 48 auf eine 48 × 24-Zelle
gezeichnet. **Beides deckt die obere Hälfte der eigenen Raute zu.**

→ **„Unten" ist richtig, und der Renderpfad stützt es.** Einschränkung fürs
Protokoll: Props der *vorderen* Nachbarzelle können über das untere Band ragen.
Das trifft jedes Verfahren gleich.

### 3.4 Die Richtung — im Bild statt in der Theorie

Der Bogen (§ 4) zeigt dieselbe Küste zweimal: einmal zeichnet jede Kachel ihre
eigenen unteren Kanten, einmal immer die Landkachel. Befund: **wo das Land
Besitzer ist, kriecht Wasser auf den Strand; wo das Wasser Besitzer ist,
kriecht Sand ins Wasser.** Beides ist plausibel, aber es wechselt entlang
derselben Küste je nach Himmelsrichtung.

Bei einer **weichen** Überblendung fällt das nicht auf — beide Lesarten sind
Flachwasser. Bei einer **harten** Kante wäre es der falsche Rand auf der
falschen Seite. Damit hängt die Richtungsfrage nur noch an den 20 harten
Paaren, nicht mehr an allen 131.

---

## 4. Der erste Versuch (Alpha allein)

Vollständig im Bogen `assets/style-test/tiles/_transition_test_sheet.html`.
Die vier Befunde, auf denen alles Weitere steht. **Alle vier haben den zweiten
Lauf überstanden**; der Vergleich gegen die gebackene Kante steht in § 5.4–5.6
und im Bogen `_uebergang_vergleich.html`. Die Zahlen dieses Abschnitts stammen
aus dem ersten Lauf; jede von ihnen betrifft ein Biom, dessen Kacheldateien
seither **nicht** angefasst wurden (Dateizeitstempel geprüft, siehe Kopf).
Nachgemessen wurden nur die 40 Kacheln der zehn seither überarbeiteten Biome.

### 4.1 Die Prämisse stimmt — mit zwei Ausnahmen

| Biom | micro4 | Perzentil | MESO | Perzentil |
|---|---|---|---|---|
| ocean | 4.20 | 22 % | 12.23 | 53 % |
| deep_ocean | 2.24 | 5 % | 11.41 | 42 % |
| shallow_water | 4.96 | 31 % | 7.78 | 25 % |
| reef | 4.94 | 29 % | 9.85 | 40 % |
| ice_shelf | 3.46 | 13 % | 11.90 | 45 % |
| **kelp_forest** | **7.52** | **53 %** | **15.69** | **73 %** |
| **oasis** | **7.72** | **55 %** | 8.67 | 33 % |

„Relativ wellenlos" trifft auf dem Feinkontrast zu (ocean im 22., deep_ocean im
5. Perzentil des Korpus). Auf dem Reliefband liegen die Wasserkacheln im
Mittelfeld — großflächige Modulation, aber keine feine Struktur, und das ist
für eine Überblendung die günstige Kombination. **Nicht** gilt es für
`kelp_forest` und `oasis`: die beiden einzigen Wasserbiome mit eigener
Struktur.

### 4.2 Rudi hat recht — Wasser über Sand braucht keine Brandung

Die Rampenleitern zeigen `beach ← ocean` in drei Breiten, drei
Kantenkonfigurationen, zwei Varianten und beiden Richtungen. Die Überblendung
liest sich in jeder Breite als Flachwasserzone.

**Die Kennzahl, die dagegen sprach, war falsch.** Eine lineare Überblendung
zwischen warmem Sand (B/R 0.79) und kaltem Wasser (B/R 2.26) läuft im RGB-Raum
zwangsläufig durch Neutralgrau: gemessene Chroma-Senke 12.9 Punkte über 39 %
der Rampe. Im Bild tritt der vorhergesagte „schmutzige Schleier" **nicht** ein —
die Entsättigung liest das Auge als **nassen Sand**. Umgekehrt hat
`beach|plains`, der Fall, den Rudi hart nennt, eine Senke von **0**. Die
Chroma-Senke gehört damit zu den Kennzahlen aus `LESSONS § 5`, die in die Irre
führen; als Warnung bei zwei gesättigten Gegenfarben bleibt sie brauchbar
(`island|shallow_water`: 83 % Grauband — ansehen).

### 4.3 Der eigentliche Befund: glatt reicht nicht, verrauscht schon

| Variante | geänderte Bildfläche | mittlere Änderung |
|---|---|---|
| glatte Rampe 0.55 | 1,20 % | 6.2 Luma |
| verrauscht 0.55 / amp 0.9 | 1,79 % | 5.2 Luma |
| **verrauscht 0.95 / amp 1.3** | **2,52 %** | 6.2 Luma |
| Absorptionsoperator 0.55 | 1,56 % | 16.9 Luma |

**Eine glatte Rampe senkrecht zu einer geraden Kante lässt die Kante gerade** —
sie verwischt den Farbsprung, aber die 45°-Treppe der Biomgrenze bleibt
vollständig stehen. Was die Treppe bricht, ist nicht Weichheit, sondern
**Unregelmäßigkeit**: eine in **Weltkoordinaten** ausgewertete Rauschfunktion,
über die Kachelgrenze hinweg stetig. Dann zerfällt der Umriss in Lappen und die
Küste liest sich als Küste.

Das hält auf Spielskala (48 × 24). Auf dem **Achtel-Mip** kommt die Treppe
teilweise zurück, weil die Rampe dort nur noch wenige Pixel breit ist.

### 4.4 Die Gegenproben

Alle drei sind im zweiten Lauf gegen die gebackene Kante wiederholt worden und
haben sich bestätigt (Vergleichsbogen § 4–6).

| Gegenprobe | erwartet | tatsächlich |
|---|---|---|
| `basalt_plain` gegen vulkanische Nachbarn | scheitert | **scheitert sichtbar** — Struktur-Ghosting, Doppelbelichtung aus Plattenzeichnung und Aderung. Rudis Ausnahme ist begründet. |
| `beach` ↔ `deep_ocean` (größter Abstand) | scheitert | **scheitert nicht im Bild, sondern im Motiv** — Tiefsee hat keine Flachwasserzone. Das ist eine Frage an die Kartengenerierung, nicht ans Rendering. |
| `beach` ↔ `plains` | scheitert | **scheitert nicht sichtbar** — die Überblendung liest sich als ausdünnender Bewuchs (Dünengras). Chroma-Senke 0, kein Ghosting. Rudis Urteil ist eine Entscheidung über das Motiv, nicht über einen sichtbaren Fehler. → offene Frage § 9 |

---

## 5. Weg C — der gerechnete Weg (Rauschblende und harte Silhouette)

Der Versuch hat einen dritten Weg erzeugt, den es vorher im Dokument nicht gab
und der die 104 weichen Paare vollständig bedient — und nach § 5.5 auch die
20 harten.

### 5.1 Das Verfahren

Pro Grenzzelle wird das Nachbarbiom durch eine **berechnete** Alphakurve in die
eigene Raute geblendet. Farbe liefert die vorhandene Nachbarkachel zur
Laufzeit — in der Variante, die dort wirklich liegt.

```
a = smoothstep(Rampe zur unteren Kante)          // Geometrie
a = clamp(a + amp * (noise(world) - 0.5))        // Unregelmäßigkeit
Ergebnis = Kachel_A * (1-a) + Kachel_B * a       // innerhalb des Rauten-Clips
```

Das Rauschen wird an der **Weltposition** des Pixels ausgewertet, nicht
kachellokal — sonst wiederholt sich dieselbe Lappenform an jeder Grenzzelle und
erzeugt genau das Raster, vor dem `LESSONS § 4` warnt.

### 5.2 Kosten

| | Weg C |
|---|---|
| Assets | **0** |
| Speicher | **0** |
| Code | Rauschfunktion + Blende, rund 60 Zeilen |
| Laufzeit | 1 clear + 2 drawImage je Grenzzelle, nur beim Cache-Rebuild |

Einbauort: die Bodenschleife `PlanetSurface.tsx:794–815`, innerhalb des Clips
von `drawGroundTile`, also im Aufbau des **Offscreen-Scene-Caches** — nicht im
rAF-Compositor. Für die Alphamaskierung existiert das Muster bereits:
`blitPropTint` (`PlanetSurface.tsx:176–205`) baut mit Scratch-Canvas und
`source-in` eine alpha-maskierte Silhouette.

### 5.3 Was zu beachten ist

- **`destination-in` rechnet nur mit dem Alphakanal.** Wird die Kurve je zu
  einer PNG-Maske, muss sie RGBA sein — eine Graustufenmaske schneidet nichts
  weg und liefert das volle Rechteck (`LESSONS § 3`: genau dieser Fehler hat
  schon einmal „harte Rechtecke statt weicher Flicken" ergeben). Solange die
  Kurve **gerechnet** wird, entfällt der Fallstrick ganz.
- **Mip-Stufen:** der Scratch wird in Zeichengröße aufgespannt, `drawImage`
  skaliert Nachbarkachel und Kurve gleichermaßen. Auf dem Achtel-Mip muss die
  Rampe breiter und lauter werden oder der Übergang unterhalb einer
  Zoomschwelle entfallen — analog `propsVisibleAtZoom` (`detailTier.ts:194`).
- **Nachbarabfrage:** zwei zusätzliche `surfaceStore.getTile` je Zelle; bei
  13 689 Zellen am Zoom-Boden sind das 27 000 Map-Zugriffe je Rebuild →
  zeilenweise puffern.
- **Rebuild-Latenz** wird bereits gemessen: `recordRebuild`
  (`PlanetSurface.tsx:1182`) plus `rebuildHelpers.bench.ts`.

### 5.4 Zwei Zahlen für die Grenzlinie, und warum es zwei sein müssen

Gemessen an der 0.5-Niveaulinie einer 512×256-Kachel an der SE-Kante:

| Kurve | Kontur-Index | Auslenkung sd | Spanne |
|---|---|---|---|
| glatte Rampe 0.55 | 1.00 | **0.6 px** | 8.2 px |
| verrauschte Rampe 0.95 / amp 1.3 | 1.44 | 25.1 px | 91.6 px |
| gebackene Silhouette „wasser" | **1.01** | 17.4 px | 91.1 px |
| gebackene Silhouette „vegetation" | 1.48 | 14.1 px | 93.4 px |
| gebackene Silhouette „decke" | 1.23 | 14.4 px | 74.2 px |
| gebackene Silhouette „bruch" | 1.24 | 16.3 px | 79.7 px |

Die **Auslenkung 0.6 px** der glatten Rampe ist der Kernbefund des ersten
Versuchs als Zahl: sie lässt die Kante gerade.

Und die beiden Spalten widersprechen sich, das ist Absicht. Die gebackene
Wasserlinie ist mit Index 1.01 so *kurz* wie eine Gerade — also glatt, nicht
zackig — und lenkt trotzdem 17 px aus: eine große, langsame Bucht. **Der
Kontur-Index misst Zackigkeit, nicht Formabweichung.** Wer nur ihn liest, hält
eine gemalte Küstenlinie für eine gerade Kante. Beide gehören ausgewiesen
(`LESSONS § 5`).

### 5.5 Die gebackene Kachel — jetzt gebaut, und der Befund daran

Für den Vergleichsbogen wurden **90 Übergangskacheln wirklich erzeugt**
(5 Paare × 2 Richtungen × 3 Kantenkonfigurationen × 3 Rauschvarianten), jede
512×256 als `.webp` samt drei Mip-Stufen, abgelegt als
`assets/style-test/tiles/_uebergang_bake_*.webp`.

**Warum prozedural und nicht über flux.** Eine Übergangskachel muss an ihren
drei *anderen* Kanten exakt die Basiskachel bleiben, sonst reißt die Naht zum
Nachbarn. flux regeneriert die Fläche (`LESSONS § 3`: „kontext ist NIE
additiv") und heftet Formen an die Rautenmaske, weil es sie als Bildrahmen
liest — beides bricht genau das. Der Inhalt links und rechts der Linie ist
außerdem schon vorhanden: es sind die beiden fertigen Biomkacheln. Zu erfinden
ist allein die **Silhouette** und ihr **Saum**, und das ist eine Masken-, keine
Generierungsaufgabe.

| Grenzart | Silhouette | Saum |
|---|---|---|
| `wasser` | weiche Buchten, ~2 Perioden je Kante | 26 px nasser Sand auf der Landseite, 4 px Schaumstrich auf der Wasserseite |
| `vegetation` | Grundkurve plus einzeln überstehende Büschel | 7 px Fußschatten unter dem Bewuchs, 3 px heller Sandsaum davor |
| `decke` | facettiert, fast gerade Abschnitte mit Versatz | 6 px belichtete Lippe, 9 px Schatten dahinter |
| `bruch` | gerade Facetten, härter versetzt | 2 px dunkle Fuge, dahinter schmale helle Bruchfläche |

**Der Befund, der die Kostenfrage umstellt:** weil die Silhouette *gerechnet*
wird, ist sie **keine Datei**. Dieselben rund vierzig Zeilen könnten im Aufbau
des Offscreen-Scene-Caches laufen und dort dieselbe Kante zeichnen — mit der
**echten** Nachbarvariante statt einer eingefrorenen, über Kachelgrenzen hinweg
stetig, und ohne ein einziges Asset. Damit fällt die alte Unterscheidung
zwischen **Weg A** (gebacken) und **Weg B** (Formmasken) zusammen: es bleiben
zwei Alphaquellen desselben Compositing-Pfades —

```
weiche Blende      a = smoothstep(Rampe) + Rauschen        -> die 104 weichen
harte Silhouette   a = Schwelle(Zunge)  + Saum am Abstand  -> die 20 harten
```

Gebacken werden müsste nur, was sich **nicht** rechnen lässt — ein von Hand
gemalter Saum. Dieser Lauf hat dafür keinen Fall gefunden.

### 5.6 Der Preis des Backens, gemessen: die Kette gleicher Lappen

Eine gebackene Kachel ist an jeder Grenzzelle dieselbe. Gemessen als
**Zellgleichheit** — mittlere |NCC| der hochpassgefilterten Zell-Luma zweier
Grenzzellen derselben Kantenkonfiguration; 1.00 hieße „immer dasselbe Bild".
Roh gemessen erreichen zwei ruhige Kacheln 0.99, ohne verwandt zu sein, deshalb
der Hochpass (`LESSONS § 8`):

| Paar | Alpha glatt | Alpha verrauscht | gebacken K=3 | gebacken K=1 |
|---|---|---|---|---|
| rocky_desert \| mesa | 0.223 | 0.245 | 0.545 | 0.594 |
| beach \| ocean | 0.229 | 0.293 | 0.429 | 0.666 |
| beach \| plains | 0.222 | 0.217 | 0.508 | 0.591 |
| basalt_plain \| lava_flow | 0.277 | 0.274 | 0.561 | 0.593 |
| mineral_vein \| ice_cavern | 0.219 | 0.223 | 0.560 | 0.594 |

Gebackene Kacheln liegen durchweg bei 0.43–0.56, die gerechneten Blenden bei
0.22–0.29. **K Rauschvarianten mildern das Problem, sie beheben es nicht** —
zum Preis von K × Assets. Und: im Bild ist der Unterschied K=1 gegen K=3 bei
dieser Küstendichte kaum auszumachen. Die Zahl sieht die Ursache, das Auge
urteilt über die Wirkung (`LESSONS § 5`) — belastbar ist der Abstand zwischen
*gerechnet* und *gebacken*, nicht die Feinstufung innerhalb des Backens.

---

## 6. Was der harte Rest kostet

Nur noch **20 Paare** (+ 3 offen), und sie zerfallen in **vier Gruppen** mit je
einer gemeinsamen Form.

### 6.1 Die gemessenen Grundlagen (Stand 6.9.)

| | |
|---|---|
| eine Biomkachel samt drei Mip-Stufen | **31,4 KB** (7 076 436 B über 220 Basiskacheln) |
| eine **gebackene Übergangskachel** samt Mips | **31,9 KB** (90 Stück gemessen, Spanne 24,7–41,1 KB) |
| alle 220 Biomkacheln zusammen | **6,75 MB** |
| Release-APK | **103,0 MB** (107 983 666 B) |

Eine Übergangskachel kostet also praktisch genau so viel wie eine Biomkachel —
die Silhouette macht das Bild weder einfacher noch komplizierter zu
komprimieren. Die `.png` in `src/assets/tiles/` sind nicht im Bundle, der Glob
in `spriteCache.ts:33` nimmt nur `*.webp`.

### 6.2 Weg A — gebacken

| Umfang | Formel | Kacheln | Speicher | APK |
|---|---|---|---|---|
| **nur die 20 harten, je 1 Variante** | 20 × 6 | **120** | **3,74 MB** | **+3,6 %** |
| … mit 3 Rauschvarianten je Kante | 20 × 6 × 3 | 360 | 11,23 MB | +10,9 % |
| … mit 4 Grundvarianten statt Rauschvarianten | 20 × 6 × 4 | 480 | 14,98 MB | +14,5 % |
| **… beides, wie es sein müsste** | 20 × 6 × 3 × 4 | **1 440** | **44,9 MB** | **+43,6 %** |
| alle 127 Paare, je 1 Variante (alte Rechnung) | 127 × 6 | 762 | 23,77 MB | +23,1 % |

**Beide Faktoren sind Pflicht, und sie multiplizieren.** Der Variantenfaktor
ist bei gebackenen Vollkacheln nicht optional: eine Übergangskachel enthält den
Grund von X, und der wird heute pro Zelle aus vier Varianten gewürfelt
(`floorVariant`, `isoConstants.ts:218`, Aufruf `PlanetSurface.tsx:804`) — eine
feste Variante heißt an jeder Biomgrenze eine Kette identischer Böden. Der
Rauschfaktor ist ebenso Pflicht, sonst steht dieselbe Bucht an jeder Zelle
(§ 5.6). Zusammen kosten **20 von 127 Paaren 6,7-mal so viel wie sämtliche
Biomkacheln des Spiels**. Streng korrekt wären sogar 4 × 4 Kombinationen der
Grundvarianten.

### 6.3 Weg B ist in Weg C aufgegangen

Die frühere Fassung stellte den 126 gebackenen Kacheln „~24 gezeichnete
Formmasken zu 0,14 MB" gegenüber. Nach § 5.5 ist auch das zu viel: die vier
Formen sind **Funktionen**, keine Bilder — je eine Zungenkurve plus ein Saum
auf dem Abstandsfeld. Eine Maske als Datei hätte zusätzlich den Nachteil, sich
pro Kachel zu wiederholen (§ 5.6) und den Fallstrick aus `LESSONS § 3` zu
tragen (`destination-in` rechnet nur mit Alpha; eine Graustufenmaske liefert
das volle Rechteck).

| | gebacken (Weg A) | gerechnet (Weg C, weich **und** hart) |
|---|---|---|
| deckt ab | die 20 harten | **alle 127** |
| Assets | 120 … 1 440 Kacheln | **0** |
| Speicher | 3,7 … 44,9 MB | **0** |
| Kachelvarianten | eingefroren oder × 4 | automatisch korrekt |
| Wiederholung entlang der Grenze | Zellgleichheit 0.43–0.67 | 0.22–0.29 |
| drei Biome an einer Zelle | nicht darstellbar | zwei Durchgänge |
| Nachgraden einer Basiskachel | Assets ungültig | wirkt mit |
| Erzeugungsaufwand | 120+ gegradete Assets | vier Kurven, rund 100 Zeilen |
| Laufzeit je Grenzzelle (48 × 24) | 0 | 103 µs weich / 135 µs hart |

### 6.4 Was die gerechnete Kante an Laufzeit kostet — gemessen

Die entscheidende Zahl war lange offen: **wie viele Zellen eines Rebuilds sind
überhaupt Grenzzellen?** Sie ist jetzt gemessen, und zwar **nicht am Gerät und
nicht an einer Fixture**, sondern am **Produktionsgenerator des Backends**:
`Backend/shared/surface/*` mit esbuild gebündelt und direkt aufgerufen. Der
Endpunkt `GET /planets/{id}/surface` ruft dieselbe Funktion je Request auf und
persistiert nichts (`Backend/lambdas/planet/surface/handler.ts:82-91`) — die
Zellen, die der Client bekommt, sind zeichengleich die hier gerechneten.
Unbekannt ist allein der `surfaceSeed` eines konkreten Planeten; deshalb wurde
über die echte Ableitungskette `deriveSurfaceSeed` gesampelt und der
schlechteste Fall mit ausgewiesen.

**Umfang:** 13 Oberflächentypen × 40 Seeds = **520 Planetenoberflächen** à
512 × 512 Zellen (136 Mio. Zellen), dazu 3 Untergrundfamilien × 3 Schwellen ×
10 Tiefen × 12 Seeds. Die Bildausschnitte stammen aus dem echten Renderpfad
(`computeCacheExtent` + `computeGridWindow`, Referenzgerät 411 × 642 CSS px).
Skripte: `scratchpad/grenzzellen-messung.cjs`, Rohdaten
`grenzzellen-daten.json`.

| Planetentyp | Grenzzellen global | Spanne über Seeds | Biome | Fleck-Median |
|---|---|---|---|---|
| **EARTH_LIKE** | **3,85 %** | 3,16–4,47 | 6–8 | 337 Zellen |
| OCEAN | 3,06 % | 2,35–3,58 | 5–6 | 432 |
| VOLCANIC / MOON_VOLCANIC | 2,59 % | 2,01–3,07 | 5–6 | 494 |
| ICE / MOON_ICY | 2,31 % | 1,80–2,97 | 4–6 | 479 |
| DESERT | 2,14 % | 1,61–2,74 | 4–6 | 535 |
| ASTEROID_C | 1,88 % | 1,53–2,24 | 3–4 | 637 |
| BARREN / MOON_ROCKY | 1,85 % | 1,39–2,24 | 4 | 608 |
| ASTEROID_M | 1,73 % | 1,26–2,12 | 3–4 | 572 |
| ASTEROID_S | 1,61 % | 1,12–2,01 | 3–4 | 647 |
| **TOXIC** | **1,49 %** | 0,97–2,37 | 3–5 | 454 |
| Untergrund, alle Ebenen | **0,49–1,42 %** | | 2–3 | 728–1308 |

**Mittel über alle 13 Typen: 2,25 %.** GAS_GIANT und ICE_GIANT tragen genau ein
Biom — 0 % per Konstruktion.

Je Bildausschnitt, absolute Zahl der Grenzzellen (Mittel / schlechtestes
Fenster über alle Seeds und Lagen):

| Zoom | Fenster | Bodenzellen | EARTH_LIKE | ASTEROID_S |
|---|---|---|---|---|
| 0,35 | 118 × 118 | 13 924 | **535 / 1078** | 226 / 637 |
| 0,5 | 118 × 118 | 13 924 | 535 / 1078 | 226 / 637 |
| 0,75 | 94 × 94 | 8 836 | 340 / 788 | 143 / 460 |
| 1 | 70 × 70 | 4 900 | 188 / 499 | 80 / 317 |
| 2 | 36 × 36 | 1 296 | 50 / 196 | 21 / 134 |
| 4 | 22 × 22 | 484 | 19 / 99 | 8 / 79 |

Der **Anteil ist zoomunabhängig** (3,84 % bei Zoom 0,35 wie bei Zoom 4), die
absolute Zahl fällt mit dem Fenster. **Schlechtestes Einzelfenster über alles:
7,74 %** (EARTH_LIKE). Drei weitere Zahlen fallen dabei ab und schließen alte
offene Punkte:

- **Mischzellen** (drei Biome an einer Zelle, § 7.3): **0,00–0,01 %.** Randfall,
  nicht Normalfall.
- **Flächen unter 10 Zellen: 0,0 %.** Es gibt keine gesprenkelten Karten — die
  Basisoktave des Backend-Noise läuft über 128 Zellen (`shared/surface/noise.ts`,
  `SCALES = [128, 64, 32, 16]`).
- **Fleckengröße im Median 337–1308 Zellen**, also deutlich größer als ein
  Bildschirm bei hohem Zoom.

**Was das kostet.** Bei drei Zeichenoperationen je Grenzzelle gegen eine je
Bodenzelle sind das **+11,5 % `drawImage`-Aufrufe im Mittel (EARTH_LIKE),
+23,2 % im schlechtesten gemessenen Fenster**; beim ruhigsten Typ +4,9 % /
+13,7 %. Eine Obergrenze für die Zahl der Übergänge je Rebuild braucht es
danach **nicht**.

**Der eigentliche Kostenpunkt liegt in der ERKENNUNG, nicht im Zeichnen.**
Gemessen in node über 13 924 Zellen, nach Warmlauf:

| | je Rebuild |
|---|---|
| Bodenschleife heute (1 `getTile` je Zelle) | 1,51 ms |
| naiv, zwei zusätzliche Nachbarabfragen je Zelle | 4,05 ms → **+2,54 ms** |
| **mit einer vorausgelesenen Zeile (1 Abfrage je Zelle)** | 1,57 ms → **+0,06 ms** |

+2,54 ms wären rund ein Drittel des ~8-ms-Budgets, allein fürs Nachschlagen —
die Kosten stecken im String-Bau des Kachelschlüssels, nicht in der Map. Mit
Zeilenvorlauf verschwinden sie. **Damit ist die Zeilenpufferung Pflicht und
keine Rückfallebene** (Umsetzungsplan § 3.6).

> ⚠️ Was diese Messung **nicht** liefert: die Zeichenkosten auf dem Gerät. node
> hat kein Canvas, das Verhältnis „+11,5 % drawImage" ist geräteunabhängig, die
> absolute Millisekundenzahl nicht. Die gehört in die Bench
> (`rebuildHelpers.bench.ts`) bzw. an den Emulator.

## 7. Risiken, die keiner der Wege löst

### 7.1 Ein Übergang darf keine neue Naht erzeugen

Eine auf jeder Grenzzelle identische Kurve erzeugt eine Kette gleicher Lappen
entlang der ganzen Biomgrenze — ein neues Raster im Kachelabstand
(`LESSONS § 4`: *ein Raster fällt auf, wenn seine Tarnung fehlt*).

**Weg C ist dagegen von Natur aus immun**, solange das Rauschen in
Weltkoordinaten ausgewertet wird — gemessen: Zellgleichheit 0.22–0.29 gegen
0.43–0.67 bei gebackenen Kacheln (§ 5.6). Weg A braucht K Rauschvarianten,
gewählt über den vorhandenen Hash `floorVariant(x, y, K)`
(`isoConstants.ts:218`), und behebt das Problem damit nicht, sondern mildert es.

**Messbar so:** Faltmetrik `grid_tot`/`coh` **nur auf dem Grenzband** (auf der
ganzen Platte mittelt die Fläche das Signal weg); zusätzlich die
Autokorrelation entlang der Grenze im Kachelabstand (48 Welt-px), die bei einer
einzigen Form nahe 1 liegt. Der **Nahtsprung** taugt nicht (`LESSONS § 5`).
Angesehen wird es am 2 × 2 und am verschränkten Mosaik einer Grenzzeile.

### 7.2 Die vier Varianten haben unterschiedliche Helligkeit

Bei Weg C kein Problem: die Blende benutzt die **echte** Nachbarkachel in
ihrer echten Variante, und ein Nachgraden der Basiskachel wirkt automatisch
mit. Bei Weg A ist es entweder ×4 Assets oder Variantenverlust an jeder Grenze
(§ 6.1).

### 7.3 Wo drei Biome zusammenstoßen

Zelle X mit SW-Nachbar Y und SE-Nachbar Z, Y ≠ Z:

- **Weg A:** kein Asset — „unten beide" ist für *ein* Nachbarbiom gebacken. Ein
  Asset je Tripel wären allein in EARTH_LIKE 8 × 7 × 6 = 336 zusätzliche
  Bilder. Weg A muss den Mischfall aufgeben.
- **Weg C:** zwei Durchgänge, je Nachbar einer. Damit sie sich an der
  Südspitze nicht überlagern, wird die zweite Kurve um die erste beschnitten
  (`destination-out`), dann trägt jeder Pixel genau ein Material.

Wie häufig der Mischfall ist, ist an Live-Daten zu messen (§ 9).

### 7.4 Der Nachbar ist möglicherweise nicht geladen

Der Tile-Store ist dünn besetzt; am Fensterrand liefert `getTile` `undefined`,
dann entfällt der Übergang und erscheint beim nächsten Rebuild. Renderfenster
bis 116 Zellen/Achse (`MAX_TILES_PER_AXIS`), Ladefenster 64 × Pufferfaktor
≈ 192 — also breiter, das passt.

---

## 8. Empfehlung

> **Ein Compositing-Pfad, zwei gerechnete Alphaquellen — und kein einziges
> Asset.**
> Eine **weiche Rauschblende** für die 104 Paare, die innerhalb einer
> Materialfamilie liegen oder einen sinnvollen Verlauf abbilden; eine **harte
> Silhouette mit Saum** für die 20 harten. Beides sind Funktionen auf demselben
> Abstandsfeld; der einzige Unterschied ist, ob die Kurve überblendet oder
> schwellt.
> **Gebacken (Weg A) wird nicht verfolgt** — er kostet für 20 von 127 Paaren
> 3,7 bis 44,9 MB, friert die Kachelvarianten ein, wiederholt dieselbe Form
> entlang der ganzen Grenze und stirbt bei jedem Nachgraden einer Basiskachel.
> Der Vergleichsbogen zeigt, dass er **nichts** kann, was die gerechnete
> Silhouette nicht auch kann.

Zwei Einschränkungen gehören zur Empfehlung:

- **Der Saum ist der Teil, der wirklich neu ist.** Nasser Sand, Fußschatten,
  belichtete Lippe, dunkle Fuge — vier Operatoren auf dem Abstandsfeld. Sie
  sind im Vergleichsbogen zu sehen und tragen dort, aber sie sind an fünf
  Paaren erprobt, nicht an zwanzig.
- **Der Saum darf nicht überall hin.** Bei `rocky_desert|mesa` zeichnet er eine
  dunkle Fuge, wo im Material keine ist, und erfindet genau die Kante wieder,
  die die Überblendung eben abgeschafft hatte. **Harte Silhouette nur für die
  20 harten Paare**, nie familienintern.

### 8.1 Der erste Schritt

1. **Compositing-Pfad** in die Bodenschleife, hinter einem Debug-Schalter, mit
   der gerechneten Rauschblende. Kein Asset.
2. **An zwei Paaren erproben**, beide aus fertigen Familien:
   `regolith` ↔ `dust_plain` (Grund 1) und `beach` ↔ `ocean` (Grund 2).
3. **Rebuild-Latenz und Grenzzellenanteil messen** — `recordRebuild` liefert
   die eine Zahl bereits, die andere fehlt heute komplett (§ 9). Erst damit
   wird aus den 195 ms in § 6.4 eine belastbare Zahl.
4. **Rampenbreite und Rauschstärke am Gerät festlegen**, getrennt je Mip-Stufe;
   die Werte aus den Bögen (0.95 / amp 1.3) sind ein Startpunkt, kein Ergebnis.
5. **Rastermessung auf dem Grenzband** (§ 7.1), plus die Zellgleichheit aus
   § 5.6 als laufende Kontrolle.
6. Abnahme durch Rudi am Emulator. **Erst danach** die harte Silhouette für die
   vier Gruppen.

Nicht Teil des ersten Schritts: die harten Gruppen, Untergrund, `void_edge`,
Grenz-Props, Mischzellen mit drei Biomen.

### 8.2 Was an der Kante zusätzlich möglich wäre

Objekte, die in keiner der beiden Kacheln stecken — Treibholz an der
Wasserlinie, ein Schuttfächer am Wandfuß, Eisschollen am Schelfrand — gehören
nach der geltenden Arbeitsteilung ohnehin nicht in die Kachel:
*„Vertiefungen in die Kachel, Erhebungen in den Prop-Layer"* (`LESSONS § 6`).
Der Prop-Layer platziert bereits deterministisch je Zelle (`propLayout.ts`); ein
Grenz-Prop-Set fügt sich dort ein. Eigenes Vorhaben, nach den Übergängen.

---

## 9. Offene Fragen

### An Rudi

1. **Frisches Ko-Okkurrenz-JSON aus dem Backend ziehen.** Die Sätze in
   `planet-biomes-by-type.md` sind der Stand des letzten Syncs; die Zahl 131
   hängt daran. (In der Projektnotiz ausdrücklich als Pflicht vermerkt.)
2. **`beach` ↔ `plains`:** auch der zweite Versuch kann deine Einschätzung
   weder bestätigen noch widerlegen — überblendet sieht es nach ausdünnendem
   Bewuchs aus, gebacken nach einer gemähten Kante, beides ist plausibel
   (Vergleichsbogen § 5). Bleibt die Vegetationslinie hart? Davon hängen
   **12 der 20 harten Paare** ab; fallen sie weg, bleiben 8.
3. **Kliff:** `mountain|ocean` und `ocean|snow_peak` sind Wasser gegen
   Steilkante. Ich habe sie hart gelassen, aber `mesa|oasis` und `canyon|oasis`
   über Grund 2 weich gestellt — das ist derselbe Fall in klein. Beide gleich
   behandeln, und wenn ja, wie?
4. **`void_edge`** — 3 Paare bleiben unentscheidbar, solange das Motiv offen
   ist (`PLAN § 5.6`).
5. **Untergrund-Übergänge** überhaupt bauen? Es sind nur noch **5** Paare
   (7 z-Ebenen-Paare minus die beiden, die schon in anderen Sätzen stehen),
   davon genau **eines hart** (`ice_cavern|mineral_vein`). Die
   UNDERGROUND-Kacheln sind inzwischen fertig, das Argument „noch nicht
   überarbeitet" ist erledigt.
6. **Die Ghosting-Kandidaten** (§ 2.6) und die Erhebungs-Regel (§ 2.7) vor dem
   Ausrollen ansehen — ich kann sie als Kontaktbogen rendern, wenn du willst.
7. **Der Saum ist an fünf Paaren erprobt, nicht an zwanzig** (§ 8). Soll ich
   die restlichen 15 harten Paare im selben Vergleich durchrechnen, bevor
   irgendetwas in den Renderer geht?

### Ans Backend

8. ~~**Bestätigung der Tiefenlogik**~~ — **beantwortet am 2026-09-06 am Code**
   (`shared/surface/underground-biome.ts`). Die vier Paare koexistieren
   tatsächlich nie auf derselben Tiefe. Dabei kamen drei Fehler des
   Kanon-Dokuments heraus, die inzwischen korrigiert sind: LAVA_FLOW gibt es
   untertage nicht, der tiefe Kern rebasiert die Tiefe, zwei Zweige sind toter
   Code (§ 1.3 und `planet-biomes-by-type.md`).
9. ~~**Ist `deepThresholdDepth` je Planet frei wählbar** oder faktisch immer 5?~~
   — **beantwortet:** frei, `calculateDeepThreshold(temperature, gravity,
   volcanism)` = `floor(-8 + t·3 + g·2 + v·3)`, Bereich −8…0, für einen
   durchschnittlichen Körper **−7**. Die 5 ist nur der Funktions-Default.
10. **Liegt das Biom auch für z > 0 vor** oder nur für z = 0 und z < 0?
   (`PlanetSurface.tsx:802` fragt jede Ebene ab.)
11. **Grenzt `deep_ocean` je direkt an Land?** Der Versuch zeigt: Sand, der in
    Tiefsee ausläuft, ist kein Darstellungsfehler, sondern ein Kartenfehler —
    zwischen Land und `deep_ocean` gehört `shallow_water`.

### An Live-Daten zu messen — erledigt

12. ~~**Grenzzellenanteil**~~ — **gemessen, § 6.4:** 2,25 % im Mittel über 13
    Typen, 1,49 % bis 3,85 % je Typ, **7,74 % im schlechtesten Einzelfenster**.
13. ~~**Anteil der Mischzellen**~~ — **gemessen: 0,00–0,01 %.** § 7.3 ist ein
    Randfall.
14. ~~**Typische Fleckengröße**~~ — **gemessen: Median 337–1308 Zellen**,
    Flächen unter 10 Zellen 0,0 %. Keine gesprenkelten Karten.

Gemessen wurde am Produktionsgenerator statt am Gerät (§ 6.4). Offen bleibt
davon nur die **Zeichenzeit** auf echter Hardware.

---

## 10. Wie diese Zahlen wieder erzeugt werden

```bash
node scripts/tiles-uebergang-vergleich.cjs   # Messung, Kacheln, Aufnahmen (~12 s warm)
node scripts/tiles-uebergang-bogen.cjs       # setzt daraus den Bogen zusammen
```

Schreibt ausschließlich nach `assets/style-test/tiles/_uebergang_*`:
63 Aufnahmen, 90 gebackene Kacheln samt Mips, `_uebergang_zahlen.txt`,
`_uebergang_tabelle.md` (die Tabelle in § 11), `_uebergang_tabelle.html` und
`_uebergang_data.json`. Das zweite Script setzt daraus und aus der Vorlage
`scripts/tiles-uebergang-bogen.tpl.html` den Bogen `_uebergang_vergleich.html`
zusammen — alle Zahlen darin kommen aus dem JSON, keine ist abgeschrieben. Der Messcache `_uebergang_metrics.json` übernimmt beim ersten
Lauf die unveränderten Zeilen aus `_transition_metrics.json` und misst nur die
seither angefassten Kacheln neu; zum vollständigen Neumessen beide Dateien
löschen (rund 3 min).

---

## 11. Anhang — alle 131 Paare

Sortiert: **GEBACKEN** zuerst, dann OFFEN, dann ENTFÄLLT, dann ALPHA.
`d` ist der optische Abstand und **entscheidet nichts** (§ 2.2), er steht als
Beobachtung. `min MESO` ist die schwächer strukturierte der beiden Kacheln —
ab etwa 12 ist Struktur-Ghosting zu erwarten, als Prüfliste brauchbar, als
Klassifikator überfeuernd (§ 2.6).

| Paar | trifft sich auf | Grenzart | Verfahren | d | min MESO | Begründung |
|---|---|---|---|---|---|---|
| `ice_cavern` \| `mineral_vein` | UG EISIG — Eisig Tiefe 1..min(5,T-1) | Bruchkante (Eis gegen Fels) | **GEBACKEN** | 0.54 | 12.6 | Familienwechsel Eis/Mineralisch, kein Verlauf |
| `ash_field` \| `basalt_plain` | VOLCANIC / MOON_VOLCANIC | Deckenrand (basalt_plain) | **GEBACKEN** | 0.40 | 12.1 | Ausnahme basalt_plain: erstarrte Decke mit Rand (Rudi) |
| `basalt_plain` \| `caldera` | VOLCANIC / MOON_VOLCANIC | Deckenrand (basalt_plain) | **GEBACKEN** | 1.40 | 12.1 | Ausnahme basalt_plain: erstarrte Decke mit Rand (Rudi) |
| `basalt_plain` \| `fumarole` | VOLCANIC / MOON_VOLCANIC | Deckenrand (basalt_plain) | **GEBACKEN** | 0.42 | 12.1 | Ausnahme basalt_plain: erstarrte Decke mit Rand (Rudi) |
| `basalt_plain` \| `lava_flow` | VOLCANIC / MOON_VOLCANIC | Deckenrand (basalt_plain) | **GEBACKEN** | 1.25 | 12.1 | Ausnahme basalt_plain: erstarrte Decke mit Rand (Rudi) |
| `basalt_plain` \| `obsidian_ridge` | VOLCANIC / MOON_VOLCANIC | Deckenrand (basalt_plain) | **GEBACKEN** | 0.85 | 12.1 | Ausnahme basalt_plain: erstarrte Decke mit Rand (Rudi) |
| `mountain` \| `ocean` | EARTH_LIKE | Kliff (Wasser gegen Steilkante) | **GEBACKEN** | 1.63 | 12.2 | Familienwechsel Mineralisch/Wasser, kein Verlauf |
| `ocean` \| `snow_peak` | EARTH_LIKE | Kliff (Wasser gegen Steilkante) | **GEBACKEN** | 1.32 | 8.6 | Familienwechsel Wasser/Mineralisch, kein Verlauf |
| `beach` \| `forest` | EARTH_LIKE | Vegetationslinie | **GEBACKEN** | 0.43 | 3.6 | Familienwechsel Mineralisch/Vegetation, kein Verlauf |
| `beach` \| `plains` | EARTH_LIKE | Vegetationslinie | **GEBACKEN** | 1.08 | 3.6 | Familienwechsel Mineralisch/Vegetation, kein Verlauf |
| `beach` \| `swamp` | EARTH_LIKE | Vegetationslinie | **GEBACKEN** | 0.46 | 3.6 | Familienwechsel Mineralisch/Vegetation, kein Verlauf |
| `desert_patch` \| `forest` | EARTH_LIKE | Vegetationslinie | **GEBACKEN** | 1.61 | 6.5 | Familienwechsel Mineralisch/Vegetation, kein Verlauf |
| `desert_patch` \| `plains` | EARTH_LIKE | Vegetationslinie | **GEBACKEN** | 1.04 | 7.3 | Familienwechsel Mineralisch/Vegetation, kein Verlauf |
| `desert_patch` \| `swamp` | EARTH_LIKE | Vegetationslinie | **GEBACKEN** | 1.43 | 5.5 | Familienwechsel Mineralisch/Vegetation, kein Verlauf |
| `forest` \| `mountain` | EARTH_LIKE | Vegetationslinie | **GEBACKEN** | 0.54 | 6.5 | Familienwechsel Vegetation/Mineralisch, kein Verlauf |
| `forest` \| `snow_peak` | EARTH_LIKE | Vegetationslinie | **GEBACKEN** | 1.11 | 6.5 | Familienwechsel Vegetation/Mineralisch, kein Verlauf |
| `mountain` \| `plains` | EARTH_LIKE | Vegetationslinie | **GEBACKEN** | 0.53 | 15.5 | Familienwechsel Mineralisch/Vegetation, kein Verlauf |
| `mountain` \| `swamp` | EARTH_LIKE | Vegetationslinie | **GEBACKEN** | 0.44 | 5.5 | Familienwechsel Mineralisch/Vegetation, kein Verlauf |
| `plains` \| `snow_peak` | EARTH_LIKE | Vegetationslinie | **GEBACKEN** | 0.69 | 8.6 | Familienwechsel Vegetation/Mineralisch, kein Verlauf |
| `snow_peak` \| `swamp` | EARTH_LIKE | Vegetationslinie | **GEBACKEN** | 0.90 | 5.5 | Familienwechsel Mineralisch/Vegetation, kein Verlauf |
| `boulder_field` \| `void_edge` | ASTEROID_S | — | **OFFEN** | 1.82 | 28.1 | void_edge — Motiv ungeklaert |
| `impact_crater` \| `void_edge` | ASTEROID_S | — | **OFFEN** | 1.28 | 15.2 | void_edge — Motiv ungeklaert |
| `silicate_plain` \| `void_edge` | ASTEROID_S | — | **OFFEN** | 3.39 | 2.7 | void_edge — Motiv ungeklaert |
| `cave_floor` \| `deep_stone` | UG STANDARD | familienintern | **ENTFAELLT** | 1.17 | 15.1 | nie auf derselben z-Ebene aufloesbar |
| `deep_stone` \| `ice_cavern` | UG EISIG | — | **ENTFAELLT** | 0.55 | 15.1 | nie auf derselben z-Ebene aufloesbar |
| `deep_stone` \| `rock_layer` | UG STANDARD | familienintern | **ENTFAELLT** | 0.31 | 10.3 | nie auf derselben z-Ebene aufloesbar |
| `magma_pocket` \| `rock_layer` | UG VULKANISCH, UG KERN | Verlauf | **ENTFAELLT** | 1.42 | 10.3 | nie auf derselben z-Ebene aufloesbar |
| `acid_lake` \| `chemical_vent` | TOXIC | Verlauf | **ALPHA** | 1.96 | 6.6 | sinnvoller Verlauf: Saeure ueber Schlot |
| `acid_lake` \| `corroded_plain` | TOXIC | Verlauf | **ALPHA** | 2.20 | 8.2 | sinnvoller Verlauf: Saeure ueber zerfressenem Grund |
| `acid_lake` \| `crystal_field` | TOXIC | Verlauf | **ALPHA** | 1.87 | 11.5 | sinnvoller Verlauf: Saeure ueber Kristallfeld |
| `acid_lake` \| `toxic_marsh` | TOXIC | Verlauf | **ALPHA** | 2.13 | 7.8 | sinnvoller Verlauf: Saeure ueber Marsch |
| `ash_field` \| `caldera` | VOLCANIC / MOON_VOLCANIC | familienintern | **ALPHA** | 1.32 | 15.8 | gleiche Materialfamilie (Vulkanisch) |
| `ash_field` \| `fumarole` | VOLCANIC / MOON_VOLCANIC | familienintern | **ALPHA** | 0.59 | 15.0 | gleiche Materialfamilie (Vulkanisch) |
| `ash_field` \| `lava_flow` | VOLCANIC / MOON_VOLCANIC | familienintern | **ALPHA** | 0.96 | 15.8 | gleiche Materialfamilie (Vulkanisch) |
| `ash_field` \| `obsidian_ridge` | VOLCANIC / MOON_VOLCANIC | familienintern | **ALPHA** | 0.54 | 15.8 | gleiche Materialfamilie (Vulkanisch) |
| `beach` \| `desert_patch` | EARTH_LIKE | familienintern | **ALPHA** | 1.85 | 3.6 | gleiche Materialfamilie (Mineralisch) |
| `beach` \| `mountain` | EARTH_LIKE | familienintern | **ALPHA** | 0.73 | 3.6 | gleiche Materialfamilie (Mineralisch) |
| `beach` \| `ocean` | EARTH_LIKE | Verlauf | **ALPHA** | 1.59 | 3.6 | sinnvoller Verlauf: Wasser ueber Sand = flaches Wasser |
| `beach` \| `snow_peak` | EARTH_LIKE | familienintern | **ALPHA** | 1.12 | 3.6 | gleiche Materialfamilie (Mineralisch) |
| `boulder_field` \| `dust_basin` | ASTEROID_M | familienintern | **ALPHA** | 2.04 | 4.2 | gleiche Materialfamilie (Mineralisch) |
| `boulder_field` \| `impact_crater` | ASTEROID_M, ASTEROID_S | familienintern | **ALPHA** | 1.29 | 15.2 | gleiche Materialfamilie (Mineralisch) |
| `boulder_field` \| `metallic_surface` | ASTEROID_M | familienintern | **ALPHA** | 1.37 | 11.0 | gleiche Materialfamilie (Mineralisch) |
| `boulder_field` \| `silicate_plain` | ASTEROID_S | familienintern | **ALPHA** | 2.88 | 2.7 | gleiche Materialfamilie (Mineralisch) |
| `caldera` \| `fumarole` | VOLCANIC / MOON_VOLCANIC | familienintern | **ALPHA** | 1.27 | 15.0 | gleiche Materialfamilie (Vulkanisch) |
| `caldera` \| `lava_flow` | VOLCANIC / MOON_VOLCANIC | familienintern | **ALPHA** | 1.29 | 25.3 | gleiche Materialfamilie (Vulkanisch) |
| `caldera` \| `obsidian_ridge` | VOLCANIC / MOON_VOLCANIC | familienintern | **ALPHA** | 1.32 | 25.3 | gleiche Materialfamilie (Vulkanisch) |
| `canyon` \| `mesa` | DESERT | familienintern | **ALPHA** | 0.48 | 6.4 | gleiche Materialfamilie (Mineralisch) |
| `canyon` \| `oasis` | DESERT | Verlauf | **ALPHA** | 0.22 | 6.4 | sinnvoller Verlauf: Wasser am Fuss der Wand |
| `canyon` \| `rocky_desert` | DESERT | familienintern | **ALPHA** | 0.12 | 6.4 | gleiche Materialfamilie (Mineralisch) |
| `canyon` \| `salt_flat` | DESERT | familienintern | **ALPHA** | 0.90 | 4.9 | gleiche Materialfamilie (Mineralisch) |
| `canyon` \| `sand_dunes` | DESERT | familienintern | **ALPHA** | 0.85 | 6.4 | gleiche Materialfamilie (Mineralisch) |
| `carbon_crust` \| `dust_basin` | ASTEROID_C | familienintern | **ALPHA** | 1.56 | 4.2 | gleiche Materialfamilie (Mineralisch) |
| `carbon_crust` \| `fractured_zone` | ASTEROID_C | familienintern | **ALPHA** | 0.32 | 13.3 | gleiche Materialfamilie (Mineralisch) |
| `carbon_crust` \| `silicate_plain` | ASTEROID_C | familienintern | **ALPHA** | 2.79 | 2.7 | gleiche Materialfamilie (Mineralisch) |
| `cave_floor` \| `mineral_vein` | UG STANDARD — Standard Tiefe 1-3 | familienintern | **ALPHA** | 1.12 | 12.6 | gleiche Materialfamilie (Mineralisch) |
| `cave_floor` \| `rock_layer` | UG STANDARD — Standard Tiefe 1-3 | familienintern | **ALPHA** | 1.15 | 10.3 | gleiche Materialfamilie (Mineralisch) |
| `chemical_vent` \| `corroded_plain` | TOXIC | familienintern | **ALPHA** | 0.43 | 6.6 | gleiche Materialfamilie (Chemisch) |
| `chemical_vent` \| `crystal_field` | TOXIC | familienintern | **ALPHA** | 0.36 | 6.6 | gleiche Materialfamilie (Chemisch) |
| `chemical_vent` \| `toxic_marsh` | TOXIC | familienintern | **ALPHA** | 0.32 | 6.6 | gleiche Materialfamilie (Chemisch) |
| `corroded_plain` \| `crystal_field` | TOXIC | familienintern | **ALPHA** | 0.70 | 8.2 | gleiche Materialfamilie (Chemisch) |
| `corroded_plain` \| `toxic_marsh` | TOXIC | familienintern | **ALPHA** | 0.17 | 7.8 | gleiche Materialfamilie (Chemisch) |
| `crater` \| `dust_plain` | BARREN / MOON_ROCKY | familienintern | **ALPHA** | 2.04 | 1.0 | gleiche Materialfamilie (Mineralisch) |
| `crater` \| `regolith` | BARREN / MOON_ROCKY | familienintern | **ALPHA** | 1.51 | 9.7 | gleiche Materialfamilie (Mineralisch) |
| `crater` \| `rocky_outcrop` | BARREN / MOON_ROCKY | familienintern | **ALPHA** | 0.49 | 25.8 | gleiche Materialfamilie (Mineralisch) |
| `crevasse` \| `frozen_lake` | ICE / MOON_ICY | familienintern | **ALPHA** | 0.98 | 0.9 | gleiche Materialfamilie (Eis) |
| `crevasse` \| `glacier` | ICE / MOON_ICY | familienintern | **ALPHA** | 0.52 | 9.0 | gleiche Materialfamilie (Eis) |
| `crevasse` \| `ice_shelf` | ICE / MOON_ICY | Verlauf | **ALPHA** | 2.03 | 9.0 | sinnvoller Verlauf: Eis gegen Wasser |
| `crevasse` \| `permafrost` | ICE / MOON_ICY | familienintern | **ALPHA** | 0.86 | 6.9 | gleiche Materialfamilie (Eis) |
| `crevasse` \| `tundra` | ICE / MOON_ICY | familienintern | **ALPHA** | 0.80 | 3.2 | gleiche Materialfamilie (Eis) |
| `crystal_field` \| `toxic_marsh` | TOXIC | familienintern | **ALPHA** | 0.61 | 7.8 | gleiche Materialfamilie (Chemisch) |
| `deep_ocean` \| `island` | OCEAN | Verlauf | **ALPHA** | 2.13 | 3.6 | sinnvoller Verlauf: Steilkueste = Tiefenzunahme |
| `deep_ocean` \| `kelp_forest` | OCEAN | familienintern | **ALPHA** | 1.42 | 11.4 | gleiche Materialfamilie (Wasser) |
| `deep_ocean` \| `reef` | OCEAN | familienintern | **ALPHA** | 1.03 | 9.9 | gleiche Materialfamilie (Wasser) |
| `deep_ocean` \| `shallow_water` | OCEAN | familienintern | **ALPHA** | 1.10 | 7.8 | gleiche Materialfamilie (Wasser) |
| `deep_ocean` \| `volcanic_vent` | OCEAN | familienintern | **ALPHA** | 0.75 | 11.4 | gleiche Materialfamilie (Wasser) |
| `deep_stone` \| `mineral_vein` | UG STANDARD, UG EISIG — Standard Tiefe 4..T-1 | familienintern | **ALPHA** | 0.17 | 12.6 | gleiche Materialfamilie (Mineralisch) |
| `desert_patch` \| `mountain` | EARTH_LIKE | familienintern | **ALPHA** | 1.38 | 7.3 | gleiche Materialfamilie (Mineralisch) |
| `desert_patch` \| `ocean` | EARTH_LIKE | Verlauf | **ALPHA** | 2.46 | 7.3 | sinnvoller Verlauf: Wasser ueber Sand |
| `desert_patch` \| `snow_peak` | EARTH_LIKE | familienintern | **ALPHA** | 1.28 | 7.3 | gleiche Materialfamilie (Mineralisch) |
| `dust_basin` \| `fractured_zone` | ASTEROID_C | familienintern | **ALPHA** | 1.40 | 4.2 | gleiche Materialfamilie (Mineralisch) |
| `dust_basin` \| `impact_crater` | ASTEROID_M | familienintern | **ALPHA** | 1.43 | 4.2 | gleiche Materialfamilie (Mineralisch) |
| `dust_basin` \| `metallic_surface` | ASTEROID_M | familienintern | **ALPHA** | 1.24 | 4.2 | gleiche Materialfamilie (Mineralisch) |
| `dust_basin` \| `silicate_plain` | ASTEROID_C | familienintern | **ALPHA** | 1.25 | 2.7 | gleiche Materialfamilie (Mineralisch) |
| `dust_plain` \| `regolith` | BARREN / MOON_ROCKY | familienintern | **ALPHA** | 1.16 | 1.0 | gleiche Materialfamilie (Mineralisch) |
| `dust_plain` \| `rocky_outcrop` | BARREN / MOON_ROCKY | familienintern | **ALPHA** | 2.08 | 1.0 | gleiche Materialfamilie (Mineralisch) |
| `forest` \| `ocean` | EARTH_LIKE | Verlauf | **ALPHA** | 1.64 | 6.5 | sinnvoller Verlauf: ueberflutete Baumgrenze (Mangrovenlogik) |
| `forest` \| `plains` | EARTH_LIKE | familienintern | **ALPHA** | 0.94 | 6.5 | gleiche Materialfamilie (Vegetation) |
| `forest` \| `swamp` | EARTH_LIKE | familienintern | **ALPHA** | 0.26 | 5.5 | gleiche Materialfamilie (Vegetation) |
| `fractured_zone` \| `silicate_plain` | ASTEROID_C | familienintern | **ALPHA** | 2.59 | 2.7 | gleiche Materialfamilie (Mineralisch) |
| `frozen_lake` \| `glacier` | ICE / MOON_ICY | familienintern | **ALPHA** | 0.99 | 0.9 | gleiche Materialfamilie (Eis) |
| `frozen_lake` \| `ice_shelf` | ICE / MOON_ICY | Verlauf | **ALPHA** | 1.65 | 0.9 | sinnvoller Verlauf: gefrorenes gegen offenes Wasser — Eisrand |
| `frozen_lake` \| `permafrost` | ICE / MOON_ICY | familienintern | **ALPHA** | 1.15 | 0.9 | gleiche Materialfamilie (Eis) |
| `frozen_lake` \| `tundra` | ICE / MOON_ICY | familienintern | **ALPHA** | 0.94 | 0.9 | gleiche Materialfamilie (Eis) |
| `fumarole` \| `lava_flow` | VOLCANIC / MOON_VOLCANIC | familienintern | **ALPHA** | 1.13 | 15.0 | gleiche Materialfamilie (Vulkanisch) |
| `fumarole` \| `obsidian_ridge` | VOLCANIC / MOON_VOLCANIC | familienintern | **ALPHA** | 0.95 | 15.0 | gleiche Materialfamilie (Vulkanisch) |
| `glacier` \| `ice_shelf` | ICE / MOON_ICY | Verlauf | **ALPHA** | 2.03 | 9.0 | sinnvoller Verlauf: Gletscher kalbt ins Wasser |
| `glacier` \| `permafrost` | ICE / MOON_ICY | familienintern | **ALPHA** | 0.99 | 6.9 | gleiche Materialfamilie (Eis) |
| `glacier` \| `tundra` | ICE / MOON_ICY | familienintern | **ALPHA** | 0.91 | 3.2 | gleiche Materialfamilie (Eis) |
| `ice_shelf` \| `permafrost` | ICE / MOON_ICY | Verlauf | **ALPHA** | 2.13 | 6.9 | sinnvoller Verlauf: Wasser ueber Frostboden |
| `ice_shelf` \| `tundra` | ICE / MOON_ICY | Verlauf | **ALPHA** | 2.05 | 3.2 | sinnvoller Verlauf: Wasser/Eis ueber Frostgrus |
| `impact_crater` \| `metallic_surface` | ASTEROID_M | familienintern | **ALPHA** | 0.73 | 11.0 | gleiche Materialfamilie (Mineralisch) |
| `impact_crater` \| `silicate_plain` | ASTEROID_S | familienintern | **ALPHA** | 2.60 | 2.7 | gleiche Materialfamilie (Mineralisch) |
| `island` \| `kelp_forest` | OCEAN | Verlauf | **ALPHA** | 1.23 | 3.6 | sinnvoller Verlauf: Wasser ueber Bewuchs |
| `island` \| `reef` | OCEAN | Verlauf | **ALPHA** | 1.30 | 3.6 | sinnvoller Verlauf: Riffsaum um die Insel |
| `island` \| `shallow_water` | OCEAN | Verlauf | **ALPHA** | 1.55 | 3.6 | sinnvoller Verlauf: Wasser ueber Sandbank |
| `island` \| `volcanic_vent` | OCEAN | Verlauf | **ALPHA** | 1.49 | 3.6 | sinnvoller Verlauf: Wasser ueber Vulkangrund |
| `kelp_forest` \| `reef` | OCEAN | familienintern | **ALPHA** | 0.51 | 9.9 | gleiche Materialfamilie (Wasser) |
| `kelp_forest` \| `shallow_water` | OCEAN | familienintern | **ALPHA** | 0.64 | 7.8 | gleiche Materialfamilie (Wasser) |
| `kelp_forest` \| `volcanic_vent` | OCEAN | familienintern | **ALPHA** | 0.72 | 12.2 | gleiche Materialfamilie (Wasser) |
| `lava_flow` \| `obsidian_ridge` | VOLCANIC / MOON_VOLCANIC | familienintern | **ALPHA** | 0.69 | 28.0 | gleiche Materialfamilie (Vulkanisch) |
| `magma_pocket` \| `mineral_vein` | UG VULKANISCH, UG KERN — Vulkanisch Tiefe 3..min(5,T-1); Tiefer Kern rebasiert 3-5 | Verlauf | **ALPHA** | 1.33 | 12.6 | sinnvoller Verlauf: Magma an der Ader |
| `mesa` \| `oasis` | DESERT | Verlauf | **ALPHA** | 0.30 | 8.7 | sinnvoller Verlauf: Wasser am Fuss der Wand |
| `mesa` \| `rocky_desert` | DESERT | familienintern | **ALPHA** | 0.46 | 6.9 | gleiche Materialfamilie (Mineralisch) |
| `mesa` \| `salt_flat` | DESERT | familienintern | **ALPHA** | 0.94 | 4.9 | gleiche Materialfamilie (Mineralisch) |
| `mesa` \| `sand_dunes` | DESERT | familienintern | **ALPHA** | 0.51 | 12.8 | gleiche Materialfamilie (Mineralisch) |
| `mineral_vein` \| `rock_layer` | UG STANDARD, UG VULKANISCH, UG KERN — Standard Tiefe 1-3; Vulkanisch Tiefe 1-2; Tiefer Kern rebasiert 0-2 | familienintern | **ALPHA** | 0.16 | 10.3 | gleiche Materialfamilie (Mineralisch) |
| `mountain` \| `snow_peak` | EARTH_LIKE | familienintern | **ALPHA** | 0.88 | 8.6 | gleiche Materialfamilie (Mineralisch) |
| `oasis` \| `rocky_desert` | DESERT | Verlauf | **ALPHA** | 0.19 | 6.9 | sinnvoller Verlauf: Wasser ueber Fels |
| `oasis` \| `salt_flat` | DESERT | Verlauf | **ALPHA** | 0.83 | 4.9 | sinnvoller Verlauf: Salzseerand: Wasser verdunstet in die Kruste |
| `oasis` \| `sand_dunes` | DESERT | Verlauf | **ALPHA** | 0.71 | 8.7 | sinnvoller Verlauf: Wasser ueber Sand |
| `ocean` \| `plains` | EARTH_LIKE | Verlauf | **ALPHA** | 1.79 | 12.2 | sinnvoller Verlauf: ueberflutete Wiese |
| `ocean` \| `swamp` | EARTH_LIKE | Verlauf | **ALPHA** | 1.61 | 5.5 | sinnvoller Verlauf: Marsch ist selbst Uebergangszone Wasser/Land |
| `permafrost` \| `tundra` | ICE / MOON_ICY | familienintern | **ALPHA** | 0.24 | 3.2 | gleiche Materialfamilie (Eis) |
| `plains` \| `swamp` | EARTH_LIKE | familienintern | **ALPHA** | 0.76 | 5.5 | gleiche Materialfamilie (Vegetation) |
| `reef` \| `shallow_water` | OCEAN | familienintern | **ALPHA** | 0.42 | 7.8 | gleiche Materialfamilie (Wasser) |
| `reef` \| `volcanic_vent` | OCEAN | familienintern | **ALPHA** | 0.34 | 9.9 | gleiche Materialfamilie (Wasser) |
| `regolith` \| `rocky_outcrop` | BARREN / MOON_ROCKY | familienintern | **ALPHA** | 1.29 | 9.7 | gleiche Materialfamilie (Mineralisch) |
| `rocky_desert` \| `salt_flat` | DESERT | familienintern | **ALPHA** | 0.87 | 4.9 | gleiche Materialfamilie (Mineralisch) |
| `rocky_desert` \| `sand_dunes` | DESERT | familienintern | **ALPHA** | 0.85 | 6.9 | gleiche Materialfamilie (Mineralisch) |
| `salt_flat` \| `sand_dunes` | DESERT | familienintern | **ALPHA** | 1.28 | 4.9 | gleiche Materialfamilie (Mineralisch) |
| `shallow_water` \| `volcanic_vent` | OCEAN | familienintern | **ALPHA** | 0.63 | 7.8 | gleiche Materialfamilie (Wasser) |

---

*PLAN-biome-uebergaenge.md — Trade Empire Frontend | September 2026*
