class_name MemberLinks
extends RefCounted
## What an enterprise's research gives its members (draft.39, Backend-V2
## `docs/SPEC-enterprise-flaggschiff.md` Kap. 6a, `crates/game/src/links.rs`):
##
## - Member blueprints: some enterprise techs unlock player blueprints for every current member
##   (`memberUnlocksBlueprints`). After leaving, expulsion or dissolving they are gone
##   (`BLUEPRINT_LOCKED`); built modules stay, draw power and stand idle (`NO_ENTERPRISE`).
## - Member modules work only while their link holds: `MINING_OPTIMIZER` while the enterprise
##   has a working `MINING_EFFICIENCY_DISTRIBUTOR`, `OBSERVATION_UPLINK` while an
##   `OBSERVATION_PLATFORM` works, `RESEARCH_NETWORK_NODE` while the enterprise researched the
##   network (lab networking itself follows later).
## - Extraction focus: a working optimizer sends `EXTRACTION_FOCUS` over the hulls of its level;
##   extraction modules gain from the strongest one only (E34): +10 % right beside it, 2 % less
##   per further hull.
##
## The server decides; this only previews and names it.

const OPTIMIZER := "MINING_OPTIMIZER"
const UPLINK := "OBSERVATION_UPLINK"
const NODE := "RESEARCH_NETWORK_NODE"
const PLATFORM := "OBSERVATION_PLATFORM"
const DISTRIBUTOR := "MINING_EFFICIENCY_DISTRIBUTOR"
const ARCHIVE := "CARTOGRAPHY_ARCHIVE"
const EXTRACTION_FOCUS := "EXTRACTION_FOCUS"
## Idle reason of a member module (or of production with a member blueprint) without its link.
const IDLE_NO_ENTERPRISE := "NO_ENTERPRISE"
const MEMBER_MODULES: PackedStringArray = [OPTIMIZER, UPLINK, NODE]
## Received strength (micro) × effect (micro-percent) / this = bonus in millionths.
const PPM_DIVISOR := 10000000000

## Why a blueprint cannot be chosen.
enum Lock {
	## It can.
	NONE,
	## It needs the player's own research.
	RESEARCH,
	## A member blueprint, and the player is in no enterprise.
	JOIN,
	## A member blueprint the player's enterprise has not researched.
	ENTERPRISE,
}


## What one extraction module gains from the strongest optimizer that reaches it.
class Focus:
	extends RefCounted
	var module_id := 0
	## The optimizer whose focus counts.
	var source_id := 0
	## Hulls between them (1 = right beside it).
	var distance := 0
	## Extra production in millionths (100 000 = +10 %).
	var bonus_ppm := 0


static func is_member_module(module_type: String) -> bool:
	return MEMBER_MODULES.has(module_type)


## Why `blueprint` cannot be chosen: NONE when `usable` has it; a member blueprint (some tech's
## `memberUnlocksBlueprints`) JOIN outside an enterprise, ENTERPRISE inside; RESEARCH otherwise.
static func lock_of(blueprint: String, usable: Dictionary, catalog: ResearchCatalog, in_enterprise: bool) -> Lock:
	if usable.has(blueprint):
		return Lock.NONE
	if catalog != null and catalog.member_tech_of(blueprint) != null:
		return Lock.ENTERPRISE if in_enterprise else Lock.JOIN
	return Lock.RESEARCH


## The focus every extraction module of `layout` gets (module id → Focus; only those reached).
## Sources are the optimizers that are built, not disabled and not idle (`idle`: module id →
## reason, NO_ENTERPRISE means its link is down). Strength `baseStrength − distance × decay`
## over the hulls of the same level (4-neighbourhood) from every cell of the optimizer's
## footprint; a receiver counts with its nearest cell. Full staff is assumed for the strength.
static func focus(layout: StructureLayout, definitions: GameDefinitions, idle: Dictionary) -> Dictionary:
	var result: Dictionary = {}
	if layout == null or definitions == null:
		return result
	var decay := definitions.emission_decay(EXTRACTION_FOCUS)
	if decay <= 0:
		return result
	for source: StructureLayout.Module in layout.modules():
		var source_def := definitions.module(source.module_type)
		if source_def == null or source.is_building() or source.is_disabled():
			continue
		if Wire.as_string(idle.get(source.module_id)) == IDLE_NO_ENTERPRISE:
			continue
		var strength := source_def.emission_strength(EXTRACTION_FOCUS)
		if strength <= 0:
			continue
		var reach := ceili(float(strength) / float(decay))
		var seen: Dictionary = {}
		var frontier: Array[Vector3i] = source.cells()
		for cell: Vector3i in frontier:
			seen[cell] = true
		var hit: Dictionary = {}
		for distance: int in range(1, reach + 1):
			var received := strength - distance * decay
			var next: Array[Vector3i] = []
			for cell: Vector3i in frontier:
				for step: Vector3i in [Vector3i(1, 0, 0), Vector3i(-1, 0, 0), Vector3i(0, 1, 0), Vector3i(0, -1, 0)]:
					var near := cell + step
					if seen.has(near) or layout.hull_at(near).is_empty():
						continue
					seen[near] = true
					next.append(near)
					var target := layout.module_at(near)
					if target == null or target.module_id == source.module_id or hit.has(target.module_id):
						continue
					hit[target.module_id] = true
					if received <= 0:
						continue
					var target_def := definitions.module(target.module_type)
					var effect := target_def.sensitivity(EXTRACTION_FOCUS) if target_def != null else 0
					if effect <= 0:
						continue
					var ppm := int(float(received) * float(effect) / float(PPM_DIVISOR))
					var best := result.get(target.module_id) as Focus
					if best == null or ppm > best.bonus_ppm:
						var entry := Focus.new()
						entry.module_id = target.module_id
						entry.source_id = source.module_id
						entry.distance = distance
						entry.bonus_ppm = ppm
						result[target.module_id] = entry
			frontier = next
			if frontier.is_empty():
				break
	return result


## The modules whose strongest focus comes from optimizer `source_id`, nearest first.
static func reached_by(focus_map: Dictionary, source_id: int) -> Array[Focus]:
	var result: Array[Focus] = []
	for entry: Focus in focus_map.values():
		if entry.source_id == source_id:
			result.append(entry)
	result.sort_custom(func(a: Focus, b: Focus) -> bool:
		return a.distance < b.distance if a.distance != b.distance else a.module_id < b.module_id)
	return result


## The bonus as a whole percent text value ("10", "8" …), at least one decimal below 1 %.
static func percent_text(bonus_ppm: int) -> String:
	if bonus_ppm >= 10000 and bonus_ppm % 10000 == 0:
		@warning_ignore("integer_division")
		return str(bonus_ppm / 10000)
	return String.num(bonus_ppm / 10000.0, 1)
