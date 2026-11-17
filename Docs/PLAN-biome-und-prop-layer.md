# Biome-Redesign und Prop-Layer — Stand und Plan

Stand 2026-09-06 (BARREN, ASTEROIDS **und** UNDERGROUND abgeschlossen). Zahlen aus dem Code
gemessen, nicht geschätzt: `src/views/grid/propThemes.ts`, `src/assets/tiles/`,
`src/assets/tiles/biome-overview.html`.

---

## 1. Wo wir stehen

**Kacheln: 55 von 55 überarbeitet. KEINE offen.** Mit UNDERGROUND ist die letzte
Familie geschlossen; in `biome-overview.html` trägt kein Biom mehr das Abzeichen
„Batch 1".

| Familie | offen | Biome |
|---|---|---|
| ~~BARREN~~ | **0** | ✅ **abgeschlossen 2026-09-05** — regolith, crater, dust_plain, rocky_outcrop |
| ~~ASTEROIDS~~ | **0** | ✅ **abgeschlossen 2026-09-05** — metallic_surface, impact_crater, boulder_field, dust_basin, carbon_crust, silicate_plain, fractured_zone, void_edge |
| ~~UNDERGROUND~~ | **0** | ✅ **abgeschlossen 2026-09-06** — rock_layer, deep_stone, mineral_vein, ice_cavern (cave_floor und magma_pocket waren schon fertig) |

`silicate_plain` gehört zu **ASTEROIDS**, nicht zu BARREN. Die Zuordnung ist
mehrfach verwechselt worden; maßgeblich ist diese Tabelle.

**Damit ist der Prop-Layer die einzige offene Asset-Arbeit** — siehe § 6.

### BARREN im Endzustand

| Biom | p70 | meso | m4/p70 | Raster | Naht | was gemacht wurde |
|---|---|---|---|---|---|---|
| regolith | 141.3 | 10.09 | 7.32 | 21.11 | 2.29 | Slot 2 ersetzt, Slot 3 entgelbt |
| dust_plain | 161.5 | 1.02 | 1.35 | 2.61 | 1.14 | Slots 2/3 neu, Slot 0 entgelbt |
| rocky_outcrop | 86 | 26.3–31.3 | — | 15.17 | 1.49 | ganzer Satz neu gegradet, Slot 0 = `latticeRoll(128,64)` des Slot-1-Heros |
| crater | 60 | 12.42 | 10.81 | **5.21** | **1.23** | kompletter Neuaufbau aus regolith; vorher 46.70 / 9.30 — die schlechteste Kachelung im Bestand |

`crater` ist der Beleg für die Arbeitsteilung aus § 4: die Mulden sind
**Vertiefungen in der Kachel**, flach gehalten, und der Pegel trägt die Trennung
zu `regolith` (d′-Pegelbein 6.67 → 10.52). Die Blöcke am Kraterrand bleiben dem
Prop-Layer vorbehalten.

### ASTEROIDS im Endzustand

Acht Biome über drei Asteroidentypen (M: metallic_surface, impact_crater,
boulder_field, dust_basin · C: carbon_crust, silicate_plain, fractured_zone,
dust_basin · S: silicate_plain, impact_crater, void_edge, boulder_field).

| Biom | p70 | meso | m4/p70 | Raster | Naht | was gemacht wurde |
|---|---|---|---|---|---|---|
| metallic_surface | 92 | 10.8–13.9 | 8.7–12.2 | **8.18** ← 40.47 | **1.60** ← 4.29 | Materialwechsel: bläulicher Stahl B/R 1.18 + rötlicher Rost B/R 0.70 über prozedurales Torus-Rauschen, matt statt glänzend (Knie 1.4×p70), Slot 0 = `latticeRoll(256,64)` von Slot 3 |
| impact_crater | 62 | 14.2–20.9 | 10.1–12.5 | **5.20** ← 16.06 | **1.22** ← 4.48 | komplett aus `crater` abgeleitet: `latticeRoll(128,64)` + zweites Muldenfeld R8 / Tiefe 0.7 |
| dust_basin | 137 | 4.3–5.4 | 2.6–2.7 | **3.04** ← 32.02 | **1.25** ← 3.94 | vier Gitterversätze des eigenen Slot 1 — der einzige brauchbare Original-Slot |
| fractured_zone | 60 | 13.5–16.9 | 11.2–15.0 | **5.57** ← 20.33 | **1.11** ← 2.85 | Slot 0 neu (zweites Fenster des Slot-1-Heros), alle vier gerollt und auf B/R 1.150 gegradet |
| void_edge | 40 | 29.5–32.3 | 23.0–23.7 | **7.14** ← 20.48 | **1.59** ← 4.94 | vier Gitterversätze von `cave_floor_0`, danach abgedunkelt |
| silicate_plain | 212 (gehalten) | 2.7–3.2 | 1.9–2.9 | **4.23** ← 15.14 | **1.58** ← 3.56 | nur die Lichtrampe raus (58.6–86.9 → 0.0); Pegel, Farbton und Relief unverändert |
| boulder_field | 71 | 31.2–39.5 | 26.1–29.6 | 10.88 | 1.04 | fertig 2026-09-05 (nur Slot 2, Farbe + Feinband) |
| carbon_crust | 47.7 | 10.7–19.8 | 8.3–12.3 | 8.07 | 1.57 | fertig 2026-06-14 |

**Blowout 0.00 % auf allen sechs neu gebauten Sätzen**, Lichtrampe ≤ 1.1, und
keine Kachel korreliert über 0.111 gegen einen Nachbarn auf derselben Ebene.

