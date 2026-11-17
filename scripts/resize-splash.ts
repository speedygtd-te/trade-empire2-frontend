import sharp from 'sharp';
import path from 'path';

const SOURCE = 'public/splash.png';
const BASE = 'android/app/src/main/res';

const targets = [
  // Portrait
  { dir: 'drawable-port-mdpi', w: 320, h: 480 },
  { dir: 'drawable-port-hdpi', w: 480, h: 800 },
  { dir: 'drawable-port-xhdpi', w: 720, h: 1280 },
  { dir: 'drawable-port-xxhdpi', w: 960, h: 1600 },
  { dir: 'drawable-port-xxxhdpi', w: 1280, h: 1920 },
  // Landscape
  { dir: 'drawable-land-mdpi', w: 480, h: 320 },
  { dir: 'drawable-land-hdpi', w: 800, h: 480 },
  { dir: 'drawable-land-xhdpi', w: 1280, h: 720 },
  { dir: 'drawable-land-xxhdpi', w: 1600, h: 960 },
  { dir: 'drawable-land-xxxhdpi', w: 1920, h: 1280 },
];

async function main() {
  for (const t of targets) {
    const out = path.join(BASE, t.dir, 'splash.png');
    await sharp(SOURCE)
      .resize(t.w, t.h, { fit: 'cover' })
      .png()
      .toFile(out);
    console.log(`Generated ${out} (${t.w}x${t.h})`);
  }
}
main();
