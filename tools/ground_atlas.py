r"""Builds the ground texture atlas of the 3D surface from the V1 ground tiles.

    python -I tools/ground_atlas.py [--source <folder>] [--cell 128]
    python -I tools/ground_atlas.py --source "F:\Trade Empire\Frontend2\assets\tiles-square"

Writes (committed, regenerate instead of editing):
  game/world/ground/ground_atlas.webp  every biome x variant as a square, tileable texture, packed
                                      COLUMNS x ROWS; Godot imports it as a Texture2DArray (one
                                      layer per cell, see ground_atlas.webp.import)
  game/world/ground/ground_noise.png  small tileable noise that wobbles the biome borders
  game/world/ground/ground_atlas.gd   class GroundAtlas: biome key -> first layer, light mirror

Sources, per biome:
  1. `--source <folder>` holding square top-down renders `<biome>_<n>.png` (or .webp/.jpg) for
     all four variants: each square is used whole as the cell texture (row 0 north, column 0
     west), made tileable unless it already is. Its light comes from the upper left of the
     square, i.e. the cell's north-west.
  2. otherwise the V1 diamonds src/assets/tiles/<biome>/<biome>_<n>.webp (512x256). V1 made each
     from a square render, squished to half height and cut with a diamond mask. The diamond is
     mapped corner to corner onto the cell (diamond_to_cell): V1's scale and, under ColonyView's
     45-degree camera, V1's light from the upper left of the screen, i.e. the cell's west.
A biome takes all its variants from one kind of source, so its light is consistent; the
generated MIRROR tells GroundTiles which mirroring keeps that light.

Every texture is tileable (its edges continue into each other), so a tile matches itself
across cell borders and the shader can blend neighbours without a seam. Needs Pillow only.
"""

import argparse
import os
import random
import sys

from PIL import Image, ImageChops, ImageFilter, ImageStat

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TILES = os.path.join(ROOT, "src", "assets", "tiles")
OUT_DIR = os.path.join(ROOT, "game", "world", "ground")
VARIANTS = 4
COLUMNS = 16
# The diamond's edge pixels are antialiased; the cut-out square stays this share inside.
DIAMOND_INSET = 0.03
# Width of the cross-fade that makes a square tileable, as a share of its side.
SEAM_BAND = 0.14
# BiomeColors.FALLBACK divided by the shader's brightness (ColonyView used it unlifted).
GROUND_BRIGHTNESS = 1.9
FALLBACK = (0.45, 0.45, 0.42)
NOISE_SIZE = 64
# The tiles carry broad light gradients (a brighter middle, a darker side) that repeat every
# cell and form a lattice from afar. Variations broader than this blur (share of the side) are
# taken out to this share; finer detail stays.
FLATTEN_BLUR = 0.12
FLATTEN = 0.8
# How far each variant's mean colour is pulled to its biome's mean, so variants side by side
# do not form a chequerboard (the flat colours before kept 35 % of the variant).
VARIANT_PULL = 0.65
# Orientation bits of GroundTiles (core/ground_tiles.gd).
MIRROR_SWAP = 1
MIRROR_FLIP_V = 4


def diamond_to_cell(image, size):
    """The diamond inscribed in `image` (corners at the middles of its sides) as a square cell
    texture of `size` pixels: row 0 is the cell's north edge (+y), column 0 its west edge.

    In V1 one diamond is one cell, seen with x running to the lower right and y to the upper
    right; ColonyView looks at the ground from the same side (yaw 45 degrees). Mapping the
    diamond's corners onto the cell's corners therefore keeps V1's scale and its light from the
    upper left of the screen. In texture terms (tu east, tv south):
        left corner = south-west, bottom = south-east, right = north-east, top = north-west."""
    width, height = image.size
    shrink = 1.0 - DIAMOND_INSET
    big = size * 4  # sample finely, then scale down with a proper filter
    # Output pixel (X, Y) -> tu = start + step * X, tv = start + step * Y (shrunk around the
    # centre, off the antialiased rim) -> diamond pixel:
    #   x = W/2 + W/2 * (tu - tv),  y = H/2 * (tu + tv)
    step = shrink / big
    start = 0.5 - shrink / 2.0
    half_w = width / 2.0
    half_h = height / 2.0
    data = (
        half_w * step, -half_w * step, half_w,
        half_h * step, half_h * step, half_h * 2.0 * start,
    )
    cell = image.convert("RGBA").transform((big, big), Image.AFFINE, data, Image.BICUBIC)
    return cell.convert("RGB").resize((size, size), Image.LANCZOS)


