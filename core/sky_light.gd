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
## How much brighter or darker the light gets per tenfold starlight (Earth = 1), and the
## limits: real starlight spans orders of magnitude, the game keeps it playable.
const BRIGHTNESS_PER_DECADE := 0.26
const BRIGHTNESS_MIN := 0.55
const BRIGHTNESS_MAX := 1.3
## Shadow edge blur (Light3D.shadow_blur): per unit of the star's apparent size (the Sun seen
## from Earth = 1), and what thick haze adds on top (density 2 and more).
const SHADOW_BLUR_PER_SIZE := 0.2
const SHADOW_BLUR_HAZE := 2.8
const SUN_KELVIN := 5778.0
## Air density from which a body is no longer airless for its lamps (V1: airless factor
## 1 - density / 0.7, lit buildings from 0.5 on).
const AIRLESS_DENSITY := 0.7


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


## Starlight reaching a body compared with the Sun's at Earth: luminosity (in suns) divided by
## the square of the distance (AU).
static func irradiance(luminosity: float, distance_au: float) -> float:
	return maxf(luminosity, 0.0) / maxf(distance_au * distance_au, 0.0001)


## Brightness of sunlight and skylight for an irradiance: 1 at Earth, a quarter more or less
## per tenfold, within BRIGHTNESS_MIN..BRIGHTNESS_MAX (a red dwarf's planet is dim, not black).
static func brightness(irradiance_earths: float) -> float:
	var decades := log(maxf(irradiance_earths, 0.000001)) / log(10.0)
	return clampf(1.0 + BRIGHTNESS_PER_DECADE * decades, BRIGHTNESS_MIN, BRIGHTNESS_MAX)


## Radius of a star in solar radii from its luminosity (suns) and surface temperature (Kelvin),
## after Stefan–Boltzmann: L = R² · T⁴.
static func star_radius(luminosity: float, kelvin: float) -> float:
	var ratio := SUN_KELVIN / maxf(kelvin, 1.0)
	return sqrt(maxf(luminosity, 0.0)) * ratio * ratio


## How large the star looks in the sky compared with the Sun from Earth.
static func apparent_size(radius_suns: float, distance_au: float) -> float:
	return maxf(radius_suns, 0.0) / maxf(distance_au, 0.0001)


## Blur of the shadow edges: a large-looking star (red giant, close orbit) casts soft shadows,
## a small one (white dwarf, far away) crisp ones; thick haze softens them further.
static func shadow_blur(apparent: float, density: float) -> float:
	return SHADOW_BLUR_PER_SIZE * clampf(apparent, 0.25, 8.0) + SHADOW_BLUR_HAZE * clampf(density / 2.0, 0.0, 1.0)


## Sunlight and skylight for a sun `elevation` radians above the horizon; `star_brightness`
## (see `brightness`) scales both.
static func at(elevation: float, star_kelvin: float, density: float, star_brightness: float = 1.0) -> Light:
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
	light.sun *= star_brightness
	light.sky *= star_brightness
	return light


## How much the colony's lamps and windows show: 0 by bright day under a lit sky, 1 at night.
## A body without air keeps them on even by day, its sky is black (as in V1).
static func lamp_level(light: Light, density: float) -> float:
	var sun := maxf(light.sun.r, maxf(light.sun.g, light.sun.b))
	var sky := maxf(light.sky.r, maxf(light.sky.g, light.sky.b))
	var dark := 1.0 - clampf(sun * 0.6 + sky, 0.0, 1.0)
	return maxf(dark, airless(density))


## How airless a body is for its look: 1 without any air, 0 from AIRLESS_DENSITY on.
static func airless(density: float) -> float:
	return clampf(1.0 - maxf(density, 0.0) / AIRLESS_DENSITY, 0.0, 1.0)