**Kein einziger Slot wurde neu generiert — kein flux-Aufruf in der ganzen
Familie.** Acht Slots aus reinem Compositing, zwölf aus Gitterversätzen
vorhandener Kacheln, vier aus einer Material-/Farbschicht auf einem composited
Träger. Das ist die vierte Runde, in der die Vermutung „das müssen wir alles neu
machen" zu pessimistisch war.

### UNDERGROUND im Endzustand

Sechs Biome, vier davon in dieser Runde neu. Alle vier stehen auf **einer
gemeinsamen Erd-Basis** — die gab es im ursprünglichen Plan nicht, sie ist
Rudis Vorgabe: „wir machen erstmal eine basis aus dunkler feuchter brauner
erde. daraus leiten wir dann rock layer, deep stone und mineral vein ab."

| Biom | p70 | B/R | meso | micro8 | Raster | Naht | was gemacht wurde |
|---|---|---|---|---|---|---|---|
| rock_layer | 44 | 0.660 | 12.4–13.7 | 6.9–7.4 | **2.17** ← 23.07 | **1.04** ← 2.53 | Steinfeld λ 30–70 px, Deckung 18 %, Amplitude schwach, Pegel = Basis. Vorher waren Slot 0/3 je EIN konzentrischer Ring |
| deep_stone | 35 | 0.780 | 17.1–17.9 | 6.0 | **2.44** ← 15.20 | **1.07** ← 2.38 | λ 55–130 px, Deckung 42 %, Amplitude stark, Pegel −9, kühler und entsättigt; vorher `bandScale(kMeso 0.60)` auf der Basis |
| mineral_vein | 40 | 0.777\* | 14.9–15.9 | 6.8–7.0 | **2.36** ← 22.52 | **1.02** ← 1.19 | λ 40–95 px, Deckung 22 %, Amplitude mittel, Pegel −4, zweiter Farbton über `corrode()` + metallischer Glanz |
| ice_cavern | 56 | 1.243 | 14.3–21.0 | 5.6–6.8 | **5.07** ← 35.20 | **1.47** ← 2.60 | komplett ersetzt, aus `crystal_field`; Slot 0/1 Gitterversatz, Slot 2/3 flux |
| cave_floor | 71.8 | 1.070 | 29.4 | 16.8 | 17.67 | 2.72 | fertig 2026-06-26, unangetastet |
| magma_pocket | 32.2 | 0.797 | 34.4 | 9.3 | 14.36 | 1.65 | fertig 2026-06-26, unangetastet |

\* Kachelmittel zweier Materialien: Grund B/R 0.669–0.677, Erzbrocken 1.096–1.104.

**Blowout 0.00 % auf allen vier neuen Sätzen**, Lichtrampe ≤ 0.2 (ice_cavern
≤ 0.9), und keine Kachel korreliert über **0.100** gegen einen Nachbarn auf
derselben z-Ebene. Der Zoom-Beweis lief mit: alle 96 Mip-Dateien korrelieren
1.000 mit der neuen Kachel und ≤ 0.086 mit der alten.

Ein Befund für den Prop-Layer: **auf echter Spielskala (48×24 px) trennen sich
`rock_layer` und `mineral_vein` kaum** — die Erzbrocken sind dort 3 px. Ab dem
4×-Mip deutlich. Rudi hat das ausdrücklich akzeptiert; falls es später doch
stören sollte, liegt die Erz-Leiter (o1: Brocken B/R 1.45, λ 50–110, Deckung
26 %) im Bogen und ist ein Einzeiler in `scripts/tiles-underground-stones.cjs`.

**Prop-Layer: 20 von 55 Biome haben einen, 35 nicht — und das ist ab jetzt die
einzige offene Asset-Arbeit.** (Stand 2026-09-11, nach der FROZEN-Runde:
`ice_block` und `ice_rubble` verdrahtet auf glacier, permafrost, tundra und
crevasse — siehe § 3.1 und § 6.)

---

## 2. ✅ Behoben: `tundra` streut keine Sträucher mehr

**Der `shrub`-Eintrag ist entfernt.** Das Biom war zwei Runden lang propfrei und
trägt seit 2026-09-11 `ice_rubble` — seine eigene Familie, siehe unten.

Die Kachel wurde in der ICE-Runde **entpflanzt** — Vegetation entfernt,
staubiger Frostkies-Boden, ausgerichtet auf Ganymed und Kallisto. Die
`shrub`-Props setzten die Vegetation wieder obendrauf, gegen die Absicht der
Kachel.

**`rock_snow` wurde als vorhandener Ersatz geprüft und verworfen** (Zahlen im
Tundra-Absatz von `propThemes.ts`):

| Fläche | mittl. Luminanz | Lab L* | B/R |
|---|---|---|---|
| Kachel `tundra` | 58.0 | 24.3 | 0.819 |
| Kachel `snow_peak` | 84.1 | 35.7 | 1.322 |
| Prop `rock_snow` | 97.6 | 39.6 | 0.971 |

Gemessen über alle vier Kachel-Slots bzw. alle sechs Sprite-Varianten, nur
opake Pixel, L* als Mittel der Per-Pixel-Werte. **Nicht mit den Helligkeiten in
§ 5.3 vergleichen** — die stammen aus einer anderen Rechnung und liegen
systematisch höher; maßgeblich sind hier die Verhältnisse untereinander.

