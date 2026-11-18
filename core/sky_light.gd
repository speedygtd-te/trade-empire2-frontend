class_name SkyLight
extends RefCounted
## Colour and strength of sunlight and sky at a spot, from the sun's height, the star's surface
## temperature and the density of the atmosphere (`Star.temperature`, `Environment.
## atmosphereDensity`). Visual only.
##
## Light crosses more air the lower the sun stands (air mass), and air scatters blue far more
## than red (Rayleigh, about wavelength^-4): so low sun turns orange and red, thick air dims and
## reddens more, and a body without air keeps white light down to the horizon under a black sky.

## Optical depth per colour channel (r, g, b) straight up through an atmosphere of density 1
## (roughly Earth: 680, 550, 440 nm, including some haze).
const ZENITH_DEPTH := Vector3(0.06, 0.13, 0.31)
## How far below the horizon the sky still glows (twilight), in radians per unit of density.
const TWILIGHT_PER_DENSITY := deg_to_rad(9.0)


class Light:
	extends RefCounted
	## Colour of the direct sunlight (brightness included, 0..1 per channel).
	var sun := Color.BLACK
	## Colour and strength of the light from the sky (ambient).
	var sky := Color.BLACK


## Air mass along the line of sight to the sun (1 straight up, ~38 at the horizon); Kasten and
## Young's formula, which stays finite at the horizon.
static func air_mass(elevation: float) -> float:
	var degrees := rad_to_deg(maxf(elevation, 0.0))
	return 1.0 / (sin(maxf(elevation, 0.0)) + 0.50572 * pow(degrees + 6.07995, -1.6364))


## Colour of a star's light from its surface temperature (Kelvin), brightest channel = 1.
## Approximation of a black body (after Tanner Helland), good from 1000 to 40000 K.
static func star_color(kelvin: float) -> Color:
	var t := clampf(kelvin, 1000.0, 40000.0) / 100.0
	var r := 1.0
	var g := 0.0
	var b := 0.0
	if t <= 66.0:
		g = clampf((99.4708025861 * log(t) - 161.1195681661) / 255.0, 0.0, 1.0)
		b = 1.0 if t >= 66.0 else (0.0 if t <= 19.0 else clampf((138.5177312231 * log(t - 10.0) - 305.0447927307) / 255.0, 0.0, 1.0))
	else:
		r = clampf(329.698727446 * pow(t - 60.0, -0.1332047592) / 255.0, 0.0, 1.0)
		g = clampf(288.1221695283 * pow(t - 60.0, -0.0755148492) / 255.0, 0.0, 1.0)
		b = 1.0
	var top := maxf(r, maxf(g, b))
	return Color(r / top, g / top, b / top)


## Sunlight and skylight for a sun `elevation` radians above the horizon.
static func at(elevation: float, star_kelvin: float, density: float) -> Light:
	var light := Light.new()
	var star := star_color(star_kelvin)
	var air := maxf(density, 0.0)

	# Direct light: what survives the path through the air.
	if elevation > 0.0:
		var depth := ZENITH_DEPTH * air * air_mass(elevation)
		var through := Color(exp(-depth.x), exp(-depth.y), exp(-depth.z))
		# A sun just at the horizon fades in instead of switching on.
		var rise := clampf(elevation / deg_to_rad(2.0), 0.0, 1.0)
		light.sun = Color(star.r * through.r, star.g * through.g, star.b * through.b) * rise

	# Skylight: what the air scatters. Strongest with the sun high, blue for thin air, and it
	# lingers below the horizon (twilight) the longer, the thicker the air.
	if air > 0.0:
		var twilight := TWILIGHT_PER_DENSITY * minf(air, 2.0)
		var glow := clampf((elevation + twilight) / (twilight + deg_to_rad(30.0)), 0.0, 1.0)
		var scatter := Color(1.0 - exp(-ZENITH_DEPTH.x * air), 1.0 - exp(-ZENITH_DEPTH.y * air), 1.0 - exp(-ZENITH_DEPTH.z * air))
		var strongest := maxf(scatter.r, maxf(scatter.g, scatter.b))
		var tint := Color(scatter.r / strongest, scatter.g / strongest, scatter.b / strongest)
		# Near and below the horizon the scattered light is the reddened one.
		var low := clampf(1.0 - elevation / deg_to_rad(15.0), 0.0, 1.0)
		tint = tint.lerp(Color(1.0, 0.55, 0.35), low * 0.6)
		var strength := clampf(strongest * 2.5, 0.0, 1.0) * glow
		light.sky = Color(star.r * tint.r, star.g * tint.g, star.b * tint.b) * strength
	return light
