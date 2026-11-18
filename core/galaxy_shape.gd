class_name GalaxyShape
extends RefCounted
## The shape of the galaxy from `GET /v2/galaxy`: how densely systems lie at a point, so the far
## view can be drawn without loading a single system. Display only — which systems exist is the
## server's, the client never derives one from this.
##
## Density per unit³ (contract, `GalaxyDensity`): core `core · exp(−2 (d/coreRadius)²)`, disk
## `disk · exp(−r / (0.3 · radius)) · exp(−|z| / (0.5 · diskThickness)) · (1 + 4 · arm)`, halo
## `halo · exp(−2 d / radius)`, at most `cap`; 0 beyond 1.5 · radius and beyond `zLimit`. The
## server adds ±20 % noise per sector, which the client leaves out. `r` is the distance from the
## axis, `d` from the centre. The arm term is the strongest of the logarithmic spirals.
##
## For drawing from above, `column_density` integrates over z: the core's Gaussian gives
## coreRadius · √(π/2), the disk's exponential diskThickness, the halo roughly radius (an
## approximation; the halo is faint). Brightness is logarithmic over BRIGHTNESS_DECADES from the
## centre's column, so the outer disk stays visible next to the core.

## Systems a query may bring at most (contract: 20 000); the client aims below it, because the
## density at the camera is only an estimate (noise, arms, z).
const QUERY_BUDGET := 12000.0
## Radius limits of `GET /v2/galaxy/systems` (contract: 0 < radius ≤ 200).
const MAX_QUERY_RADIUS := 200.0
const MIN_QUERY_RADIUS := 5.0
## Decades of column density between the brightest point (the centre) and black.
const BRIGHTNESS_DECADES := 4.0
## How far the far view reaches around the centre, in units of `radius`.
const VIEW_EXTENT := 1.15
## Star colours of the far view (depiction only): old warm core, young blue arms, the disk between.
const CORE_TINT := Color(1.0, 0.84, 0.6)
const ARM_TINT := Color(0.62, 0.74, 1.0)
const DISK_TINT := Color(0.86, 0.82, 0.76)

var galaxy_name := ""
var radius := 50000.0
var arm_count := 0
var arm_tightness := 1.0
var core_radius := 0.0
var disk_thickness := 0.0
## |z| beyond which there are no systems; 0 when unlimited.
var z_limit := 0.0
var core := 0.0
var disk := 0.0
var halo := 0.0
## Upper limit of the density; 0 when there is none.
var cap := 0.0
var sector_size := Vector3(50.0, 50.0, 50.0)
## Light years per coordinate unit.
var ly_per_unit := 1.0

var _peak := 0.0


## The shape of a `GalaxyResponse`; null when it has no usable radius.
static func from_galaxy(data: Dictionary) -> GalaxyShape:
	var shape := GalaxyShape.new()
	shape.galaxy_name = Wire.as_string(data.get("name"))
	shape.radius = SystemMap.number(data.get("radius"))
	if shape.radius <= 0.0:
		return null
	shape.arm_count = maxi(Wire.as_int(data.get("armCount")), 0)
	shape.arm_tightness = SystemMap.number(data.get("armTightness"))
	if shape.arm_tightness <= 0.0:
		shape.arm_count = 0
		shape.arm_tightness = 1.0
	shape.core_radius = maxf(SystemMap.number(data.get("coreRadius")), 0.0)
	shape.disk_thickness = maxf(SystemMap.number(data.get("diskThickness")), 0.0)
	shape.z_limit = maxf(SystemMap.number(data.get("zLimit")), 0.0)
	var density := Wire.as_dict(data.get("density"))
	shape.core = maxf(SystemMap.number(density.get("core")), 0.0)
	shape.disk = maxf(SystemMap.number(density.get("disk")), 0.0)
	shape.halo = maxf(SystemMap.number(density.get("halo")), 0.0)
	shape.cap = maxf(SystemMap.number(density.get("cap")), 0.0)
	var sector := Wire.as_dict(data.get("sectorSize"))
	var cube := Vector3(SystemMap.number(sector.get("x")), SystemMap.number(sector.get("y")), SystemMap.number(sector.get("z")))
	if cube.x > 0.0 and cube.y > 0.0 and cube.z > 0.0:
		shape.sector_size = cube
	var per_unit := SystemMap.number(data.get("lyPerUnit"))
	shape.ly_per_unit = per_unit if per_unit > 0.0 else 1.0
	shape._peak = shape.column_density(0.0, 0.0)
	return shape


## Strength of the spiral arms at (x, y), 0..1: the best match over the arms of
## exp(−Δθ² / (2 w²)), Δθ folded to ±π, w = 0.3 + 0.1 · r / radius; 0 near the axis (r < 1).
func arm(x: float, y: float) -> float:
	var r := sqrt(x * x + y * y)
	if arm_count <= 0 or r < 1.0 or core_radius <= 0.0:
		return 0.0
	var winding := log(r / (0.5 * core_radius)) / arm_tightness
	var angle := atan2(y, x)
	var width := 0.3 + 0.1 * r / radius
	var best := 0.0
	for k: int in arm_count:
		var delta := fposmod(angle - (winding + TAU * k / arm_count) + PI, TAU) - PI
		best = maxf(best, exp(-delta * delta / (2.0 * width * width)))
	return best