Auf `snow_peak` — dem Grund, für den die Sprites gezeichnet sind — liegt
`rock_snow` bei 1.16× der Grundhelligkeit und teilt den kühlen Stich. Auf
`tundra` sind es 1.68×, 53.9 % der Prop-Pixel sind heller als der Grund; das ist
lauter als die Sträucher (1.44×) und weit über dem, was ein Gesteinsset sonst
auf seinem Biom tut (`rock` auf `mountain`: 1.09×). Dazu der Farbstich:
neutral 0.97 auf warmem 0.82 ist die Fehlerart „Schwefelbrocken auf Caldera".
Inhaltlich passt es ohnehin nicht — es sind graue **Steine mit frischer
Schneehaube**, also Schneefall statt Bewuchs als zweite falsche Geschichte, und
die Hauben bringen genau das weiße Ausbrennen zurück, das die neue Kachel
losgeworden ist.

Kein anderes vorhandenes Set passt: `rock`/`rock_sand` sind Moos- und
Sandstein, `rock_arid` trifft zwar den Ton fast exakt (0.97× Luminanz, B/R
0.811), ist aber warmer Wüstenfels und kein Eis, die Vulkansets sind die
falsche Welt, und `ice_floe` ist mit Wasserlinie gezeichnet (siehe § 6.1).

→ **✅ ERLEDIGT 2026-09-11: Rudis eigentlicher Wunsch steht.** „Eisbrocken, die
verteilt auf dem boden liegen" ist die Familie `ice_rubble` (5 Varianten), und
`tundra` ist gemeinsam mit `permafrost` darauf verdrahtet — kein Stand-in,
sondern das Objekt, auf das gewartet wurde. Die `shrub`-Sprites bleiben
stillgelegt auf der Platte (nicht gelöscht, von keinem Biom benutzt).

**Nachtrag zur rock_snow-Verwerfung: sie war richtig, aber aus dem
zweitwichtigsten Grund.** Gegen die Familie gemessen, die tatsächlich
ausgeliefert wurde:

| | Pegel gegen tundra | Pegel gegen permafrost | B/R | Blowout > 200 |
|---|---|---|---|---|
| `rock_snow` (verworfen) | 1.68× | **1.93×** | 0.971 | **11.78 %** |
| `ice_rubble` (jetzt) | 1.25× | 1.43× | 1.029 | 0.00 % |

Der Pegel war schlimmer als aktenkundig (1.93× auf `permafrost`, nicht nur die
1.68× auf `tundra`). Ausschlaggebend ist aber der **Blowout**: die Schneehauben
sind eine kleine, sehr helle **Sub-Population**, kein Pegel. Der Beweis steht im
Kontaktbogen — `ice_rubble` auf `rock_snow`s eigenen Mittelwert gehoben (×1.356,
lum 98.3) brennt **immer noch zu 0.00 %** aus. Weder ein Höhenfaktor noch ein
Dichteband hätte das gerettet; beide skalieren Größe und Anzahl, keines nimmt
ein Glanzlicht aus einem Sprite.

Und die ehrliche Korrektur: **das Farbargument war das schwächste der drei.**
Die neue Familie ist mit B/R **1.087** (ice_block 1.169, ice_rubble 1.029)
*blauer* als `rock_snow` (0.971). Der Farbton hat `rock_snow` nicht
disqualifiziert — Pegel und Hauben haben es.

---

## 3. Prop-Layer: Ist-Zustand

### 3.1 Biome MIT Prop-Layer (20)

| Biom | Props | Dichte |
|---|---|---|
| forest | tree | 7–18 |
| swamp | swamp (Schilf + tote Bäume) | 4–12 |
| oasis | palm | 2–8 |
| plains | 2/5 leer, grass, bush, tree_leafy | 1–4 |
| beach | palm, driftwood, rock_arid (je 1/3) | 1–4 |
| desert_patch | 1/3 palm, 2/3 rock_sand | 1–4 |
| mountain | rock | 1–4 |
| rocky_desert | rock | 1–4 |
| snow_peak | rock_snow | 1–2 |
| ice_shelf | ice_floe | 1–2 |
| ash_field | 1/3 charred_tree, 2/3 rock_ash | 1–2 |
| basalt_plain | 3/5 basalt_column, 1/5 rock_ash, 1/5 charred_tree | 1–4 |
| caldera | 3/5 lava_rock, 1/5 lava_puddle, 1/5 charred_tree_ember | 1–4 |
| lava_flow | charred_tree_ember, lava_crust, lava_rock | 1–2 |
| obsidian_ridge | lava_rock | 1–4 |
| fumarole | 2/3 sulfur_vent, 1/3 sulfur_chunk | 1–2 |
| glacier | 2/3 ice_block, 1/3 leer · **minG 0** | 2–4 |
| permafrost | 2/3 ice_rubble, 1/3 leer · **minG 0** | 2–4 |
| tundra | 2/3 ice_rubble, 1/3 leer · Default minG | 2–4 |
| crevasse | ice_block | 1–2 |

Die vier FROZEN-Einträge sind seit 2026-09-11 verdrahtet (Höhenfaktoren
`ice_block` 0.45, `ice_rubble` 0.20). Gemessene Wirkung über das Live-`g`:
glacier/permafrost je 1.374/1.376 Props je Kachel bei 10.6 % leeren Kacheln und
44 % mit zweien, tundra 0.847 bei 46.1 % leer, crevasse 0.245 bei 75.5 % leer.
Begründungen und Zahlen stehen im FROZEN-Block von `propThemes.ts`.

### 3.2 Biome OHNE Prop-Layer (35)

Nicht alle brauchen einen. Nach Bedarf sortiert:

**Brauchen einen — hohe Priorität (8)**
Die Biome, deren Charakter ohne Objekte unvollständig bleibt:
`frozen_lake`, `boulder_field`,
`carbon_crust`, `cave_floor`, `magma_pocket`, `crystal_field`,
`corroded_plain`, `toxic_marsh`