def from_diamond(path, size):
    """A V1 diamond (512x256): a square top-down render, squished to half height and cut."""
    return diamond_to_cell(Image.open(path), size)


def from_square(path, size):
    """A square top-down render, used whole (centre-cropped if not square)."""
    image = Image.open(path).convert("RGB")
    side = min(image.size)
    left = (image.width - side) // 2
    top = (image.height - side) // 2
    return image.crop((left, top, left + side, top + side)).resize((size, size), Image.LANCZOS)


def is_seamless(image):
    """Whether opposite edges continue into each other about as well as neighbouring columns."""
    size = image.width
    pixels = image.load()

    def column_step(a, b):
        total = 0
        for y in range(size):
            pa, pb = pixels[a, y], pixels[b, y]
            total += sum(abs(pa[c] - pb[c]) for c in range(3))
        return total / size

    def row_step(a, b):
        total = 0
        for x in range(size):
            pa, pb = pixels[x, a], pixels[x, b]
            total += sum(abs(pa[c] - pb[c]) for c in range(3))
        return total / size

    inner = (column_step(size // 2 - 1, size // 2) + row_step(size // 2 - 1, size // 2)) / 2.0
    across = max(column_step(size - 1, 0), row_step(size - 1, 0))
    return across <= inner * 1.6 + 2.0


def mean_color(image):
    return tuple(ImageStat.Stat(image).mean[:3])


def wrapped_blur(image, radius, mirrored=False):
    """Gaussian blur that continues the image past its borders: wrapping around (a tileable
    image) or mirrored (any image)."""
    size = image.width
    tiled = Image.new("RGB", (size * 3, size * 3))
    for ty in range(3):
        for tx in range(3):
            copy = image
            if mirrored and tx != 1:
                copy = copy.transpose(Image.FLIP_LEFT_RIGHT)
            if mirrored and ty != 1:
                copy = copy.transpose(Image.FLIP_TOP_BOTTOM)
            tiled.paste(copy, (tx * size, ty * size))
    return tiled.filter(ImageFilter.GaussianBlur(radius)).crop((size, size, size * 2, size * 2))


def flatten(image, tileable=False):
    """Takes broad light gradients (a brighter middle, a darker side) out of a texture to the
    share FLATTEN; finer detail stays. Runs before make_tileable, which would otherwise carry
    the bright middle to the edges. A tileable image is blurred wrapping, so it stays tileable."""
    mean = mean_color(image)
    low = wrapped_blur(image, FLATTEN_BLUR * image.width, mirrored=not tileable).load()
    pixels = image.copy()
    out = pixels.load()
    for y in range(image.height):
        for x in range(image.width):
            pixel = out[x, y]
            broad = low[x, y]
            out[x, y] = tuple(
                max(0, min(255, round(pixel[c] - FLATTEN * (broad[c] - mean[c])))) for c in range(3)
            )
    return pixels


def pull_means(images):
    """Pulls the mean colours of a biome's variants toward each other (VARIANT_PULL)."""
    means = [mean_color(image) for image in images]
    biome_mean = tuple(sum(mean[c] for mean in means) / len(means) for c in range(3))
    result = []
    for image, mean in zip(images, means):
        shift = [round((biome_mean[c] - mean[c]) * VARIANT_PULL) for c in range(3)]
        bands = [band.point(lambda value, s=shift[c]: max(0, min(255, value + s)))
                 for c, band in enumerate(image.split())]
        result.append(Image.merge("RGB", bands))
    return result


def square_paths(folder, biome):
    """The square sources of all variants of a biome, or None when one is missing."""
    if not folder:
        return None
    paths = []
    for variant in range(VARIANTS):
        found = None
        for extension in (".png", ".webp", ".jpg"):
            candidate = os.path.join(folder, "%s_%d%s" % (biome, variant, extension))
            if os.path.isfile(candidate):
                found = candidate
                break
        if found is None:
            return None
        paths.append(found)
    return paths


def smoothstep(edge0, edge1, x):
    t = min(max((x - edge0) / (edge1 - edge0), 0.0), 1.0)
    return t * t * (3.0 - 2.0 * t)


def seam_mask(size, seam):
    """L mask: 255 away from the seam lines x = seam and y = seam (wrapping), 0 on them."""
    band = SEAM_BAND * size
    weights = []
    for index in range(size):
        distance = (index + 0.5 - seam) % size
        distance = min(distance, size - distance)
        weights.append(smoothstep(0.0, band, distance))
    mask = Image.new("L", (size, size))
    mask.putdata([round(255 * wx * wy) for wy in weights for wx in weights])
    return mask


def tileable_masks(size):
    """Masks for make_tileable and, per pixel, how much a cross-fade there lowers the contrast
    (sqrt of the summed squared weights; 1 where only one copy shows)."""
    own = seam_mask(size, 0)
    half = seam_mask(size, size // 2)
    own_data = own.load()
    half_data = half.load()
    contrast = []
    for y in range(size):
        for x in range(size):
            w_own = own_data[x, y] / 255.0
            w_half = (1.0 - w_own) * half_data[x, y] / 255.0
            w_quarter = 1.0 - w_own - w_half
            contrast.append((w_own * w_own + w_half * w_half + w_quarter * w_quarter) ** 0.5)
    return {"own": own, "half": half, "contrast": contrast}


def make_tileable(image, masks):
    """Lays the image over copies of itself shifted by a half and a quarter: each copy is used
    only away from its own seams, the shifted copies cover the image's edges, so the result
    continues seamlessly across its borders. Where copies cross-fade, the detail around the
    local mean is scaled back up (an average of two textures is flatter than either), so the
    fade does not show as a soft strip."""
    size = image.width
    half = size // 2
    quarter = size // 4
    result = ImageChops.offset(image, quarter, quarter)
    result = Image.composite(ImageChops.offset(image, half, half), result, masks["half"])
    result = Image.composite(image, result, masks["own"])
    local = wrapped_blur(result, size * 0.06).load()
    pixels = result.load()
    contrast = masks["contrast"]
    for y in range(size):
        for x in range(size):
            factor = contrast[y * size + x]
            if factor > 0.999:
                continue
            pixel = pixels[x, y]
            mean = local[x, y]
            pixels[x, y] = tuple(
                max(0, min(255, round(mean[c] + (pixel[c] - mean[c]) / factor))) for c in range(3)
            )
    return result


def tileable_noise(size, seed):
    """Smooth tileable noise, three independent channels (r: borders across x, g: across y)."""
    generator = random.Random(seed)
    channels = []
    for _ in range(3):
        octaves = []
        for octave in (4, 8):
            grid = Image.new("L", (octave, octave))
            grid.putdata([generator.randrange(256) for _ in range(octave * octave)])
            # Tile 3x3, scale up, keep the middle: wraps smoothly at the borders.
            tiled = Image.new("L", (octave * 3, octave * 3))
            for ty in range(3):
                for tx in range(3):
                    tiled.paste(grid, (tx * octave, ty * octave))
            octaves.append(tiled.resize((size * 3, size * 3), Image.BICUBIC).crop((size, size, size * 2, size * 2)))
        layer = Image.blend(octaves[0], octaves[1], 0.35)
        # Stretch to the full range.
        low, high = layer.getextrema()
        layer = layer.point(lambda value, low=low, high=high: round((value - low) * 255 / max(high - low, 1)))
        channels.append(layer)
    return Image.merge("RGB", channels)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", "--squares", dest="source", default="",
                        help="folder with square <biome>_<n>.png renders, preferred where complete")
    parser.add_argument("--cell", type=int, default=128, help="side of one texture in pixels")
    args = parser.parse_args()
    cell = args.cell
    if args.source and not os.path.isdir(args.source):
        print("source folder not found: %s" % args.source)
        return 2

    biomes = sorted(name for name in os.listdir(TILES) if os.path.isdir(os.path.join(TILES, name)))
    slots = len(biomes) * VARIANTS + 1  # + the flat fallback
    rows = -(-slots // COLUMNS)
    atlas = Image.new("RGB", (COLUMNS * cell, rows * cell))
    fallback = tuple(round(255 * channel / GROUND_BRIGHTNESS) for channel in FALLBACK)
    atlas.paste(fallback, (0, 0, atlas.width, atlas.height))
    masks = tileable_masks(cell)

    square_biomes = []
    already_seamless = 0
    mirrors = {}
    for index, biome in enumerate(biomes):
        squares = square_paths(args.source, biome)
        if squares is not None:
            square_biomes.append(biome)
        # The mirroring that keeps the light (GroundTiles bits): a square is lit from the
        # cell's north-west (keep it: swap east and south), a V1 diamond from the west (keep
        # it: flip north and south).
        mirrors[biome] = MIRROR_SWAP if squares is not None else MIRROR_FLIP_V
        images = []
        for variant in range(VARIANTS):
            if squares is not None:
                image = from_square(squares[variant], cell)
                if is_seamless(image):
                    image = flatten(image, tileable=True)
                    already_seamless += 1
                else:
                    image = make_tileable(flatten(image), masks)
            else:
                path = os.path.join(TILES, biome, "%s_%d.webp" % (biome, variant))
                image = make_tileable(flatten(from_diamond(path, cell)), masks)
            images.append(image)
        for variant, image in enumerate(pull_means(images)):
            layer = index * VARIANTS + variant
            atlas.paste(image, ((layer % COLUMNS) * cell, (layer // COLUMNS) * cell))

    os.makedirs(OUT_DIR, exist_ok=True)
    atlas.save(os.path.join(OUT_DIR, "ground_atlas.webp"), quality=90, method=6)
    tileable_noise(NOISE_SIZE, 7).save(os.path.join(OUT_DIR, "ground_noise.png"), optimize=True)

    lines = [
        "class_name GroundAtlas",
        "extends RefCounted",
        "## Layout of ground_atlas.webp (a Texture2DArray, one layer per biome variant). Generated by",
        "## tools/ground_atlas.py - do not edit by hand.",
        "",
        "const COLUMNS := %d" % COLUMNS,
        "const ROWS := %d" % rows,
        "const CELL := %d" % cell,
        "const VARIANTS := %d" % VARIANTS,
        "## Layer of a flat colour for unknown biomes.",
        "const FALLBACK_LAYER := %d" % (len(biomes) * VARIANTS),
        "",
        "## Biome key (upper case) -> its first layer; the variants follow it.",
        "const FIRST_LAYER := {",
    ]
    for index, biome in enumerate(biomes):
        lines.append('\t"%s": %d,' % (biome.upper(), index * VARIANTS))
    lines.append("}")
    lines.append("")
    lines.append("## Biome key -> the mirroring (GroundTiles.SWAP or FLIP_V) that keeps its light.")
    lines.append("const MIRROR := {")
    for biome in biomes:
        lines.append('\t"%s": %d,' % (biome.upper(), mirrors[biome]))
    lines.append("}")
    with open(os.path.join(OUT_DIR, "ground_atlas.gd"), "w", encoding="utf-8", newline="\n") as file:
        file.write("\n".join(lines) + "\n")
    print("wrote %d biomes x %d variants into %dx%d, %d layers" % (
        len(biomes), VARIANTS, atlas.width, atlas.height, COLUMNS * rows))
    print("from squares: %d biomes (%d textures already seamless); from V1 diamonds: %d biomes" % (
        len(square_biomes), already_seamless, len(biomes) - len(square_biomes)))
    missing = [biome for biome in biomes if biome not in square_biomes]
    if args.source and missing:
        print("no complete square set for: %s" % ", ".join(missing))
    return 0


if __name__ == "__main__":
    sys.exit(main())