## Systems per unit³ at a point, without the server's noise.
func density(point: Vector3) -> float:
	var r := Vector2(point.x, point.y).length()
	if r > 1.5 * radius or (z_limit > 0.0 and absf(point.z) > z_limit):
		return 0.0
	var d := point.length()
	var sum := 0.0
	if core_radius > 0.0:
		sum += core * exp(-2.0 * (d / core_radius) * (d / core_radius))
	if disk_thickness > 0.0:
		sum += disk * exp(-r / (0.3 * radius)) * exp(-absf(point.z) / (0.5 * disk_thickness)) * (1.0 + 4.0 * arm(point.x, point.y))
	sum += halo * exp(-2.0 * d / radius)
	return minf(sum, cap) if cap > 0.0 else sum


## Systems per unit² seen from above at (x, y): the density summed over z (see the class notes).
func column_density(x: float, y: float) -> float:
	var r := sqrt(x * x + y * y)
	if r > 1.5 * radius:
		return 0.0
	var sum := 0.0
	if core_radius > 0.0:
		sum += core * exp(-2.0 * (r / core_radius) * (r / core_radius)) * core_radius * sqrt(PI / 2.0)
	sum += disk * exp(-r / (0.3 * radius)) * (1.0 + 4.0 * arm(x, y)) * disk_thickness
	sum += halo * exp(-2.0 * r / radius) * radius
	return sum


## Brightness of the view from above at (x, y), 0..1: logarithmic in the column density, 1 at the
## centre, 0 BRIGHTNESS_DECADES below it.
func brightness(x: float, y: float) -> float:
	var column := column_density(x, y)
	if column <= 0.0 or _peak <= 0.0:
		return 0.0
	return clampf(1.0 + log(column / _peak) / (log(10.0) * BRIGHTNESS_DECADES), 0.0, 1.0)


## Colour of the stars at (x, y) for the far view: warm in the core, blue in the arms.
func tint(x: float, y: float) -> Color:
	var r := sqrt(x * x + y * y)
	var core_share := 0.0
	var column := column_density(x, y)
	if column > 0.0 and core_radius > 0.0:
		core_share = core * exp(-2.0 * (r / core_radius) * (r / core_radius)) * core_radius * sqrt(PI / 2.0) / column
	return DISK_TINT.lerp(ARM_TINT, arm(x, y)).lerp(CORE_TINT, clampf(core_share, 0.0, 1.0))


## Half the width of the square the far view covers around the centre.
func view_extent() -> float:
	return radius * VIEW_EXTENT


## The sector of a point: floor(coordinate / sectorSize) per axis (contract).
func sector_of(point: Vector3) -> Vector3i:
	return Vector3i(floori(point.x / sector_size.x), floori(point.y / sector_size.y), floori(point.z / sector_size.z))


## Centre of a sector.
func sector_centre(sector: Vector3i) -> Vector3:
	return (Vector3(sector) + Vector3(0.5, 0.5, 0.5)) * sector_size


## The contract's sector id `{sx}_{sy}_{sz}`.
static func sector_id(sector: Vector3i) -> String:
	return "%d_%d_%d" % [sector.x, sector.y, sector.z]


## The largest radius a systems query around `point` should ask for: the sphere holds about
## QUERY_BUDGET systems at the density there, within MIN_QUERY_RADIUS..MAX_QUERY_RADIUS. In the
## core that is about 50 units, in the outer disk the full 200.
func query_radius_limit(point: Vector3) -> float:
	var here := density(point)
	if here <= 0.0:
		return MAX_QUERY_RADIUS
	var fitting := pow(QUERY_BUDGET / (here * 4.0 / 3.0 * PI), 1.0 / 3.0)
	return clampf(fitting, MIN_QUERY_RADIUS, MAX_QUERY_RADIUS)


## Stand-in stars for one cell of a grid of `cell` units (cell (0, 0) spans 0..cell on x and y):
## up to `tries` points, each kept with the probability of its brightness, so their number
## follows the galaxy's shape. Deterministic per cell and `salt`, so the view is the same after
## every pan. Each point is (x, y, brightness).
func cell_points(cell_x: int, cell_y: int, cell: float, tries: int, salt: int) -> PackedVector3Array:
	var random := RandomNumberGenerator.new()
	random.seed = cell_seed(cell_x, cell_y, salt)
	var result := PackedVector3Array()
	var low := Vector2(cell_x * cell, cell_y * cell)
	if low.length() > 1.5 * radius + cell * 1.5:
		return result
	for index: int in tries:
		var x := low.x + random.randf() * cell
		var y := low.y + random.randf() * cell
		var chance := random.randf()
		var light := brightness(x, y)
		if chance < light * light:
			result.append(Vector3(x, y, light))
	return result


## Seed of a grid cell: the same cell always gets the same stand-in stars.
static func cell_seed(cell_x: int, cell_y: int, salt: int) -> int:
	return ((cell_x * 73856093) ^ (cell_y * 19349663) ^ (salt * 83492791)) & 0x7fffffff


## The galaxy from above as an image of `pixels`² covering ±view_extent(), row 0 at +y (north
## up): the tint in colour, the brightness in alpha.
func top_view(pixels: int) -> Image:
	var image := Image.create_empty(pixels, pixels, false, Image.FORMAT_RGBA8)
	var extent := view_extent()
	var step := 2.0 * extent / pixels
	for row: int in pixels:
		var y := extent - (row + 0.5) * step
		for column: int in pixels:
			var x := -extent + (column + 0.5) * step
			var light := brightness(x, y)
			if light <= 0.0:
				continue
			var color := tint(x, y)
			# Fade out towards the edge of the image, so its square does not show.
			var edge := clampf((extent - sqrt(x * x + y * y)) / (extent - radius), 0.0, 1.0)
			color.a = pow(light, 1.6) * edge
			image.set_pixel(column, row, color)
	return image