> `frozen_lake` ist **bewusst** noch offen und kein Restposten: seine Kachel ist
> mit B/R 1.520 / lum 96.0 / sd 8.7 deutlich blauer, heller und glatter als die
> anderen drei Frostbiome. `ice_block` läse als graue Klötze auf blauer Platte,
> `ice_rubble` ist mit lum 72.5 **dunkler** als die Kachel und läse als Schutt.
> Es braucht ein eigenes Set (Schollenkanten, Presseisrücken) — eigener Auftrag.

**Brauchen einen — kommt mit der Kachel (4)**
Die noch offenen UNDERGROUND-Biome. Siehe Abschnitt 5.5.
Die vier BARREN- und die acht ASTEROIDS-Biome sind seit 2026-09-05 fertig, ihre
Props stehen aber noch aus — sie zaehlen ab jetzt in der Prioritaetsliste
darueber. Damit ist der Prop-Layer die groessere offene Baustelle, nicht die
Kacheln.

**Brauchen vermutlich keinen (13)**
Wasserflächen und bewusst leere Flächen:
`ocean`, `deep_ocean`, `shallow_water`, `reef`, `kelp_forest`, `island`,
`acid_lake`, `volcanic_vent`, `salt_flat`, `sand_dunes`, `canyon`, `mesa`,
`chemical_vent`

> Bei den Wasserbiomen ist das keine Faulheit: `ice_shelf` ist Wasser und
> bekommt seine Eisschollen als Props — das ist das Muster. Wo etwas AUF dem
> Wasser liegen soll, ist ein Prop richtig; die Wasserfläche selbst braucht
> keines.

---

## 4. Die tragende Lehre aus der ICE-Runde

**Props tragen die Plastizität, damit die Kachel flach bleiben darf.**

Das war der Befund, der `glacier` entblockte. Die Kachel sollte flach und
neutral sein, `crevasse` daneben strukturiert — aber ein Farbgrade senkt keine
Struktur. Erst als klar war, dass Eisblöcke und Séracs aus dem Prop-Layer
kommen, durfte die Kachel flach sein, ohne leer zu wirken.

Daraus folgt eine Arbeitsteilung, die für alle offenen Biome gilt:

| | Kachel | Prop-Layer |
|---|---|---|
| trägt | Grundton, Helligkeit, flächige Textur | Objekte, Plastizität, Wiedererkennung |
| Formen | **Vertiefungen** — Risse, Krater, Furchen | **Erhebungen** — Blöcke, Brocken, Säulen |

Die Grenze ist scharf und nützlich: **Löcher gehören in die Kachel, Objekte in
den Prop-Layer.** `crevasse` bekam seine Klüfte ins Tile, weil sie Vertiefungen
sind; `glacier` bekommt seine Blöcke als Props, weil sie daraufstehen.

### Aber: der Prop-Layer entlastet die Kachel NICHT

Rudi zu `rocky_outcrop`: „ähnliche rocks als prop layer generieren und auf den
rocky_outcrop tiles relativ dicht verteilen, das bringt dann noch deutlich mehr
varianz rein. **trotzdem muss die textur auch passen**."

Der Nachsatz ist die Regel. Props rechtfertigen keine schwache Kachel, aus drei
Gründen:

- Props sind **diskrete Objekte**. Zwischen ihnen ist die Kachel voll sichtbar.
- Auf den Zoomstufen, auf denen viele Kacheln im Bild sind, **schrumpfen Props
  zu Punkten**, während das Kachelfeld die ganze Fläche trägt.
- Die Prop-Dichte hängt an der Kachelhelligkeit (§ 5.1). Eine Kachel nach den
  Props zu tunen heißt, beide zweimal zu tunen.

→ **Eine Kachel wird ohne Prop-Layer abgenommen.** Erst wenn sie für sich steht,
kommen Props dazu.

### Vorgesehen: dichte Stein-Prop-Familie für `rocky_outcrop`

Als Varianzquelle über die vier Kacheln hinweg, Dichte **relativ dicht** —
deutlich über den 1–4 der Gesteinsbiome, näher an `forest` (7–18). Die Sprites
müssen der **Steinform der Kachel** folgen (gebrochene Platten mit
Bruchkanten, kühl-neutral bei B/R ≈ 1.2), sonst liegen sie wie aufgesetzt
darauf — das ist die Fehlerart „`rock_snow` auf `tundra`" aus § 2.

---

## 5. Protokoll: der Plan für die 14 offenen Biome, und was daraus wurde

### 5.1 Vorgehen: erst alle Kacheln, dann alle Props

> **Stand 2026-09-06: alle 14 ursprünglich offenen Biome sind fertig**
> (BARREN 4, ASTEROIDS 6 neu gebaute plus 2 schon vorher fertige,
> UNDERGROUND 4). Der ganze Abschnitt 5 steht ab jetzt nur noch als Protokoll
> dessen, was geplant war und was daraus wurde. **Damit ist die erste Hälfte
> von Rudis Reihenfolge abgearbeitet — „erst alle Kacheln, dann alle Props" —
> und § 6 ist die Arbeitsliste, die jetzt zählt.**

Rudis Reihenfolge, und sie ist richtig. Gründe:

- Die Prop-Dichte hängt an der Kachelhelligkeit (Kontrast der Objekte gegen den
  Grund). Props vor der finalen Kachel zu tunen heißt, sie zweimal zu tunen.
- Prop-Familien lassen sich über mehrere Biome teilen (`rock_arid` bedient heute
  schon drei). Das sieht man erst, wenn alle Kacheln stehen.
- Kachelarbeit ist inzwischen schnell — die Werkzeuge stehen.

### 5.2 Eine Vermessung vorweg, über alle drei Familien zusammen

