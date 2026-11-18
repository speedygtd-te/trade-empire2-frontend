class_name GalaxyCamera
extends RefCounted
## The rules that tie the galaxy view's zoom to what it shows and loads.
##
## The view looks down on the galactic plane; its scale is units (light years) per canvas pixel.
## Far out it shows the galaxy's shape only. Once the visible circle (half the diagonal of the
## free area) is at most SYSTEMS_FROM units across, the real systems are loaded: a sphere around
## the camera a bit larger than the visible circle, so small pans need no new request, but never
## beyond the density limit (`GalaxyShape.query_radius_limit`, smaller in the core). A request
## is only sent when no loaded sphere already covers what is visible (within that limit).

## Visible radius (units) from which real systems load and show.
const SYSTEMS_FROM := 400.0
## Visible radius at which the stand-in stars and the glow are fully replaced by real systems.
const SYSTEMS_FULL := 200.0
## The loaded sphere is this much larger than the visible circle.
const LOAD_MARGIN := 1.3
## Closest zoom: units per canvas pixel (about 36 ly across a phone screen).
const MIN_UNITS_PER_PX := 0.05
## The whole galaxy fits with this much room.
const FIT_ROOM := 1.05
## Visible radius after "Home": the neighbourhood, some hundred systems (near the live home about
## a thousand in the loaded sphere).
const HOME_RADIUS := 40.0
## Star dots: average spacing (px) at which they keep their full size, and the limits of the factor.
const STAR_SPACING_PX := 24.0
const STAR_SCALE_MIN := 0.35
const STAR_SCALE_MAX := 1.6


## Radius of the circle around the centre that covers the visible area.
static func visible_radius(area: Vector2, units_per_px: float) -> float:
	return area.length() * 0.5 * units_per_px


## Units per pixel that show the whole galaxy (±`extent`) in `area`.
static func fit_units_per_px(area: Vector2, extent: float) -> float:
	return 2.0 * extent * FIT_ROOM / maxf(minf(area.x, area.y), 1.0)


## Units per pixel for a visible radius.
static func units_per_px_for(area: Vector2, radius: float) -> float:
	return radius / maxf(area.length() * 0.5, 1.0)


## Zoom kept between the closest view and the whole galaxy.
static func clamp_units_per_px(units_per_px: float, area: Vector2, extent: float) -> float:
	return clampf(units_per_px, MIN_UNITS_PER_PX, maxf(fit_units_per_px(area, extent), MIN_UNITS_PER_PX))


## True when the view is close enough for real systems.
static func shows_systems(visible: float) -> bool:
	return visible <= SYSTEMS_FROM


## How much the far layers (glow, stand-in stars) still show: 1 down to SYSTEMS_FROM, 0 at
## SYSTEMS_FULL and closer.
static func far_share(visible: float) -> float:
	return clampf((visible - SYSTEMS_FULL) / (SYSTEMS_FROM - SYSTEMS_FULL), 0.0, 1.0)


## The radius that has to be loaded for the view: the visible circle, at most `limit`.
static func needed_radius(visible: float, limit: float) -> float:
	return minf(visible, limit)


## The radius to ask for: LOAD_MARGIN beyond the visible circle, at most `limit`; 0 when the view
## is too far out for systems.
static func request_radius(visible: float, limit: float) -> float:
	if not shows_systems(visible):
		return 0.0
	return minf(visible * LOAD_MARGIN, limit)


## Size of the grid cells for stand-in stars: about a sixteenth of the visible width, rounded to a
## power of two of `base` so the pattern only changes when the zoom changes a lot.
static func cell_size(visible: float, base: float = 50.0) -> float:
	var wanted := maxf(visible / 8.0, base)
	return base * pow(2.0, roundf(log(wanted / base) / log(2.0)))


## Query for `GET /v2/galaxy/systems`: centre and radius with one decimal (the contract takes
## numbers; one decimal is far below a pixel).
static func query(centre: Vector3, radius: float) -> String:
	return "x=%.1f&y=%.1f&z=%.1f&radius=%.1f" % [centre.x, centre.y, centre.z, radius]


## Length of the scale bar: the largest 1, 2 or 5 × 10ⁿ not above `most` (at least 1).
static func scale_length(most: float) -> float:
	if most < 1.0:
		return 1.0
	var decade := pow(10.0, floorf(log(most) / log(10.0)))
	for step: float in [5.0, 2.0, 1.0]:
		if step * decade <= most:
			return step * decade
	return decade


## Factor on the star dots for an average spacing of `spacing_px` between neighbours on screen:
## dense fields get small dots so they do not merge into a white carpet, a few neighbours larger ones.
static func star_scale(spacing_px: float) -> float:
	return clampf(spacing_px / STAR_SPACING_PX, STAR_SCALE_MIN, STAR_SCALE_MAX)


## Average spacing (px) of stars with `per_area` stars per unit² seen from above, at
## `units_per_px`; INF without stars.
static func spacing_px(per_area: float, units_per_px: float) -> float:
	if per_area <= 0.0 or units_per_px <= 0.0:
		return INF
	return 1.0 / (units_per_px * sqrt(per_area))


## How much the glow shows: a quarter up close, growing with the logarithm of the visible radius
## to full at a hundred times SYSTEMS_FULL and beyond.
static func glow_share(visible: float) -> float:
	var share := clampf(log(maxf(visible, 1.0) / SYSTEMS_FULL) / log(100.0), 0.0, 1.0)
	return 0.25 + 0.75 * share
