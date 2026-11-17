# Asset-Pipeline — teuer gelernte Lehren

Verbindlich für alle Arbeit an Surface-Tiles und Props. Jede Zeile hier hat
mindestens eine Runde gekostet. Stand 2026-09-11, nach OCEAN, VOLCANIC-Props,
ICE, BARREN, ASTEROIDS, UNDERGROUND und FROZEN-Props — **damit sind die 55
Surface-Tiles vollständig überarbeitet.** Offen ist nur noch der Rest des
Prop-Layers (§ 7).

---

## 1. Messen

**An der GESCHRIEBENEN Datei messen, nie am Puffer.**
libwebp erhält RGB unter transparenten Pixeln nicht — schwarze Rautenecken
kommen als 3/3/3 zurück und verschieben die Canvas-Luminanz um +1.5. Wer im
Speicher misst und dann schreibt, trifft sein Ziel nicht.

**`sharp.cache(false)`**, sobald ein Script denselben Pfad neu schreibt.
Sonst EINVAL auf Windows im Schreiben-Messen-Korrigieren-Zyklus.

**Die Quelle einfrieren, bevor gegradet wird.**
Eine Pipeline hat einmal ihren eigenen Output als Hero gefressen und doppelt
gegradet (kelp_forest). Kopie ablegen, bei jedem Lauf per Prüfsumme
verifizieren.

**Restchroma auf der webp ist nicht die Restchroma des Bildes.**
libwebp-lossy ist immer YUV 4:2:0. Senkt ein Grade den Blaukanal, wird derselbe
absolute Quantisierungsfehler relativ größer — gemessen 7.5 % auf der PNG gegen
12.1 % auf der webp, ohne dass Farbrauschen entstanden wäre. Beide Spalten
ausweisen. **Und:** die webp zu dekodieren und als PNG neu zu schreiben misst
wieder den Encoder, nicht die Quelle.

---

## 2. Grades

**Farbe kommt aus dem Grade, nicht aus dem Prompt.**
Mehrfach bestätigt. Ein Prompt trifft keinen Zielwert; ein Grade trifft ihn auf
drei Stellen.

**Die geschlossene Form trifft, wenn man den Encoder einrechnet.**
`mean_c = (Lm + desat·(m_c − Lm)) · tint_c · G` bei `contrastK = 1`. Auf die
GESCHRIEBENEN Zielwerte lösen, nicht auf die Pufferwerte — der webp-Round-Trip
hat einen konstanten Faktor (gemessen ×1.011 auf B/R, ×1.008 auf G/R).

**Rec709-Gewicht des Tints nahe 1.0 halten**, sonst verschiebt sich die
Luminanz beim Farbtonwechsel.

**KEINE divide-by-blur-Equalization auf rautenmaskierten Kacheln.**
Die dunklen Ecken des Vor-Masken-Quadrats verunreinigen den Kanten-Blur → zu
kleiner Nenner → **heller Gelbrand an den Kanten**. Stattdessen uniforme
Luma-Normalisierung, und Farbdrift per Weißabgleich auf den Hero.
Für großflächige Helligkeitsblobs: **analytisches 2D-Polynom** (Grad 5)
anfitten und herausdividieren — kein Blur, also kein verunreinigter Nenner.
Grad 3 kippte den Randsaum ins Positive, Grad 5 hielt ihn negativ.

---

## 3. flux

**Keine Negativ-Prompts.** Sie reproduzieren das Ungewollte. Stattdessen eine
positive Ersetzungsanweisung.

**Skopiert formulieren, nicht flächig.**
„ersetze jede Pflanze durch Kies" scheiterte; „behalte den vorhandenen dunklen
steinigen Boden, und *wo eine Pflanze steht*, setz denselben Frostkies hin"
funktionierte. Wer die Fläche neu beschreibt, bekommt sie neu erfunden.