Bei ICE hat sich die Familienvermessung **vor** der ersten Kachel bezahlt
gemacht. Hier ist sie noch wichtiger, weil die drei Familien sich inhaltlich
stark berühren: `regolith` / `dust_plain` / `dust_basin` / `silicate_plain`
sind alle „Staub auf Gestein".

**Zu klären, bevor gebaut wird:** Erscheinen BARREN- und ASTEROIDS-Biome je auf
demselben Körper? Nach der Spec-Gruppierung sind es getrennte Planetentypen —
dann dürfen `crater` und `impact_crater` einander ähneln, ebenso `dust_plain`
und `dust_basin`. **Das ist an `Docs/openapi.yaml` zu prüfen**, nicht
anzunehmen; es entscheidet, wie viel Trennungsarbeit nötig ist.

### 5.3 Die Kennzahl dieser Runde: Blowout

Wie bei ICE. Die offenen Biome sind heute die **hellsten Kacheln im ganzen
Bestand**:

```
silicate_plain  91.1      metallic_surface  47.6
dust_plain      75.8      (zum Vergleich: snow_peak 42.1, glacier 41.4)
regolith        61.4
```

Alle 41 fertigen liegen beim Blowout-Anteil unter 1 %; jede Kachel darüber ist
ein unangetastetes Original. Das ist der verlässlichste Indikator dafür, dass
eine Kachel noch nicht überarbeitet wurde — und die erste Schranke, die beim
Bauen zu reißen ist.

> **Nachtrag 2026-09-05, an ASTEROIDS gemessen: die Umkehrung gilt nicht.**
> Blowout ist eine brauchbare Schranke beim Bauen, aber kein
> Zustandsindikator. `impact_crater` (0.00–0.13 %), `fractured_zone`
> (0.00–0.08 %) und `void_edge` (0.00 %) waren allesamt unangetastete
> Originale. Was in dieser Familie tatsächlich trug, war das
> **Nahtverhältnis**: unbearbeitet 2.85–4.94, fertig 1.04–1.57. Und
> `silicate_plain` ist mit 47–70 % ausgeliefert und abgenommen.
> Siehe LESSONS § 5, Tabellenzeile „Blowout".

### 5.4 BARREN — ✅ ABGESCHLOSSEN 2026-09-05

Luftlose Gesteinswelten, Vorbild Mond und Merkur. Kacheln fertig, **Props
stehen noch aus** (§ 4: die Kachel ist ohne sie abgenommen).

| Biom | Kachel — Ergebnis | Props (offen) |
|---|---|---|
| **regolith** | Slot 2 ersetzt, Slot 3 entgelbt. Der geplante starke Abdunkler ist **nicht** gekommen — regolith bleibt bei p70 141.3, weil Rudi die drei anderen Slots als gut befunden hat. `glacier` bleibt damit gültig. | Feiner Grus, wenige kleine Steine |
| **crater** | Kompletter Neuaufbau aus regolith, p70 60. Mulden R8 / Tiefe 1.4 als Vertiefungen. **Keine hellen Auswurfstrahlen** — die hätten die Kachelung wieder zerstört, die vorher bei Raster 46.70 / Naht 9.30 lag. | Auswurfblöcke am Kraterrand |
| **dust_plain** | Slots 2/3 neu, Slot 0 entgelbt. Wie geplant behandelt: Lichtverlauf 0, Naht 1.14 als maßgebliche Zahl. | Kaum welche — die Leere ist der Charakter |
| **rocky_outcrop** | Ganzer Satz auf p70 86. Höchste Textur der Familie bestätigt (meso 26.3–31.3 gegen craters 12.4). Slot 0 zweimal verworfen, am Ende ein gerolltes Fenster des Slot-1-Heros. | Blöcke und Felsnasen, **dichter als der Rest** — siehe § 4 |

### 5.5 UNDERGROUND — ✅ ABGESCHLOSSEN 2026-09-06

Kacheln fertig, **Props stehen noch aus**. Endzustand und Zahlen in § 1.
`cave_floor` und `magma_pocket` waren schon fertig und blieben unangetastet.

**Die offene Frage der Lichtlogik ist beantwortet: die Vakuum-Abdunklung greift
unter Tage NICHT.** `isoConstants.atmosphereDarkening()` setzt
`factor = currentZ >= 0 ? airlessFactor(density) : 0`, und `litSwapActive()`
spiegelt dasselbe z-Gate. Damit entfällt die Prüfung, die bei ICE mitlief — und
die Pegelwahl verschiebt sich nach **unten**, weil kein Abdunkler mehr nachkommt.
Die Vakuum-Panels auf dem Kontaktbogen sind reine Diagnose.

**Geplant gegen tatsächlich — fünf Abweichungen:**

