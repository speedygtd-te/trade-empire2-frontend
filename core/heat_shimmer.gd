class_name HeatShimmer
extends RefCounted
## How strongly hot air shimmers over the colony on a hot body (Rudi, 2026-11-20, "Variante 1"):
## a distortion of the 3D picture (game/world/heat_shimmer.gdshader), from the body's surface
## temperature (`Environment.temperature`, °C) and the daylight. Visual only.
##
## Nothing up to START_C, faint at FAINT_C, full at FULL_C and above (capped). The sun heats the
## ground: by night the shimmer keeps NIGHT_SHARE of its strength. The slowest detail tier and
## the cutaway view (underground, no air above) show none; MEDIUM a weaker one.

const START_C := 60.0
const FAINT_C := 100.0
const FULL_C := 400.0
## Strength at FAINT_C (full sun).
const FAINT := 0.15
## Share of the strength that stays at night.
const NIGHT_SHARE := 0.6
## Share on the MEDIUM detail tier.
const MEDIUM_SHARE := 0.6
## Below this the effect is switched off entirely (no shader on the picture).
const OFF_BELOW := 0.01


## Strength 0..1 from the surface temperature (°C) and the daylight (0 night .. 1 full sun).
static func strength(celsius: float, daylight: float) -> float:
	var heat := 0.0
	if celsius <= START_C:
		return 0.0
	elif celsius < FAINT_C:
		heat = FAINT * (celsius - START_C) / (FAINT_C - START_C)
	else:
		heat = lerpf(FAINT, 1.0, clampf((celsius - FAINT_C) / (FULL_C - FAINT_C), 0.0, 1.0))
	return heat * lerpf(NIGHT_SHARE, 1.0, clampf(daylight, 0.0, 1.0))


## The strength actually shown on a detail tier: none on SLOW and in the cutaway, weaker on
## MEDIUM, and 0 when too faint to be worth a shader.
static func shown(strength_value: float, tier: DetailGovernor.Tier, cutaway: bool) -> float:
	if cutaway or tier == DetailGovernor.Tier.SLOW:
		return 0.0
	var value := strength_value * (MEDIUM_SHARE if tier == DetailGovernor.Tier.MEDIUM else 1.0)
	return value if value >= OFF_BELOW else 0.0
