# Biome pro Planetentyp

> Quelle (Kanon): `shared/surface/biome-types.ts` (`PLANET_BIOMES`, Oberfläche) +
> `shared/surface/underground-biome.ts` (`resolveUndergroundBiome`, z < 0).
> Aufgelöst wird ein Biom aus Höhen-/Feuchte-Noise (`resolveBiome` je Typ); diese
> Listen sind die vollständige Menge der pro Typ **möglichen** Biome.

## Oberfläche (z ≥ 0)

| Planetentyp | Biome |
|---|---|
| **EARTH_LIKE** | OCEAN, BEACH, PLAINS, FOREST, MOUNTAIN, SNOW_PEAK, SWAMP, DESERT_PATCH |
| **DESERT** | SAND_DUNES, ROCKY_DESERT, MESA, SALT_FLAT, OASIS, CANYON |
| **OCEAN** | DEEP_OCEAN, SHALLOW_WATER, REEF, ISLAND, KELP_FOREST, VOLCANIC_VENT |
| **ICE** | GLACIER, FROZEN_LAKE, TUNDRA, ICE_SHELF, PERMAFROST, CREVASSE |
| **VOLCANIC** | LAVA_FLOW, BASALT_PLAIN, ASH_FIELD, CALDERA, OBSIDIAN_RIDGE, FUMAROLE |
| **BARREN** | REGOLITH, CRATER, DUST_PLAIN, ROCKY_OUTCROP |
| **TOXIC** | ACID_LAKE, TOXIC_MARSH, CORRODED_PLAIN, CHEMICAL_VENT, CRYSTAL_FIELD |
| **GAS_GIANT** | PLAINS ⚠️ *(keine echte Oberfläche — Fallback-Biom)* |
| **ICE_GIANT** | GLACIER ⚠️ *(keine echte Oberfläche — Fallback-Biom)* |
| **ASTEROID_M** | METALLIC_SURFACE, IMPACT_CRATER, BOULDER_FIELD, DUST_BASIN |
| **ASTEROID_C** | CARBON_CRUST, SILICATE_PLAIN, FRACTURED_ZONE, DUST_BASIN |
| **ASTEROID_S** | SILICATE_PLAIN, IMPACT_CRATER, VOID_EDGE, BOULDER_FIELD |
| **MOON_ROCKY** | REGOLITH, CRATER, DUST_PLAIN, ROCKY_OUTCROP |
| **MOON_ICY** | GLACIER, FROZEN_LAKE, ICE_SHELF, PERMAFROST, CREVASSE, TUNDRA |
| **MOON_VOLCANIC** | LAVA_FLOW, BASALT_PLAIN, ASH_FIELD, CALDERA, FUMAROLE, OBSIDIAN_RIDGE |

## UNDERGROUND (z < 0) — eigener „Planetentyp"

> ⚠️ **Korrigiert am 2026-09-06 gegen den Code**, nachdem die frühere Fassung
> beim Ausmessen der Grenzzellen an drei Stellen widerlegt wurde.
> **Quelle der Wahrheit:** `Backend/shared/surface/underground-biome.ts`,
> Funktion `resolveUndergroundBiome` samt ihren drei Helfern
> `resolveStandardUnderground`, `resolveIcyUnderground`,
> `resolveVolcanicUnderground`; die Schwelle kommt aus
> `Backend/shared/surface/biome-environment.ts`, `calculateDeepThreshold`.
> Aufgerufen wird das aus `Backend/lambdas/planet/surface/handler.ts:82-91`.
> Stand des Backend-Arbeitsbaums: letzte Änderung an `shared/surface` am
> 2026-08-24 (`c8882f6`). **Dieses Dokument ist eine Abschrift und kann wieder
> driften — im Zweifel dort nachsehen, nicht raten.**

Untertage hängt das Biom **nicht** vom Oberflächen-Typ, sondern von einer von drei
Untergrund-**Familien** + der Tiefe ab. Tiefe = `|z|`. Ab der Tief-Schwelle
`deepThresholdDepth` greift für JEDEN Typ die vulkanische Leiter — **aber mit
zurückgesetzter Tiefe**, siehe unten.

### Die Schwelle ist typischerweise 7, nicht 5

```
deepThreshold = floor(-8 + tempFaktor*3 + gravFaktor*2 + volcFaktor*3)
  tempFaktor = clamp01((temperature + 200) / 700)
  gravFaktor = clamp01(gravity / 3)
  volcFaktor = clamp01(volcanism / 100)
```

Wertebereich **-8 … 0**, `deepThresholdDepth = |deepThreshold|`. Für einen
durchschnittlichen Körper (Temperatur 0 °C, Gravitation 1 g, Vulkanismus 0)
ergibt das **-7**. Die 5 in der Signatur von `resolveUndergroundBiome` ist nur
der Default der Einzelfunktion — der Handler übergibt immer den gerechneten
Wert. Wer mit 5 plant, plant für den falschen Planeten.

### Reihenfolge der Regeln

```
1. Tiefe >= Schwelle           -> resolveVolcanicUnderground(Tiefe - Schwelle, elevation)
2. ICE / MOON_ICY / ICE_GIANT  -> resolveIcyUnderground(Tiefe, elevation)
3. VOLCANIC / MOON_VOLCANIC    -> resolveVolcanicUnderground(Tiefe, elevation)
4. alle übrigen                -> resolveStandardUnderground(Tiefe, elevation, moisture)
```