| | geplant war | gemacht wurde |
|---|---|---|
| **die Basis** | gar nichts — die vier Biome waren als Einzelarbeiten geplant | **eine gemeinsame nasse Erd-Basis, und sie war die halbe Runde.** Rudis Vorgabe. Quelle ist `permafrost_0`, nach dem Prinzip „ableiten nach dem, was die Dinge SIND" (LESSONS § 6): Permafrost IST gefrorener Boden, das Eis abgezogen bleibt genau der Grund — und es ist die einzige fertige Kachel im Korpus, die motivfreier gleichmäßiger Boden ist (Raster 2.89, Naht 1.13). Die erste Nass-Runde wirkte zu trocken, weil sie die nassen Stellen nur VERSCHOBEN und nicht GESPREIZT hat; Runde 2 macht Nässe als Feld aus drei maskierten Operatoren (Porenfüllung, asymmetrische Meso-Spreizung, Spiegellichter aus der eigenen Mikro-Geometrie). Gewählt: `w3_nass`, p70 44 / B/R 0.660 |
| **rock_layer** | „Geschichtetes Gestein, gerichtete Bänder. Ableitung aus `cave_floor` prüfen." | **weder geschichtet noch aus `cave_floor`.** `cave_floor` ist ein Feld großer loser Platten (meso 29.4) — das ist der Prop-Layer-Fall, nicht der Kachel-Fall (LESSONS § 6: Vertiefungen in die Kachel, Erhebungen in den Prop-Layer). Geworden ist es kiesige Erde auf der gemeinsamen Basis: eingebettete Kiesel bis ~1/8 Kachelbreite gehören in die Kachel, lose Blöcke bleiben Props |
| **mineral_vein** | „Adernetz im Gestein … Erzadern sind farbig und gerichtet, nicht polygonal" | **kein Adernetz, sondern Brocken.** Die Netz-Technik (`permafrost`, `crevasse`) blieb ungenutzt. Rudi: derselbe Fels wie `rock_layer`, nur mit Erz — die beiden dürfen ausdrücklich dieselbe Materialsignatur tragen. Das Zielband `cbSd` 0.8–1.7 war aus dem alten Neon-Zustand abgeleitet und arithmetisch unerreichbar; eine Leiter hat es belegt (LESSONS § 5) |
| **deep_stone** | „Dunkel, massiv, wenig Struktur. Das dunkle Ende der Familie." | **dunkel und massiv ja, „wenig Struktur" nein.** meso 17.1–17.9 ist der höchste Wert der drei neuen Sätze — die großen Kopfsteine tragen das Relief, nachdem das Schollennetz der Basis per `bandScale(kMeso 0.60)` zurückgenommen wurde. „Wenig Struktur" wäre eine flache Kachel geworden, und flach ist in dieser Serie dreimal verworfen worden |
| **ice_cavern** | „Eis im Berg. Nächster Nachbar außerhalb der Familie: `glacier` und `frozen_lake` … die Werkzeuge und Grades sind wiederverwendbar" | **aus `crystal_field` (TOXIC), nicht aus der ICE-Familie.** Eis im Berg ist dasselbe MOTIV wie ein Kristallfeld in anderem Material, und Material kommt aus dem Grade. Das alte `ice_cavern` war der `void_edge`-Fehler in groß (ein Loch pro Kachel, Raster 35.20) und wurde komplett ersetzt. `crystal_field` hat nur zwei eigenständige Anordnungen — Slot 2/3 kamen aus flux, dem einzigen flux-Einsatz seit BARREN |

### 5.6 ASTEROIDS — ✅ ABGESCHLOSSEN 2026-09-05

Kacheln fertig, **Props stehen noch aus** (§ 4: die Kachel wird ohne sie
abgenommen). Endzustand und Zahlen in § 1.

**Geplant gegen tatsächlich — vier Abweichungen, alle in Richtung weniger
Arbeit:**

| Biom | geplant war | gemacht wurde |
|---|---|---|
| **fractured_zone** | „Technik von `crevasse` direkt übertragbar (prozedurales Netz, helle Bruchkante, Randabblendung)" | **nicht nötig — die Kacheln SIND bereits ein Rissnetz.** Es fehlte nur die Vereinheitlichung: die B/R-Spanne lief von 1.00 bis 1.66, die Pegel von 46 bis 70. Compositing auf p70 60 / B/R 1.150 plus Gitterversätze, Slot 0 als zweites Fenster des Slot-1-Heros (Rudi: „0 ist zu unterschiedlich zu den anderen 3"). Die ganze crevasse-Maschinerie blieb ungenutzt |
| **void_edge** | „das einzige Biom ohne echtes Vorbild — erst klären, was es darstellen soll" | **geklärt, und ohne flux gebaut.** Die ausgelieferten Slots 0/1/3 waren je EIN schwarzes Loch mit hellem Wulstrand — im 2×2-Repeat ein Feld schwarzer Punkte (Raster 20.48, Naht 4.94, uCV bis 0.792, das schlechteste der Familie). Rudi: „cave_floor ist neu, 0 ist davon der intensivste mit den meisten steinen … man kann ja 4 ableitungen davon erstellen nicht 3 wie sonst, danach noch etwas abdunkeln, ist schließlich void". Vier Gitterversätze von `cave_floor_0`, zwei Pegel vorgelegt, p70 40 gewählt. Das Schwarz steht jetzt **in den Fugen**, nicht als Fleck in der Mitte |
| **metallic_surface** | „der einzige Kandidat für Glanz — vorsichtig" | **umgekehrt: der Glanz kam raus.** Rudi: „das würde ich rötlich korrodiert und bläulich machen, aber eher stumpf, nicht so glänzend wie jetzt". Damit war es kein Farbgrade, sondern ein Materialwechsel — und der brauchte eine neue Kennzahl, weil ein globaler B/R-Zielwert zwei Materialien zu Braungrau mittelt (LESSONS § 5, `cbSd`). Das Korrosionsfeld ist eine Summe von Kosinussen auf dem **dualen Gitter des Iso-Torus**, also nahtlos per Konstruktion; die Kachelung kostete es messbar nichts (Raster 8.23 → 8.18). Der Spitzenanteil über 1.6 × p70 fiel von 11.8 % auf 2.8 %, **und MESO stieg dabei** von 12.42 auf 12.98 |
| **dust_basin** | „wie `dust_plain` behandeln"; Rudis Vorschlag war eine Ableitung aus `regolith` | **aus dem eigenen Slot 1 abgeleitet, nicht aus `regolith`.** Die regolith-Route funktionierte (Raster 7.89, Naht 1.08), gab aber regoliths Relief zurück — meso 9.4 gegen dust_plains 1.02, also gerade nicht „glatt". Der eigene Slot 1 war der einzige brauchbare Original-Slot und traf das Zielmuster direkt: meso 4.9, Raster 3.04 |