**Farb- und Lichtwörter richten den Schaden an.**
„pale bluish white ice" ergab weißes Papier (Luminanz 212–229, 94–100 %
ausgefressen). „dark blue grey, dim, unlit, matte" las flux als *Licht-Briefing*
und lieferte einen Studio-Hintergrund mit fotografischem Sweep. Nur nach
**Geometrie** zu fragen („fülle die Krater, bedecke die Steine, der Boden wird
eben") ließ den Grund stehen. Helligkeit und Farbe gehören ohnehin in den Grade.

**kontext ist NIE additiv.** Es regeneriert und löscht dabei vorhandene
Details — auch wenn der Prompt „ONLY ADD" sagt. Wo etwas erhalten bleiben muss,
ist entweder eine skopierte Anweisung nötig oder ein anderer Weg.
**Umgekehrt nutzbar:** wo etwas ENTFERNT werden soll, arbeitet diese Eigenschaft
für einen.
Belegt beim Schließen einer auslaufenden Iso-Kante (`large_storage_start`,
Runde 1): `fal-ai/flux-pro/kontext/…` zeichnet auf „schließ diese Kante" das
ganze Bild neu, die Ankerlinien-Registrierung driftet gemessen 70–140 px.
Zum Schließen einer Kante ist stattdessen `fal-ai/flux-pro/v1/fill` mit enger
Maske das Mittel (siehe Maskenfläche unten).

**Beim Schließen einer Kante liegt die Grenze unter 20% Maskenfläche.**
Belegt an `large_storage_start` (zwei Runden, `fal-ai/flux-pro/v1/fill`):

| Maskenfläche | Ergebnis |
|---|---|
| 41,0 % | unbrauchbar — Modell zeichnet die Szene neu, erfindet zweite Regalgasse / Fremdmechanik |
| 19,3 % | 1 von 3 sauber — Geisterschleier, erfundene Greifer-Mechanik |
| 13,6 % | **5 von 5 sauber**, alle mit Ankerlinien-Abweichung Median 1 px / p90 2 px |

Wer mit einer halben Kachel maskiert, bekommt eine neue Szene statt einer
geschlossenen Kante.

**kontext hellt auf und entfärbt von sich aus** (gemessen 30.8 → 42.4 und
B/R 0.63 → 0.97). Nach jedem Lauf auf die Zielwerte zurückgraden.

**flux liest die Rautenmaske als BILDRAHMEN** und heftet Formen daran — der
Randanteil stieg auf 11–25 % gegen 3.2 % normal, zwei Slots wurden radiale
Mandalas. **Gegenmittel:** die Textur zu einer randlosen quadratischen Fläche
zusammensetzen, flux dort hineinzeichnen lassen, **erst danach** in die Raute
maskieren. Das drückte den Randanteil auf 3.6–4.3 %.

**Texture-Bombing begräbt kein Raster, dessen Zellen eine starke eigene
Helligkeitsrampe tragen.** Erst die Zelle flach machen, dann bomben.
Bei `regolith` kam die Rautenkachelung als hell/dunkles Schachbrett durch 422
gefiederte Flicken hindurch: jeder 460-px-Flicken trägt ein Stück derselben
Rampe (`regolith_0`: tiltY 29.9, tiltX 9.9), sie mitteln sich also nicht weg,
sondern lehnen alle gleich. Und flux quantisiert prompt darauf — vier Rückgaben,
vier Fehlschläge (Noppenfolie, Schuppenmuster, Studio-Render). Kennzahl:
**Tiefpassanteil der Platte** = sd der 32-px-Blockmittel geteilt durch die
Gesamt-sd. `frozen_lake` (funktionierte) 0.415, `regolith` Runde 1 **0.675**.
Nach deg-5-Flatten der Quellkachel: 0.380 — und flux hörte auf zu quantisieren.
`frozen_lake` lief nur deshalb ohne diesen Schritt, weil sein Ausgangsmaterial
(`glacier`) bereits geflattet und rampennormalisiert war.
**Nebenbei:** die Raute ist gefiedert (~1024 Teilpixel). Über dunklem Grund
zeichnet dadurch jede Kachelgrenze eine dunkle Linie in die Platte — der
Feldhintergrund muss das Eigenmittel der Kachel sein, nicht `BGA`.

**Aber die Platte nicht zu groß.** Bei 1024×1024 und einem Kachelfenster von
einem Achtel kamen die Formen zu klein an und das Korn ging verloren. Dichte
**pro Kachelfenster** angeben, nicht pro Platte. Kein Hochskalieren der Ausgabe
— treppige Kanten sind bei 1:1 sichtbar.

**Bei strukturlosen Motiven entscheidet der Seed alles.**
Drei Läufe auf derselben Platte mit denselben Worten, nur anderem Seed,
verloren alle das Korn und gewannen Formen. Ohne Formen, an denen flux hängen
kann, ist es nicht steuerbar. **Dann sind andere Fenster derselben Platte der
bessere Weg** — Slot-Kreuzkorrelation lag bei 0.009, also kein sichtbarer
Repeat.

**`fal.run` ist von Rudis Maschine aus tot** (TLS-Abbruch vor dem ersten Byte),
`queue.fal.run` antwortet normal. Alle Aufrufe über die Queue-API:
submit → poll status → fetch response.

**Jede Erwähnung von etwas UNTER dem Objekt wird als eigener Körper
gerendert.** Sockel, Boden, Schürze, „standing on ice", „resting on the
ground" — flux zeichnet die Unterlage mit, als weiteres Volumen, und ein Prop
mit eingebackenem Sockel ist unbrauchbar, weil der Renderer ihn auf eine
Kachel setzt, die schon ein Boden ist. **Drei von fünf Fehlschlägen der
FROZEN-Runde, dieselbe Ursache.** Der Grund steht im Prompt gar nicht zur
Debatte: das Objekt wird freigestellt, also darf im Prompt nichts vorkommen,
worauf es stehen könnte.

**sharp verwirft Layer außerhalb der Leinwand statt zu clippen** — die Platte
bekommt Löcher. Klemmen und Deckung beweisen.
**Und:** eine Einkanal-PNG-Maske an `blend: 'dest-in'` wird ohne Alpha kodiert,
also mit Alpha 255 multipliziert — „runde weiche Flicken" waren in Wahrheit
**harte Rechtecke**. Maske als RGBA bauen.

---

## 4. Kacheln und das Raster

**Das Kachelraster wird nicht durch Spiegelung behoben, sondern durch den
Lichtverlauf.**
Die Spiegelung von Slot 2/3 hebt den seitlichen Anteil nicht auf, sie lässt ihn
**alternieren** — das liest als senkrechte Steppdecke statt als waagerechte.
Der seitliche Anteil muss auf 0, das kostet nichts.

**Wie flach der Verlauf sein muss, hängt an der Eigentextur der Kachel.**
Keine Familienkonstante, eine Entscheidung pro Kachel:
`tundra` 3.0 · `frozen_lake` 0.0. Bei einer glatten Kachel ist die Rampe der
größte Teil der Naht (Nahtsprung fällt um bis zu 40 % beim Wechsel auf 0).

**Ein Raster fällt auf, wenn seine Tarnung fehlt, nicht wenn es stärker wird.**
Bei `tundra` sank die Rasteramplitude nach dem Entpflanzen von 10.4 auf 7.2 —
und wurde trotzdem erst dann sichtbar, weil die Textur, die sie verdeckte, von
9.3 auf 3.2 eingebrochen war. **Immer das Verhältnis betrachten, nie den
Absolutwert.**

**Innenmessungen verfehlen den Rand.** Kanten immer selbst am 2×2 UND am
verschränkten Mosaik ansehen.

**Spiegelkonvention aus dem Bestand auslesen, nicht annehmen.**
Im ICE-Korpus gewinnt für Slot 2/3 durchgehend die horizontale Spiegelung, nie
die vertikale — `forest` ist der dokumentierte Gegenfall (dort zeigt horizontal
die Kacheln). Bei Lichtverlauf 0 taugt das Vorzeichen des Verlaufs **nicht** als
Beleg; dann per Kreuzkorrelation gegen die ungespiegelte Quelle prüfen.

**Vertikal spiegeln kippt die eingebackene Schattierung** — Krater werden zu
Kuppeln. Erlaubt nur bei nahezu senkrecht beleuchteten Quellen, und das ist
anzusehen, nicht anzunehmen.

---

## 5. Metriken und ihre Grenzen

Jede dieser Kennzahlen hat mindestens einmal in die Irre geführt.

| Kennzahl | Wofür | Wo sie versagt |
|---|---|---|
| **Blowout** (Pixel über Luma 200) | Rohe Helligkeitsspitze | **Taugt NICHT als „unbearbeitet"-Indikator** — das ausgelieferte `silicate_plain` liegt bei 47–70 % und ist fertig. Unter der Vakuum-Abdunklung fällt der Wert bei allen 55 Biomen auf 0.0 %. Als Grenze pro Runde brauchbar, nicht als Zustandsdiagnose |
| **meso** = sd(Blur r6 − Blur r32) / p70 × 100 | Relief auf Steingröße — ob eine Kachel plastisch liest | Das Band, in dem „flach" wohnt. micro4 liegt darunter, die Rampe darüber, dazwischen wurde nie gemessen. Korpus: p25 7.92, Median 11.97, p75 16.64, max 38.31 (`lava_flow`) |
| **cbPP / cgPP** = Steigung von B/R bzw. G/R über die Kachel, ×2 | Farb**verlauf** | Farbe ist ein FELD, keine Konstante. Korpus: Median 0.122, p75 0.388, p90 1.484 |
| **cbSd / cgSd** = sd der 16-px-Blockfarben **nach** Abzug der angepassten Ebene | Farb**fleckigkeit** — das Gegenstück zu cbPP | Nur als **Paar** lesbar: ein Verlauf ist hoch cbPP / niedrig cbSd, eine gefleckte Fläche umgekehrt. Ein globaler B/R-Zielwert kann zwei Materialien nicht ausdrücken, er mittelt sie zu Braungrau. Korpus über 219 Slots: p25 0.013, Median 0.057, p75 0.200, p90 0.483; oben stehen die echt zweifarbigen Biome (`ice_cavern` 1.16–4.91, `mineral_vein` 1.01–1.70, `acid_lake` 0.79–1.34). Fällt mit cbPP zusammen auf NaN, sobald ein Block echtes Schwarz trägt |
| **micro4 / p70** | Textur, pegelbereinigt | micro4 skaliert mit der Eigenhelligkeit, ein absoluter Wert ist zwischen p141- und p60-Kacheln nicht vergleichbar. Korpus: p10 4.35, Median 8.98, p90 20.85 |
| **grain** = Autokorrelations-Halbwertslänge des Hochpasses (px) | Größe der Elemente | Trennt „stark und fein" von „stark und klobig", was micro4 nicht kann: `rocky_outcrop_1` 19.9/2.96 gegen `_3` 20.8/**4.65** — gleiche Stärke, und nur `_3` liest als „sehr unruhig" |
| **Faltmetrik** `grid_tot`/`coh` | Sichtbarkeit des Kachelrasters | Auf **glatten** Kacheln fast wertlos — eine merkmalslose Kachel punktet gut, indem sie nichts hat |
| **Kantensprung/Innenrauheit** | Naht | Als **Rastermaß unbrauchbar**: liegt über eine ganze Neigungsleiter bei 1.21–1.27, während die Faltmetrik sich um Faktor 4.3 ändert |
| **micro8** (8×-Mip) | Textur auf Spielskala | Misst Nachbarkontrast — **wenige breite Formen sind per Definition niederfrequent** und erreichen dort nie hohe Werte. Skaliert außerdem mit der Eigenhelligkeit: dunkler machen KOSTET Struktur |
| **d′ nach Helligkeit/Textur getrennt** | Welches Bein eine Trennung trägt | Deckte auf, dass dünne Risse über Helligkeit trennen statt über Textur |
| **Violett-Achsen-Abstand** `G/R − (1+B/R)/2` | Lilastich | Hochchroma-Diagnostik — bei niedriger Sättigung nicht aussagekräftig |
| Streuung der Kachelmittel | Patchwork | **Blind für Rampen**, weil eine Rampe mittelwertfrei ist |
| `dark%`, `rimG%` | Randabblendung | Auf körnigem Grund unbrauchbar (`tundra` liegt selbst bei 8.7 % bzw. 31.3 %) — stattdessen die Maskenamplitude über Abstandsbänder |

**Ein Prüfscript, das nur eine Achse stempelt, weist eine vorhandene Trennung
als Fehlschlag aus.** `tiles-pair-check` maß anfangs nur den Blau/Rot-Abstand;
danach wäre `reef`/`shallow_water` „untrennbar" gewesen, obwohl das Auge Blau
gegen Cyan klar sieht.

**Der maßgebliche Maßstab ist der, auf dem der Spieler hinsieht** — nicht die
äußerste Übersicht. `crevasse` liegt auf dem 4×-Mip klar über `glacier` und nur
auf dem 8×-Mip darunter.

### Wo die Formeln stehen

Die Bänder oben sind hier nachlesbar, die **Formeln** waren es nirgends. Die
maßgeblichen Implementierungen — die, gegen die der gesamte 55-Biome-Korpus
kalibriert ist — liegen in `scripts/lib-*.cjs`:

| Modul | Was drin steht |
|---|---|
| `scripts/lib-tile-metrics.cjs` | `statsRaw` (p70, Blowout, dark, B/R, G/R), `groundP70`, `rimHalo`, `flatten`, `grade`, `gridMetrics` (Faltmetrik), `boundaryStep` (Naht), `vacuum` (VAC_A 0.45 gegen rgb(5,10,25)) |
| `scripts/tiles-dust-plain-lib.cjs` | `tiltRimRaw` (Rampe gx/gy, rim), `solveTile`, `flattenPoly`, `flattenRadial`, `latticeRoll`, `edgeRepair`, `gridOf` (Raster + Naht in einem Zug), `microContrast` |
| `scripts/lib-meso.cjs` | `meso` / `mesoNorm` — Bandpass r6−r32, nur über opaken Pixeln, über p70 ×100 |
| `scripts/lib-grain.cjs` | `grain` (Autokorrelations-Halbwertslänge) und `blurOpaque`, der Box-Blur, auf dem meso und die Bandoperatoren aufsetzen |
| `scripts/lib-chroma.cjs` | `chromaRamp` (cbPP / cgPP auf 16-px-Blockmitteln) und `chromaFlatten` |
| `scripts/lib-uniform.cjs` | `uniformity` (uCV, uP90) — Gleichmäßigkeit der Mikrokontrast-Verteilung |
| `scripts/lib-shape.cjs` | `edgeDrop` (radiales Profil, Randband minus Mitte), `lowpassRaw` („tiefp"), `opaque` (Alpha-Zensus) |
| `scripts/lib-band.cjs` | `bandScale` und `unsharpLuma` — die beiden Operatoren, die je genau ein Band bewegen |

`scripts/tiles-metrics-selftest.cjs` fährt fünf bekannte Korpuszeilen dagegen
und meldet jede Abweichung. Vor jeder Runde einmal laufen lassen — er ist die
einzige Absicherung dagegen, dass eine „harmlose" Umstellung die Zahlen
verschiebt, gegen die alles andere kalibriert ist.

### micro4 / micro8 haben zwei nicht identische Definitionen

Und der Korpus ist nur gegen **eine** davon kalibriert.

| | Wie | Wer |
|---|---|---|
| **Maßgeblich** | Vollkachel per `sharp.resize(128×64)` bzw. `(64×32)`, `fit: 'fill'`, durch WebP, dann `tiles-dust-plain-lib.microContrast` | BARREN- und ASTEROIDS-Runden, also sämtliche `_*_numbers.txt`-Tabellen und alle Korpusbänder oben |
| **Historisch** | die **ausgelieferte** `@quarter`- / `@eighth`-Mip lesen, via `lib-tile-metrics.microContrast(file, fallbackFull)` | ICE-/crevasse-/glacier-Runden (`frozen-lake-verify-prod`, `glacier-verify-prod`, `tiles-crevasse-*`) |

Sie sind **nicht** austauschbar. Die ausgelieferten Mips entstehen über eine
andere Skalierungskette, und die Differenz ist größer als jede Toleranz, die man
an eine Abnahme hängen würde: `dust_plain_1` liest micro8 **0.56** neu skaliert
gegen **1.01** aus der Mip, `boulder_field_3` micro4 **20.82** gegen **21.28**.

**Regel:** neue Messungen laufen über die maßgebliche Definition. Der Mip-Pfad
bleibt, weil die ICE-Zahlen darauf stehen — er darf nur nicht mit dem Korpus
verglichen werden.

### cbPP ist auf Kacheln mit echtem Schwarz undefiniert

`chromaRamp` fittet B/R und G/R über 16-px-**Blockmittel**. Hat ein Block
Mittel-R = 0, ist das Verhältnis unendlich und die ganze Kennzahl fällt auf NaN
— nicht nur der eine Block. Bei `void_edge_0` betrifft das 23 von 224 Blöcken,
und cbPP wie cgPP kommen als NaN zurück.

Das ist genau der Fall, den die Blockmittel eigentlich abfangen sollten (ein
Pixelverhältnis explodiert im Schatten ständig; `rocky_outcrop` ist zu 63 %
Schatten). Gegen echtes, flächiges Schwarz — Kachelränder gegen den Weltraum —
hilft die Mittelung nicht mehr. **Auf solchen Kacheln ist cbPP kein Kriterium,
sondern ein fehlender Wert**, und ein Prüfscript, das NaN als 0 liest, meldet
sie fälschlich als farbverlaufsfrei.

### cbSd ist das Gegenstück zu cbPP, und ohne beide sieht man ein Material nicht

Rudi zu `metallic_surface`: „rötlich korrodiert und bläulich, aber eher stumpf".
**Zwei Farbtöne gleichzeitig, über die Fläche verteilt — das kann ein globaler
B/R-Zielwert nicht ausdrücken.** Er mittelt Rost und Stahl zu Braungrau; das ist
Arithmetik, keine Geschmacksfrage. Der Farbton wird damit zum FELD, so wie die
Helligkeit seit `flatten()` eines ist.

Daraus folgt sofort eine Falle: `chromaFlatten` entfernt Farbvariation, und
genau die will man hier **haben**. Zwei Dinge, die dieselbe Kennzahlfamilie
anfassen, müssen auseinandergehalten werden:

| | | |
|---|---|---|
| **cbPP** | die angepasste EBENE durch die Blockfarben | ein Farb**verlauf** über die Kachel — unerwünscht, kommt raus |
| **cbSd** | die Streuung der Blockfarben NACH Abzug dieser Ebene | lokale **Fleckigkeit** — hier erwünscht, geht rein |

**Die Kennzahl hat in ihrer ersten Anwendung ihren eigenen Nebeneffekt
gefangen.** Das prozedurale Korrosionsfeld legte eine Ebene zurück ins Farbfeld
— cbPP stieg von 0.007 auf 0.164 (Slot 0 sogar 0.384), während cbSd nur auf
0.127 kam: unerwünschter Verlauf statt erwünschter Fleckigkeit. Die angepasste
Ebene aus der **Maske** herausgerechnet, nicht aus dem Bild: cbPP 0.052,
cbSd 0.123. Ohne das Paar wäre der Verlauf unbemerkt in die Kachel gegangen —
so wie `rocky_outcrop_3` mit cbPP 0.712 lange unbemerkt blieb, weil keine
Kennzahl hinsah.

### Ein Zielband nie aus dem Ist-Zustand einer verworfenen Kachel ableiten

Der teuerste Planungsfehler der UNDERGROUND-Runde, und er steckte im Auftrag,
nicht in der Ausführung. Für `mineral_vein` war als Ziel `cbSd` **0.8–1.7** bei
`cbPP` unter 0.15 vorgegeben. Die Zahl stammte aus der Korpustabelle — vom
**alten** `mineral_vein` mit seinen leuchtend elektrisch-blauen Adern, also von
genau der Kachel, die der Redesign gerade loswerden sollte.

Sie ist mit einem glaubwürdigen Farbpaar arithmetisch unerreichbar. `cbSd` ist
die Streuung der Block-B/R nach Abzug der Ebene, also näherungsweise

```
cbSd  ~  sd(Erzanteil je 16-px-Block)  x  Delta(B/R)
```

Der erste Faktor liegt bei ~0.28 (22 % Deckung, Brocken ~30 px gegen 16-px-
Blöcke). Für cbSd 0.8 müsste Δ(B/R) also ~2.7 betragen — Brocken bei **B/R 3.4**.
Das *ist* das Neon. Eine Leiter hat es belegt, statt es zu behaupten:

| Sprosse | Brocken B/R | Deckung | cbSd | cbPP |
|---|---|---|---|---|
| o0 (ausgeliefert) | 1.15 | 22 % | **0.135–0.144** | 0.009–0.094 |
| o1 | 1.45 | 26 % | 0.238–0.257 | 0.095–0.151 |
| o2 | 1.90 | 30 % | 0.407–0.461 | bis **0.232** |

Bei o2 klettert `cbPP` mit — es kommt also der unerwünschte *Verlauf* zurück,
nicht die erwünschte Fleckigkeit. **Referenz für ein glaubwürdiges zweifarbiges
Material ist `metallic_surface` mit cbSd 0.123**, abgenommen. Rudi hat o0
gewählt.

> **Regel:** Ein Zielband gehört aus einer Kachel abgeleitet, die als GUT gilt —
> nie aus der, die ersetzt wird. Der Ist-Wert einer verworfenen Kachel misst
> ihren Fehler mit.

### Eine Kennzahl, die sich mit einem Filter erfüllen lässt, ist kein Abnahmekriterium

Der wichtigste Punkt der BARREN-Runde, und er hat zwei Schleifen gekostet.

`rocky_outcrop_0` sollte micro4 ins Band der Nachbarn heben. Ein Unsharp tat
das. Dieselbe flux-Rückgabe, nur der Unsharp hochgedreht:

| Unsharp | micro4 | meso | Blowout |
|---|---|---|---|
| keiner | 17.39 | 16.10 | 0.41 % |
| r2 a0.35 | 18.86 | 16.03 | 0.72 % |
| **r3 a0.5** | **20.83** | **16.09** | 0.97 % ← so ging sie an Rudi |
| r3 a0.8 | 22.67 | 16.00 | 1.42 % |
| r4 a1.2 | 27.06 | 16.30 | 2.24 % |

**micro4 steigt um 56 %, meso bewegt sich nicht.** Ein Unsharp mit Radius r legt
Energie nur *unterhalb* r ab; das Meso-Band beginnt bei r6. Die Zahl war
erfüllbar, ohne dass das Bild besser wurde — die ausgelieferte Kachel lag bei
meso 16.09 und damit **unter** den 21.20 der bereits als „sehr flach"
verworfenen Vorgängerin. Rudis Urteil war korrekt, die alte Kennzahlmenge
konnte es nicht zeigen.

**Regel:** vor jedem Abnahmekriterium fragen, ob ein Filter es erfüllen könnte.
Wenn ja, ist es eine Diagnose und kein Kriterium, und es braucht eine zweite
Kennzahl in einem Band, das der Filter nicht erreicht.

### Ein Luma-Flatten entfernt keinen Farbverlauf

`flatten` und `grade` multiplizieren pro Pixel mit einem **Skalar**, und ein
Skalar kürzt sich in B/R heraus. Gemessen: `rocky_outcrop_0` ging durch die
ganze Compositing-Kette von cbPP 0.549 auf 0.490. Für Farbfelder braucht es ein
eigenes Chroma-Flatten (Polynom auf B/R und G/R, Rec709-Luma pro Pixel
gehalten — dann bleiben Pegel, Rampe und Mikrokontrast unberührt).
Nebenbefund: `rocky_outcrop_3` trug mit cbPP 0.712 den stärksten Farbverlauf im
Biom, und niemand hatte ihn gesehen, weil keine Kennzahl hinsah.

### Die Vakuum-Abdunklung lässt d′ unverändert

Sie ist `v = L·0.45_gegen_rgb(5,10,25)`, also eine **lineare** Abbildung. Sie
skaliert Mittelwertdifferenzen und Streuungen mit demselben Faktor, damit ist
das Verhältnis, das d′ ist, invariant. Über die ganze crater-Pegelleiter
gemessen:

| Rung | d′-Pegel normal | d′-Pegel unter Vakuum |
|---|---|---|
| p75 | 8.55 | 8.54 |
| p60 | 10.42 | 10.42 |
| p42 | 12.59 | 12.58 |

Sie staucht die **absolute** Helligkeit, was auf einer einzelnen Kachel auffällt
— aber sie senkt die **Unterscheidbarkeit zweier Flächen** nicht, und genau die
ist gemeint, wenn „im Spiel unterscheidbar" gefordert wird. Die Annahme, das
Vakuum fresse den Abstand, ist intuitiv und falsch; sie nicht jedes Mal neu zu
prüfen spart eine Runde.

### Muldenfelder wirken über den Radius, nicht über die Tiefe

Bei `crater` sollte die Muldentiefe den Texturverlust des Abdunkelns auffangen.
Sie tat es nicht, gemessen bei p60:

| | meso | Naht |
|---|---|---|
| Tiefe 1.4 | 10.04 | 1.17 |
| Tiefe 2.0 | 10.33 | 1.29 |
| Tiefe 2.6 | 10.81 | 1.44 |

+7 % meso für +23 % Naht. Das Muldenfeld war ein Blur mit **Radius 24**, seine
Energie liegt also oberhalb des Meso-Bandes (r6–r32): Tiefe zahlt dort ein, wo
meso nicht hinsieht, und dort, wo die Naht sitzt. Der wirksame Hebel ist der
**Radius**, bei gleicher Tiefe 1.4:

| Radius | meso | Raster | Naht |
|---|---|---|---|
| R24 | 10.04 | 4.58 | 1.17 |
| R12 | 11.42 | 5.04 | 1.20 |
| **R8** | **12.42** | 5.21 | 1.23 |

`regolith` selbst liegt bei meso 10.09 — R24 fügte also nichts hinzu. R8 bei
Tiefe 2.2 erreicht 15.30, reißt aber Raster (7.03) und Naht (1.43).

### kontext gibt weniger Relief zurück als die fotografische Quelle

Über den Prompt nicht steuerbar. Sechs Prompts, je fünf Fenster, alle auf
p70 108 gegradet, ohne Nachschärfen:

| Prompt | meso |
|---|---|
| WEATH | 15.83–16.75 |
| SLAB | 12.29–19.76 |
| R2LEDGE | 15.03–18.03 |
| R2SHELF | 14.47–21.20 |
| R2KNUCKLE | 15.82–18.19 |
| BED | 24.81–29.28 |

Zielband 26.2–31.0. Nur BED erreicht es — und zwar mit fluchtender Perspektive
und einer Faltlinie in der Mitte, also unkachelbar. Das ist die Fortsetzung von
„kontext ist NIE additiv" (§ 3): es regeneriert die Fläche, und die regenerierte
Fläche trägt weniger Relief als die Vorlage. **Wo Relief erhalten bleiben muss,
ist flux der falsche Weg** — ein gerolltes Fenster des Heros erbt es exakt
(`rocky_outcrop_0` = `latticeRoll(128,64)` von Slot 1: meso 27.93 gegen 28.33
der Quelle, max|NCC| 0.073).

### Die Kennzahl misst die Ursache, das Auge urteilt über die Wirkung

Fünf Lehren haben dasselbe Muster: eine Zahl misst etwas Wahres und
begründet trotzdem keine Arbeit.

- **micro4 und der Unsharp** — ein Filter hebt die Zahl um 56 %, ohne dass das
  Bild besser wird. *Die Zahl war erfüllbar, ohne dass die Ursache sich bewegte.*
- **die Vakuum-Abdunklung** — sie staucht jeden Pegel und lässt d′ auf drei
  Stellen unverändert. *Die Ursache bewegte sich, die Wirkung nicht.*
- **hpNCC und die Zwillinge** (§ 8) — sie findet die geteilte Aufnahme und sieht
  nicht, dass Pegel und Farbe die beiden Biome längst getrennt haben.
  *Die Ursache war da, die Wirkung nicht.*
- **„auf Spielskala erkennbar" ist nicht „auf Spielskala gut".** Bei `GLASS_CARBON`
  wurde ein grobes Hexagon-Geflecht hinter die Scheiben gesetzt, ausdrücklich so
  grob, dass es die 144 Gerätepixel (zoom 1, dpr 3) übersteht — und es überstand
  sie. Rudi verwarf es trotzdem: „zu überladen und unruhig, vor allem in
  kleineren zoomstufen." Die Lesbarkeitsschwelle war die falsche Frage; das
  Muster war sichtbar und hat das Bild **zugebaut**. `meso` stieg dabei um 35 %
  (16.07 → 21.69) — die Zahl war echt und trotzdem kein Argument, denn **meso
  misst zusätzliches Relief und kann Tiefe nicht von Unruhe unterscheiden.**
  *Die Kennzahl beantwortete eine Frage, die niemand gestellt hatte.* Wer
  Innenzeichnung hinzufügt, prüft nicht, ob sie ankommt, sondern ob das Bild
  danach ruhiger oder unruhiger liest — und zwar auf der kleinsten Zoomstufe,
  auf der es vorkommt, nicht bei 512 px, wo mehr Struktur fast immer besser
  aussieht.
- **meso unterzeichnet Steinfelder** — vorhergesagt und eingetreten. Sichtbare
  Steine liegen bei λ 40–90 px, also am oberen Rand des Meso-Bandes (r6–r32),
  und ein Teil ihrer Energie fällt schon darüber. Bei `rock_layer` ging meso von
  12.14 (nackte Basis) auf 13.2 — **+8 %**, das sieht nach nichts aus —, während
  `micro8` im selben Schritt von 5.63 auf 7.4 stieg, **+32 %**. Das Steinfeld ist
  auf dem Bild unübersehbar. *Die Kennzahl sah an der Ursache vorbei, weil das
  Band falsch lag.* Bei Steinen im oberen Bandbereich ist micro8 die tragende
  Zahl und meso der Nebenbefund — und das Urteil fällt an der Spielskala-Tafel.

Vor jedem Abnahmekriterium sind daher **zwei** Fragen zu stellen, nicht eine:

```
1. Kann ein Filter es erfüllen?
   Wenn ja, ist es eine Diagnose und kein Kriterium, und es braucht eine
   zweite Kennzahl in einem Band, das der Filter nicht erreicht.

2. Misst es das, was der Spieler SIEHT -- oder nur das, was es verursacht hat?
   Wenn nur die Ursache: berichten, aber keine Runde damit begruenden.
   Das Urteil faellt am gemischten Feld auf Spielskala.
```

---

## 6. Familien

**Erst die Familie vermessen, dann die erste Kachel bauen.**
`reef` brauchte acht Runden, weil erst am Ende gemessen wurde, was die Familie
trennt. Bei ICE hat die Vorabmessung die Risikopaare korrekt benannt, bevor
Arbeit hineinfloss.

**Ableiten nach dem, was die Dinge SIND, nicht nach messbarer Nähe.**
`glacier` aus `regolith`, weil der Boden eines Eismonds Regolith ist — nicht aus
dem alten blauen Gletschereis, das messtechnisch näher lag.

**Unterscheidbarkeit ist Diagnostik, kein Abnahmekriterium.**
Rudi: „es ist total ok wenn manche biome sehr ähnlich sind. im spiel machen
beide auch keinen großen unterschied aus." Messen und berichten, aber keine
Runde damit begründen. Nach dem Zwillings-Durchlauf gilt dasselbe für die
Korrelation zweier Bestandskacheln — siehe § 8.

**Nachbarschaft ist die z-EBENE, nicht der Himmelskörper.**
Oberfläche und Untergrund desselben Planeten grenzen nie aneinander: man
wechselt die Ebene, und dann sieht man immer nur eines von beiden. Und selbst
innerhalb des Untergrunds sind die Tiefenbänder disjunkt — `rock_layer` nur
Tiefe 1–3, `deep_stone` erst ab 4; `ice_cavern` bis 5, `deep_stone` eisig ab 6.
Wer die Nachbarschaft über den Körper zieht, prüft gegen Biome, die dem Spieler
nie nebeneinander begegnen. Maßgeblich sind die Tiefenregeln in
`Docs/planet-biomes-by-type.md`, nicht die Typzugehörigkeit.

**Props tragen die Plastizität, damit die Kachel flach bleiben darf.**
Die Arbeitsteilung: **Vertiefungen in die Kachel** (Risse, Krater, Furchen),
**Erhebungen in den Prop-Layer** (Blöcke, Brocken, Säulen).

---

## 7. Props

**Props werden über die HÖHE skaliert**, die Breite folgt dem
Sprite-Seitenverhältnis. Die Gesteinsfamilien hatten anfangs gar keinen Faktor
und kamen auf 93 % der Kachelbreite — so hoch wie ein Baum.

**Größe und Dichte nicht gleichzeitig senken.** Der erste Korrekturversuch tat
beides und ließ die Planeten leer wirken.

**Ein Prop für Wasser taugt nicht für festen Grund.** `ice_floe` ist mit
Wasserlinie gezeichnet und liegt auf Eis wie eine graue Platte in einer Pfütze.

**Flache Aufleger brauchen `PROP_GROUND_INSET`.** Der Standard-Ankerpunkt ist
die Südspitze der Raute (halbe Breite null) — ein Aufleger ohne Inset landet auf
drei Nachbarkacheln. Umgekehrt bekommt ein **stehendes** Objekt keinen Inset:
`ice_block` und `ice_rubble` stehen auf dem Grund, ihre Südspitzen-Verankerung
ist die richtige.

**`vee` trennt „rechtwinklig zum KÖRPER" von „rechtwinklig zur KAMERA" — und
nur diese eine Achse tut das.** In Iso zeichnet ein eckseitig stehender Fuß
seine beiden Unterkanten bei ±26,57°; ein frontal zur Kamera gedrehter zeichnet
eine waagerechte. Beides sind gerade Kanten an einem glaubwürdig gebrochenen
Körper, also sagt keine Kennzahl der Körperform etwas dazu. Belegt an einem
`ice_block`-Kandidaten, der auf **vier** Achsenmaßen mitten im Band seiner
angenommenen Geschwister lag und trotzdem falsch war: **vee 28,8 gegen
83,5–99,3** der vier abgenommenen.

Der Fehlertyp ist deshalb gefährlich, weil er **Rudis Abnahmetest übersteht**
(„sieht es aus, als hätte ein Mensch es dort hingestellt?"). Der Test zielt auf
die KÖRPERFORM — Sockel, parallele Gegenflächen, rechte Winkel, gleichförmiger
Querschnitt — und ein falsch im Raster stehender Sérac hat nichts davon. Er
steht nur falsch zum Gitter. **Stellung im Raster und Form des Körpers sind
zwei getrennte Prüfungen; die eine ersetzt die andere nicht.**

---

## 8. Zwillinge

**Zwei Biome können dasselbe Foto sein — und das ist meistens egal.**

Geprüft wurde in jeder Runde nur eine **neue** Kachel gegen **ihre eigene
Quelle**, nie zwei Bestandskacheln gegeneinander. Der Durchlauf über alle
220 Kacheln (24 090 Paare) holte das nach. Der vollständige Befund samt
Entscheidung steht in `Docs/PLAN-biome-zwillinge.md`.

### Was handwerklich gilt und bleibt

**Ein Skalar kann eine Korrelation nicht bewegen.** `flatten`,
`flattenRadial`, `grade` und `chromaFlatten` multiplizieren pro Pixel mit einem
Skalar, und der kürzt sich in der mittelwertfreien, längennormierten Korrelation
heraus. Gemessen an `fractured_zone` × `silicate_plain`: Originale **0.773** →
volle Compositing-Kette **0.441** → mit Gitterrollung **0.041**. Was beim
Compositing verschwindet, ist geteilte *Beleuchtung*, nicht geteilter Inhalt.

**ABER: ein Gewinn auf einer MASKE ist kein Skalar — und die Maske trifft genau
das Geteilte.** Das ist die Verschärfung der Regel darüber, und sie hat in der
UNDERGROUND-Runde zwei Anläufe gekostet. Ein maskierter Operator ist
ortsabhängig; er kürzt sich in der Korrelation nicht heraus, sondern **gewichtet
sie um**. Und wenn die Maske aus dem Bild abgeleitet ist, wählt sie das
auffällige Merkmal aus — also genau das, was zwei verwandte Kacheln
gemeinsam haben. Sie verstärkt den geteilten Anteil.

Gemessen am `ice_cavern`-Eis-Lift (+45 % Albedo auf der Kristallmaske) gegen
`crystal_field_1`, dieselbe Kachel in zwei Zuständen:

| gemessen an | max&#124;NCC&#124; |
|---|---|
| rohem flux-Fenster | 0.067 |
| **fertiger Kachel** | **0.125** ← über der Schwelle 0.12 |

Zwei Auswahlrunden hielten die Schranke am Zwischenstand ein und rissen sie am
Ergebnis. Daraus die Regel:

> **Korrelation immer am FERTIGEN Slot messen, nie am Zwischenstand.**
> Ein Vorabtest auf dem rohen Fenster ist nur dann gültig, wenn danach
> ausschließlich Skalare pro Pixel folgen (`flatten`, `grade`, `corrode`,
> `chromaFlatten`, `latticeRoll`). Sobald **ein** maskierter Operator in der
> Kette steht, ist er wertlos — dann muss jeder Kandidat fertig gebaut und
> dann gemessen werden. Das kostet einen `solveTile` pro Kandidat und ist
> billiger als die Runde, die es sonst kostet.

**Nur das Verschieben des Fensters trennt zwei Kacheln, und es kostet nichts.**
Dieselben Pixel, anderes Fenster auf dem Torus — kein Resampling, keine
Spiegelung, keine Änderung an Pegel, Farbe oder Aussehen. Über sieben gemessene
Paare fiel jedes mit **einer** Rollung unter 0.07.

**Die rohe NCC misst geteilte Beleuchtung mit.** Zwei merkmalslose Kacheln
erreichen 0.997, ohne verwandt zu sein — `ocean` gegen `ice_shelf` besteht fast
nur aus Rautenabschattung und Lichtrampe. Erst nach einem Hochpass (Blur r6)
beantwortet die Zahl „stammen beide aus derselben Aufnahme?". Über den Korpus:
**767 Paare über 0.15 roh, 31 nach dem Hochpass.**

### Und wo die Kennzahl aufhört

**hpNCC misst die Quelle, nicht die Wirkung — sie beweist nicht einmal die
Quelle.** Rudi zu `deep_stone` / `ice_cavern`: „die wurden getrennt generiert"
— zwei unabhängig erzeugte Kacheln, gemessen bei **0.600**. Gegen 19 bestätigt
geteilte Paare (dokumentierte Ableitungen ohne Rollung plus die biominternen
Spiegelpaare) mit einer Spanne von **0.205 bis 0.990**: drei davon liegen unter
dem bestätigt unabhängigen Paar. **Die Bereiche überlappen.** Ein hoher Wert ist
mit einer geteilten Quelle vereinbar, beweist sie nicht — die einfachere
Erklärung ist meist die geteilte Motivklasse (67.7 % der Treffer sind Fels ×
Fels oder Wasser × Wasser). Nach unten bleibt sie zuverlässig: gerollte
Ableitungen landen bei 0.02–0.09. **Guter Negativtest, schlechter Positivtest.**

**Und selbst eine echte geteilte Quelle ist meist unsichtbar.** Rudi:
„deep stone und ice cavern sehen komplett unterschiedlich aus. eins hell-blau,
eins grau-grün-dunkel." Der Hochpass entfernt genau das, woran das Auge zuerst
trennt — Pegel und Farbe. Von 13 gemeldeten Paaren blieben nach der
z-Ebenen-Prüfung 7, und von diesen liegen 5 bei d′-JOINT 23.6 bis 101.1 gegen
eine Schwelle von 8.9.

**Nachbarschaft ist die z-EBENE, nicht der Körper** — ausgeführt in § 6. Die
Regel „gemeinsamer Körper" hat allein daraus sechs Scheintreffer erzeugt,
darunter das angeblich folgenreichste Paar der Liste.

**Für eine DREHUNG ist eine Silhouetten-IoU der falsche Wächter, Volumenerhalt
der richtige.** Der Fall, in dem eine Kennzahl das Richtige misst und trotzdem
die falsche Frage beantwortet. Ein Sprite sollte per Bild-zu-Bild nur **gedreht**
werden, sonst unverändert; die Prüfung lief über die Silhouetten-IoU gegen das
Original. Sie kam bei **0,50–0,57** zurück — genau der Bereich, in dem eine
echte Drehung landet, also „bestanden". Drei Rückgaben, dreimal bestanden, und
alle drei waren **neu modelliert**: flache Bruchflächen weg, Masse anders
verteilt.

Die IoU misst dieselbe Überdeckung, die ein gedrehter und ein ausgetauschter
Körper haben können — sie kann die beiden Fälle gar nicht trennen, weil sie
nach der ÜBERLAPPUNG fragt und nicht nach der Erhaltung. Gefangen hat es erst
**Fläche/Höhe²**, ein drehinvariantes Volumenmaß: es fiel um **43–50 %**
(LESSONS-Bezug: `assets/rejected/ice_block_0_kontext_resculpt.png`, −45 %). Das
ist die Fortsetzung von „kontext ist NIE additiv" (§ 3) auf den Prop-Fall —
kontext dreht nicht, es regeneriert. **Wer eine invariante Eigenschaft prüfen
will, braucht ein Maß, das unter der erlaubten Änderung invariant ist, nicht
eines, das unter ihr einen plausiblen Wert annimmt.**

### Die Regel

Beim **Bauen** bleibt die Rollung Teil des Vorgangs und die Korrelationsprüfung
Teil der Gates — sie kostet nichts und verhindert den Fall, den die
ASTEROIDS-Runde selbst produziert hat (`dust_basin` Slot 0 mit Versatz (0,0),
0.574 gegen `rock_layer`, behoben).

```
BEIM BAUEN:
□ max|NCC| gegen jedes Biom, das auf DERSELBEN z-EBENE desselben
  Planetentyps vorkommen kann. Nicht ueber den ganzen Koerper.
□ Schwelle 0.12 (Referenz: crater ohne Rollung 0.897, mit Rollung 0.096)
□ max|NCC| zwischen den vier eigenen Slots, dieselbe Schwelle
□ bei Ableitungen aus EINER Quelle: alle sechs Paardifferenzen der
  Versaetze gegen das Torusgitter pruefen -- eine Differenz auf dem
  Gitter (erzeugt von (512,0) und (256,128)) macht zwei Kacheln identisch

NICHT:
✗ Korrelation als Abnahmekriterium fuer BESTANDSKACHELN
✗ "gleicher Koerper" als Nachbarschaft
✗ aus Erzeugungscharge und Korrelation auf einen geteilten Fotopool
  schliessen -- die Charge IST eine Motivklasse, die beiden Erklaerungen
  sind nicht trennbar (12 von 12 gleiche Charge = auch gleiches Motiv)
```

Rudi, nach dem vollständigen Durchlauf: „keines davon sehe ich als echtes
problem. ich würde alle so lassen."

---

## 9. Prozedurale Felder auf dem Iso-Torus

Vier Sätze der UNDERGROUND-Runde entstanden ohne einen einzigen flux-Aufruf,
allein aus einem Rauschfeld auf dem **dualen Gitter des Iso-Torus**
(`lib-corrode.torusNoise`, Werkzeug in `scripts/lib-stones.cjs`). Das ist
inzwischen der Standardweg für jede Materialschicht: nahtlos per Konstruktion,
keine Kachelung, die erst wieder hergestellt werden muss, und bei
`metallic_surface` hat es die Kachelung messbar nichts gekostet
(Raster 8.23 → 8.18). Was dabei gelernt wurde:

**Das 512×256-Rechteck ist in x UND in y periodisch.** Beide `(512,0)` und
`(0,256) = 2·a₂ − a₁` sind Gittervektoren, also darf jede Ableitung und jeder
Blur auf dem Rauschfeld mit einfachem Modulo-Wrap rechnen — kein Rand, kein
Abschneiden, keine Sonderbehandlung.

**Ein breites Wellenlängenband bei hoher Deckung ergibt ein LABYRINTH, kein
Steinfeld.** Eine Schwelle auf einem Band von λ 55–130 px bei 42 % Deckung
liefert eine zusammenhängende, mäandernde Fläche — sie sah aus wie Schlamm.
Der Weg ist ein **Maximum über mehrere Größenklassen**: pro Klasse ein
schmalbandiges Feld (±30 % um λ) bei *niedriger* Deckung, das runde Inseln gibt,
und diese Klassen per `max()` überlagert. Eine Summe verschmilzt zwei benachbarte
Steine zu einem Hügel; ein Maximum lässt zwischen ihnen eine **Kerbe** stehen,
und genau diese Kerbe macht ein Kopfsteinpflaster als *einzelne* Steine lesbar.
Große Steine müssen dabei höher sein als kleine (Amplitude ~ λ^0.6), sonst liest
das Feld als eine Ebene aus Punkten gleicher Höhe. Die Zieldeckung wird
nachgeregelt, weil die Klassen sich überlappen und `1−(1−c)^K` nicht trifft.

**Ein Stein ist nicht nur eine Beule — Schattierung allein reicht nicht.**
Der erste Anlauf hatte nur den Lambert-Term aus der Ableitung des Höhenfeldes.
Ein Lambert-Term lässt die **Oberseite** eines Steins exakt so aussehen wie den
Grund daneben: dort ist die Normale senkrecht, der Gewinn ist 1. Sichtbar waren
deshalb nur die Ränder, und Ränder ohne Fläche lesen als **Löcher**, nicht als
Steine. Es braucht die beiden anderen Unterschiede, die ein Stein gegen Erde
wirklich hat:

| | was es tut | warum |
|---|---|---|
| **Albedo** | Steinfläche auf eigenem Pegel, mittelwertfrei angewandt (M minus Maskenmittel) | ein Stein hat eine andere Rückstreuung als Erde; mittelwertfrei, damit p70 nicht driftet und `solveTile` nichts nachräumen muss |
| **Textur** | Meso- und Kornband **innerhalb** der Maske dämpfen, außerhalb voll stehen lassen | eine Steinfläche ist glatt, Erde ist krümelig — derselbe Drei-Band-Split wie `lib-band.bandScale`, nur ortsabhängig |

Beides sind Skalare pro Pixel, Farbton, `cbPP` und `cbSd` bleiben unberührt.
Bei `rock_layer` hob das den Luma-Abstand Stein↔Grund von 0.7 auf 7.9.

**Und die Ebene aus der MASKE herausrechnen, nicht aus dem Bild.** Fortsetzung
des `metallic_surface`-Befunds (§ 5): das Rauschfeld legt sonst eine angepasste
Ebene zurück ins Farbfeld. Hier wird sie schon **vor** der Schwelle aus dem
Rauschen entfernt und die Restebene der fertigen Maske noch einmal gemessen;
Ergebnis über zwölf Slots `cbPP` 0.009–0.094 gegen die 0.164, die es unbehandelt
gekostet hätte.

**Jeder Slot bekommt sein eigenes Feld, nicht nur ein anderes Fenster.**
Bei kleinen Elementen reicht der Gitterversatz eines Heros. Bei `deep_stone`
(λ bis 130 px, gut ein Dutzend Steine auf der Kachel) bleiben zwei verschobene
Fenster desselben Feldes sich statistisch ähnlich: gemessen max|NCC| 0.110–0.112
unter den vier Slots gegen eine Schwelle von 0.12. Mit eigenem Rauschseed pro
Slot **auf einer trotzdem gerollten Basis** — beide Quellen der Ähnlichkeit
gebrochen — fiel derselbe Wert auf 0.040. Kostet vier `solveTile` statt einem.
