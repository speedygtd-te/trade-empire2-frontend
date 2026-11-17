/**
 * PROBE (read only): what IS the mirror convention in the shipped ICE family?
 * Masked, mean-centred NCC of every slot pair in all four orientations.
 * Nothing is written anywhere.
 */
const fs = require('fs'); const path = require('path'); const sharp = require('sharp');
sharp.cache(false);
const TILES = path.join(__dirname, '..', 'src', 'assets', 'tiles');
const L709 = (r,g,b) => 0.2126*r + 0.7152*g + 0.0722*b;

async function luma(buf) {
  const r = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = r.info.channels, w = r.info.width, h = r.info.height;
  const L = new Float32Array(w*h), A = new Uint8Array(w*h);
  for (let p = 0; p < w*h; p++) { L[p] = L709(r.data[p*ch], r.data[p*ch+1], r.data[p*ch+2]); A[p] = r.data[p*ch+3]; }
  return { L, A, w, h };
}
function ncc(a, b) {
  let n=0, sa=0, sb=0;
  for (let p=0;p<a.L.length;p++){ if(a.A[p]<250||b.A[p]<250) continue; sa+=a.L[p]; sb+=b.L[p]; n++; }
  if(!n) return 0; sa/=n; sb/=n;
  let num=0, da=0, db=0;
  for (let p=0;p<a.L.length;p++){ if(a.A[p]<250||b.A[p]<250) continue;
    const x=a.L[p]-sa, y=b.L[p]-sb; num+=x*y; da+=x*x; db+=y*y; }
  return (da>0&&db>0) ? num/Math.sqrt(da*db) : 0;
}
const ORI = {
  id:  (s)=>s.clone(),
  r180:(s)=>s.clone().rotate(180),
  flop:(s)=>s.clone().flop(),
  flip:(s)=>s.clone().flip(),
};
(async () => {
  for (const fam of ['glacier','crevasse','tundra','permafrost','snow_peak','ice_shelf','frozen_lake']) {
    const dir = path.join(TILES, fam);
    if (!fs.existsSync(dir)) continue;
    const raw = [];
    for (let n=0;n<4;n++) raw.push(fs.readFileSync(path.join(dir, fam+'_'+n+'.webp')));
    console.log('\n== ' + fam + ' ==');
    for (let i=0;i<4;i++) for (let j=i+1;j<4;j++) {
      const a = await luma(await sharp(raw[i]).png().toBuffer());
      const line = [];
      for (const k of Object.keys(ORI)) {
        const bb = await ORI[k](sharp(raw[j])).png().toBuffer();
        const b = await luma(bb);
        line.push(k + ' ' + ncc(a,b).toFixed(3));
      }
      console.log('   slot' + i + ' vs slot' + j + ':  ' + line.join('   '));
    }
  }
})();