**`impact_crater` lief wie geplant** — aus `crater` abgeleitet, Motiv leicht
variiert über ein zweites, feineres Muldenfeld (R8 / Tiefe 0.7 gegen craters
R8 / 1.4). Die Nicht-Koexistenz war vorab geprüft: `crater` steht auf BARREN und
MOON_ROCKY, `impact_crater` auf ASTEROID_M und _S, kein Körper trägt beide.

**Die Falle, die aus der Ableitungskette entstand, war echt:** `crater` ist
selbst aus `regolith` gebaut, also hätten `impact_crater` und ein aus `regolith`
abgeleitetes `dust_basin` denselben Urahn — und die beiden liegen auf
ASTEROID_M zusammen. Gemessen 0.093 im schlimmsten Slotpaar, also unbedenklich,
weil die Netto-Versätze weit genug auseinanderliegen. Belegt statt angenommen;
das Verfahren steht in LESSONS § 8.

**Ein Baufehler ist dabei entstanden und wurde behoben:** `dust_basin` Slot 0
bekam den Versatz (0,0) und war damit der ungerollte Hero — 0.574 gegen
`rock_layer`. Am selben Tag durch (192,96) ersetzt, Slots 1–3 byteidentisch
gehalten. Die Lehre: die Nachbarschaftsprüfung muss die **z-Ebene** abdecken,
nicht nur die Oberflächenliste des Typs.

---

## 6. Prop-Familien: was neu gebraucht wird

> **Ab 2026-09-06 ist das die einzige offene Asset-Arbeit.** Alle 55 Kacheln
> stehen; seit der FROZEN-Runde haben 20 Biome einen Prop-Layer, 35 nicht. Die
> Kacheln sind bewusst **ohne** Props abgenommen worden (§ 4) — das war richtig,
> macht aber die Arbeitsteilung aus LESSONS § 6 jetzt fällig: **Vertiefungen
> sind in den Kacheln (Risse, Krater, Furchen, eingebettete Kiesel), Erhebungen
> gehören in den Prop-Layer** (Blöcke, Brocken, Säulen, Séracs).
>
> **Nächste Schritte, in dieser Reihenfolge:**
> 1. ~~Offene Frage 1 unten zuerst klären~~ — **für Etage 0 beantwortet**, siehe
>    § 7 Punkt 1. Für die Untergrund-Ebenen steht die Messung noch aus.
> 2. Die Prioritätenliste unten abarbeiten. Punkt 4 und 5 bedienen UNDERGROUND
>    und sind damit neu fällig geworden.
> 3. Beim Skalieren gilt die Prop-Regel aus LESSONS § 7: **über die HÖHE
>    skalieren**, Aspect × Faktor × 28 gegen die Kachel rechnen, und **Größe
>    und Dichte nie gleichzeitig senken.** Und die Ergänzung aus der
>    FROZEN-Runde: die Spanne in einem Plan gilt nur für die BELEGUNG, unter der
>    sie geschrieben wurde — `ice_block` steht bei 0.45 statt der hier einmal
>    notierten 0.5–0.7, weil auf einer Kachel 1.374 Stück landen und nicht eins.

Vorhandene Familien, die weiterverwendet werden können:
`rock`, `rock_arid`, `rock_sand`, `rock_snow`, `rock_ash`, `lava_rock`,
`basalt_column`, `ice_floe`, `ice_block`, `ice_rubble`, `crater_decal`

**Neu zu bauen, nach Priorität:**

1. ~~**Eisblöcke / Séracs** — für `glacier`.~~ **✅ ERLEDIGT 2026-09-11:**
   `ice_block`, 4 Varianten, verdrahtet auf `glacier` (2..4 + Leer-Sentinel,
   `minG: 0`) und dünn auf `crevasse` (1..2, Default minG, damit die Klüfte
   frei bleiben). Wie geplant **stehende Objekte ohne `PROP_GROUND_INSET`**.
   `ice_floe` war ausgeschlossen und ist es geblieben — mit Wasserlinie
   gezeichnet, auf festem Grund eine graue Platte in einer Pfütze.
   **Eine Abweichung vom Plan: Höhenfaktor 0.45 statt der hier vorgesehenen
   0.5–0.7.** Diese Spanne war unter „ein Stück je Kachel" geschrieben;
   tatsächlich landen 1.374 darauf. Bei 0.50 wäre jede zehnte Kachel zu 41 %
   bemalt. Begründung und Tinten-Leiter im FROZEN-Block von `propThemes.ts`.
2. ~~**Eisbrocken / Frostgrus** — für `permafrost` und `tundra`.~~
   **✅ ERLEDIGT 2026-09-11:** `ice_rubble`, 5 Varianten, beide Biome auf
   2..4 + Leer-Sentinel; `permafrost` mit `minG: 0`, `tundra` **ohne** (§ 7
   Punkt 1). Höhenfaktor 0.20 → 6.8 % bemalte Fläche je Kachel, praktisch
   deckungsgleich mit dem ausgelieferten `rock` auf `mountain` (6.7 %).
   Die im Plan erwogene Abkürzung „vielleicht reicht `rock_snow` mit hoher
   Dichte" wurde geprüft und **verworfen** — die Zahlen stehen in § 2.