| Familie | gilt für Planetentypen | Biome |
|---|---|---|
| **Standard** | alle außer den beiden unten (EARTH_LIKE, DESERT, OCEAN, BARREN, TOXIC, GAS_GIANT, ASTEROID_M/C/S, MOON_ROCKY) | ROCK_LAYER, MINERAL_VEIN, CAVE_FLOOR, DEEP_STONE |
| **Eisig** | ICE, MOON_ICY, ICE_GIANT | ICE_CAVERN, MINERAL_VEIN, (DEEP_STONE nur bei Schwelle ≥ 7) |
| **Vulkanisch** | VOLCANIC, MOON_VOLCANIC | ROCK_LAYER, MINERAL_VEIN, MAGMA_POCKET |
| **Tiefer Kern** (Tiefe ≥ Schwelle, ALLE Typen) | — | **ROCK_LAYER, MINERAL_VEIN, MAGMA_POCKET** |

**Tiefen-Regeln je Familie** (in dieser Reihenfolge ausgewertet):
- **Standard:** `Tiefe≥8`→DEEP_STONE ⚠️ *toter Zweig, siehe unten*;
  `elevation>0.7`→MINERAL_VEIN; `moisture>0.6 & Tiefe<4`→CAVE_FLOOR;
  `Tiefe≥4`→DEEP_STONE; sonst ROCK_LAYER.
- **Eisig:** `Tiefe≥6`→DEEP_STONE ⚠️ *nur bei Schwelle 7 oder 8 erreichbar*;
  `elevation>0.7`→MINERAL_VEIN; sonst ICE_CAVERN.
- **Vulkanisch:** `Tiefe≥6`→MAGMA_POCKET; `elevation>0.7`→MINERAL_VEIN;
  `Tiefe≥3`→MAGMA_POCKET; sonst ROCK_LAYER.
- **Tiefer Kern:** dieselbe vulkanische Leiter, aber mit `Tiefe − Schwelle`.

### Die drei Korrekturen im Klartext

1. **LAVA_FLOW kommt untertage NICHT vor.** Keine der drei Auflösefunktionen
   gibt es je zurück — der Zweig existiert schlicht nicht. Die frühere Zeile
   „Tiefer Kern → MAGMA_POCKET / LAVA_FLOW" war falsch. LAVA_FLOW bleibt ein
   reines Oberflächenbiom (VOLCANIC / MOON_VOLCANIC).
2. **Der tiefe Kern beginnt nicht mit Magma.** Er ruft die vulkanische Leiter
   mit **zurückgesetzter** Tiefe auf (`Tiefe − Schwelle`). Auf der Schwelle
   selbst ist das Tiefe 0 → **ROCK_LAYER** (bzw. MINERAL_VEIN bei
   `elevation>0.7`). MAGMA_POCKET erscheint erst ab **Schwelle + 3**, ab
   **Schwelle + 6** ist die Ebene reines MAGMA_POCKET (der `Tiefe≥6`-Zweig
   kommt vor dem MINERAL_VEIN-Zweig).
3. **Zwei Zweige sind toter bzw. fast toter Code.** Der Standard-Zweig läuft
   nur für `Tiefe < Schwelle ≤ 8`, also erreicht `Tiefe≥8`→DEEP_STONE **nie**.
   Der eisige `Tiefe≥6`→DEEP_STONE braucht Schwelle ≥ 7 und liefert dann eine
   Ebene aus **einem einzigen** Biom.

### Welche Biome eine z-Ebene wirklich tragen kann

Maßgeblich für alles, was mit Nachbarschaft zu tun hat (Übergänge, Zwillinge):
eine z-Ebene ist **genau eine Tiefe**. T = `deepThresholdDepth`.

| Ebene | Biome | Paare |
|---|---|---|
| Standard, Tiefe 1–3 | MINERAL_VEIN, CAVE_FLOOR, ROCK_LAYER | 3 |
| Standard, Tiefe 4 … T−1 | MINERAL_VEIN, DEEP_STONE | 1 |
| Eisig, Tiefe 1 … min(5, T−1) | MINERAL_VEIN, ICE_CAVERN | 1 |
| Eisig, Tiefe 6 … T−1 (nur T ≥ 7) | DEEP_STONE allein | 0 |
| Vulkanisch, Tiefe 1–2 | MINERAL_VEIN, ROCK_LAYER | 1 |
| Vulkanisch, Tiefe 3 … min(5, T−1) | MINERAL_VEIN, MAGMA_POCKET | 1 |
| Tiefer Kern, Tiefe−T = 0…2 | MINERAL_VEIN, ROCK_LAYER | (Dublette) |
| Tiefer Kern, Tiefe−T = 3…5 | MINERAL_VEIN, MAGMA_POCKET | (Dublette) |
| Tiefer Kern, Tiefe−T ≥ 6 | MAGMA_POCKET allein | 0 |

**Sechs verschiedene Untergrundpaare**, nicht sieben — `MAGMA_POCKET|LAVA_FLOW`
gibt es nicht. Gemessen (Produktionsgenerator, 12 Seeds je Ebene, 256×256):
Grenzzellenanteil **0,49 % bis 1,42 %** je Ebene.

## Vollständige Underground-Biom-Liste
ROCK_LAYER, MINERAL_VEIN, CAVE_FLOOR, MAGMA_POCKET, DEEP_STONE, ICE_CAVERN
— **sechs**, und LAVA_FLOW ist NICHT darunter.
