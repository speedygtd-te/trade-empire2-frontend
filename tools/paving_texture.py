r"""Builds the texture of the concrete around large bases (BaseGroundsLayer) from the models'
concrete texture, so paving and model concrete look alike.

    python -I tools/paving_texture.py

Reads scripts/3d/textures/concrete.jpg, takes broad light gradients out, makes it tileable and
writes game/world/grounds/paving.webp (committed, regenerate instead of editing), 512 px, a
little desaturated: the shader tints it. Each paved cell shows a window of it, turned by a
quarter now and then, so the drips of the wall texture do not all run one way. Needs Pillow and
the helpers of tools/ground_atlas.py.
"""

import os
import sys

from PIL import Image, ImageEnhance

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import ground_atlas  # noqa: E402

ROOT = os.path.dirname(HERE)
SOURCE = os.path.join(ROOT, "scripts", "3d", "textures", "concrete.jpg")
TARGET = os.path.join(ROOT, "game", "world", "grounds", "paving.webp")
SIZE = 512
SATURATION = 0.6


def main():
    image = Image.open(SOURCE).convert("RGB").resize((SIZE, SIZE), Image.LANCZOS)
    tileable = ground_atlas.is_seamless(image)
    image = ground_atlas.flatten(image, tileable=tileable)
    if not tileable:
        image = ground_atlas.make_tileable(image, ground_atlas.tileable_masks(SIZE))
    image = ImageEnhance.Color(image).enhance(SATURATION)
    os.makedirs(os.path.dirname(TARGET), exist_ok=True)
    image.save(TARGET, "WEBP", quality=88, method=6)
    print("wrote %s (%s)" % (TARGET, "tileable source" if tileable else "made tileable"))


if __name__ == "__main__":
    main()