3. ~~**Krater-Aufleger**~~ **✅ ERLEDIGT 2026-09-08:** `crater_decal`,
   4 Varianten als Stärke-Leiter, auf sieben BARREN-/ASTEROIDS-Biomen mit
   `PROP_GROUND_INSET` 1.0 und per-Biom gewählten Sprossen.
4. **Geröll / Bruchstücke** — für UNDERGROUND und ASTEROIDS, vermutlich als
   eine Familie mit Umfärbung je Biom. Bedient auch `rocky_outcrop`,
   `boulder_field` und `void_edge`, die für `crater_decal` zu texturiert sind.
5. **Kristalle** — für `mineral_vein` und `ice_cavern`.
6. **Eigenes Set für `frozen_lake`** — neu, aus der FROZEN-Runde. Schollenkanten
   und Presseisrücken auf einer glatten, hellen, blauen Fläche; die beiden
   Frostfamilien passen dort nachweislich nicht (§ 3.2).

---

## 7. Offene Fragen

1. **Was steuert die Prop-Dichte auf Kacheln ohne Vegetation?**
   **FÜR ETAGE 0 BEANTWORTET** (Eismonde 2026-09-11, Asteroiden/BARREN
   2026-09-08). Unter Tage ist es weiter offen — dort ist noch nicht gemessen.

   Gemessen auf dem erreichbaren MOON_ICY, 1 064 960 Oberflächenzellen
   (260 Chunks à 64×64):

   | Biom | g=0 | 1 | 2 | 3 | 4 | mean |
   |---|---|---|---|---|---|---|
   | glacier | 75.0 % | 18.0 | 6.0 | 0.9 | 0 | **0.329** |
   | permafrost | 75.1 % | 17.9 | 6.0 | 1.0 | 0 | **0.330** |
   | crevasse | 75.5 % | 17.6 | 6.1 | 0.8 | 0 | **0.322** |
   | frozen_lake | 79.4 % | 15.1 | 5.5 | 0.0 | 0 | **0.261** |
   | tundra | 39.9 % | 35.1 | 18.1 | 6.0 | 1.0 | **0.930** |

   Damit sind **drei** Regime belegt, nicht zwei: lush ≈ 3.69
   (plains/forest/swamp), arid ≈ 0.73 (mountain, desert_patch, beach, alle sechs
   VOLCANIC, BARREN) und **frozen ≈ 0.26–0.33**, das noch einmal deutlich
   darunter liegt. Deshalb tragen `glacier` und `permafrost` `minG: 0` — ohne
   die Schaltung bliebe dort jede vierte Kachel die einzige mit Props.

   > ⚠️ **`tundra` ist der Ausreißer, und er ist die eigentliche Lehre.** Es
   > liegt mit 0.930 bei fast dem Dreifachen seiner drei Nachbarn auf demselben
   > Mond — und sogar über dem ariden Regime. Die Schlussfolgerung der
   > VOLCANIC-Runde („`g` gilt pro Biom-KLASSE") hätte `tundra` zusammen mit dem
   > Rest seines Mondes auf `minG: 0` gesetzt; der Leeranteil wäre auf 9.3 %
   > gefallen, also ein Teppich statt „verteilt auf dem boden". Es steht deshalb
   > als einziges der drei auf dem Default und liegt bei 46.1 % leer.
   > **Ein Regime ist pro BIOM zu messen, nie aus der Klasse zu übernehmen.**
2. ~~**Erscheinen BARREN- und ASTEROIDS-Biome auf demselben Körper?**~~
   **BEANTWORTET: nein.** `regolith`/`crater`/`dust_plain`/`rocky_outcrop`
   stehen auf BARREN und MOON_ROCKY, die Asteroidenbiome auf ASTEROID_M/C/S.
   Kein Körper trägt beide — deshalb durfte `impact_crater` aus `crater`
   abgeleitet werden, ohne dass etwas künstlich getrennt werden musste.
3. ~~**Was ist `void_edge`?**~~ **BEANTWORTET:** eine sehr dunkle, zerfurchte
   Trümmerfläche, in deren Fugen das Schwarz steht — vier Gitterversätze von
   `cave_floor_0`, p70 40. Kein Loch pro Kachel mehr.
4. ~~**Greift die Vakuum-Abdunkelung unter Tage?**~~ **BEANTWORTET: nein.**
   `isoConstants.atmosphereDarkening()` setzt
   `factor = currentZ >= 0 ? airlessFactor(density) : 0`, `litSwapActive()`
   spiegelt dasselbe z-Gate. Untergrund-Ebenen werden nie abgedunkelt; die
   Vakuum-Panels auf den Kontaktbögen sind für UNDERGROUND reine Diagnose.
   Folge für die Props: die Untergrund-Kacheln stehen im Spiel auf ihrem
   **vollen** Pegel (rock_layer 44, mineral_vein 40, deep_stone 35,
   ice_cavern 56), und daran ist der Prop-Kontrast zu kalibrieren.
5. **`regolith` und `glacier`** — die Kopplung auflösen oder bewusst
   mitziehen? Siehe 5.4.
6. **Wird die Erz-Leiter für `mineral_vein` doch noch gebraucht?** Auf
   Spielskala (48×24) trennen sich `rock_layer` und `mineral_vein` kaum; Rudi
   hat das abgenommen („es ist total ok wenn manche biome sehr ähnlich sind",
   LESSONS § 6). Falls die Prop-Runde daran etwas ändert — Erzbrocken als Props
   auf `mineral_vein` würden die Trennung ohnehin tragen —, ist die Sprosse o1
   (Brocken B/R 1.45, λ 50–110 px, Deckung 26 %) in
   `scripts/tiles-underground-stones.cjs` hinterlegt und ein Einzeiler.
