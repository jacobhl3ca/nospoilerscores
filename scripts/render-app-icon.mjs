import sharp from 'sharp';
import { readFileSync } from 'fs';

const SIZE = 1024;
const SVG_PATH = 'public/monkey-see-no-evil.svg';
const OUT_PATH = 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png';

const svg = readFileSync(SVG_PATH);
const monkeyPx = Math.round(SIZE * 0.72);
const monkeyBuf = await sharp(svg, { density: 300 })
  .resize(monkeyPx, monkeyPx, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();

// App Store icons must not have an alpha channel — flatten to RGB.
await sharp({
  create: { width: SIZE, height: SIZE, channels: 4, background: '#ffffff' }
})
  .composite([{ input: monkeyBuf, gravity: 'center' }])
  .flatten({ background: '#ffffff' })
  .removeAlpha()
  .png({ compressionLevel: 9 })
  .toFile(OUT_PATH);

console.log('wrote', OUT_PATH);
