// Try several seeds for temperate shape 1 (wispier, no dense core) and emit
// candidates + a preview grid over grey. Pick the softest, then wire its seed
// into cloud-temperate-soften.cjs. Reuses the same soft pipeline.
const fs = require('fs');
const path = require('path');
try {
  const envRaw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  for (const line of envRaw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}
const FAL_API_KEY = process.env.FAL_AI_API_KEY || process.env.FAL_API_KEY;
const https = require('https');
const sharp = require('sharp');
const OUT_W = 1024, OUT_H = 512;
const OUT = path.join(__dirname, '..', 'assets', 'style-test', 'clouds', 'soft', 'cand');

const PREFIX = 'aerial top-down view looking straight DOWN at a very thin faint wispy cloud veil and mist drifting over the ground, flat diffuse cirrus haze seen from directly above, delicate feathered semi-transparent tendrils, the haze sits COMPACTLY in the CENTER with a generous empty black margin on every side and does NOT touch any edge, NO dense bright core, no solid clump, evenly faint and translucent throughout, gently fading feathered edges dissolving into black, no side profile, no horizon, no 3D volume, isolated on a flat pure black background, soft diffuse pale vapour';
const NEG = 'no dense core, no bright solid clump, no rectangular bright region, no straight edge, no full-frame coverage, cloud must not touch frame edges, no side view, no horizon, no cumulus silhouette, no 3D puff, no sky, no blue, no landscape, no border, no frame, no text, no hard edges, flat black background only';
const SEEDS = [11027, 22079, 33301, 44273];

function fetchJson(url, body) {
  return new Promise((resolve, reject) => {
    const p = new URL(url); const payload = JSON.stringify(body);
    const req = https.request({ hostname: p.hostname, path: p.pathname + p.search, method: 'POST',
      headers: { Authorization: `Key ${FAL_API_KEY}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } },
      (res) => { const c = []; res.on('data', d => c.push(d)); res.on('end', () => { const raw = Buffer.concat(c).toString(); if (res.statusCode >= 400) return reject(new Error(`fal ${res.statusCode}: ${raw.slice(0,300)}`)); try { resolve(JSON.parse(raw)); } catch { reject(new Error('bad json')); } }); });
    req.on('error', reject); req.write(payload); req.end();
  });
}
function download(url) { return new Promise((res, rej) => { https.get(url, r => { if ((r.statusCode === 301 || r.statusCode === 302) && r.headers.location) return download(r.headers.location).then(res, rej); const c = []; r.on('data', d => c.push(d)); r.on('end', () => res(Buffer.concat(c))); r.on('error', rej); }).on('error', rej); }); }

async function luminanceKey(buf) {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info; const px = width * height; const alpha = Buffer.alloc(px); const rgb = Buffer.alloc(px * 3);
  for (let i = 0; i < px; i++) { const r = data[i*3], g = data[i*3+1], b = data[i*3+2]; const lum = (0.299*r+0.587*g+0.114*b)/255; alpha[i] = Math.round(lum*255); const mix=0.6; rgb[i*3]=Math.round(r+(255-r)*mix); rgb[i*3+1]=Math.round(g+(255-g)*mix); rgb[i*3+2]=Math.round(b+(255-b)*mix); }
  return sharp(rgb, { raw: { width, height, channels: 3 } }).joinChannel(alpha, { raw: { width, height, channels: 1 } }).png().toBuffer();
}
async function featherAlpha(buf, sigma) {
  const { width, height } = await sharp(buf).metadata(); const raw = await sharp(buf).ensureAlpha().raw().toBuffer();
  const alpha = await sharp(raw, { raw: { width, height, channels: 4 } }).extractChannel(3).blur(sigma).toBuffer();
  const rgb = await sharp(raw, { raw: { width, height, channels: 4 } }).removeAlpha().toBuffer();
  return sharp(rgb, { raw: { width, height, channels: 3 } }).joinChannel(alpha, { raw: { width, height, channels: 1 } }).png().toBuffer();
}
async function tightCrop(buf, thresh = 4) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info; let minX=width,minY=height,maxX=-1,maxY=-1;
  for (let y=0;y<height;y++)for(let x=0;x<width;x++){const a=data[(y*width+x)*channels+3];if(a>thresh){if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;}}
  if(maxX<0)return buf; return sharp(buf).extract({left:minX,top:minY,width:maxX-minX+1,height:maxY-minY+1}).png().toBuffer();
}
async function scaleInner(buf, frac) {
  const iw=Math.round(OUT_W*frac), ih=Math.round(OUT_H*frac);
  const inner=await sharp(buf).resize(iw,ih,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
  return sharp({create:{width:OUT_W,height:OUT_H,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:inner,gravity:'center'}]).png().toBuffer();
}
let V=null; function vig(){const a=Buffer.alloc(OUT_W*OUT_H);const cx=OUT_W/2,cy=OUT_H/2,iR=0.62,oR=0.98;for(let y=0;y<OUT_H;y++)for(let x=0;x<OUT_W;x++){const nx=(x-cx)/cx,ny=(y-cy)/cy,r=Math.sqrt(nx*nx+ny*ny);let v;if(r<=iR)v=1;else if(r>=oR)v=0;else{const t=(r-iR)/(oR-iR);v=0.5*(1+Math.cos(Math.PI*t));}a[y*OUT_W+x]=Math.round(v*255);}return a;}
async function applyVig(buf){if(!V)V=vig();const raw=await sharp(buf).ensureAlpha().raw().toBuffer();const px=OUT_W*OUT_H;const al=Buffer.alloc(px);for(let i=0;i<px;i++)al[i]=Math.round(raw[i*4+3]*V[i]/255);const rgb=Buffer.alloc(px*3);for(let i=0;i<px;i++){rgb[i*3]=raw[i*4];rgb[i*3+1]=raw[i*4+1];rgb[i*3+2]=raw[i*4+2];}return sharp(rgb,{raw:{width:OUT_W,height:OUT_H,channels:3}}).joinChannel(al,{raw:{width:OUT_W,height:OUT_H,channels:1}}).png().toBuffer();}

async function one(seed){
  const r=await fetchJson('https://fal.run/fal-ai/flux-pro/v1.1',{prompt:`${PREFIX}, faint gossamer streaks. ${NEG}`,image_size:{width:1024,height:512},num_images:1,enable_safety_checker:false,seed});
  const url=r.images[0].url; const raw=await download(url);
  const keyed=await luminanceKey(raw); const f=await featherAlpha(keyed,4.5); const c=await tightCrop(f,4); const ins=await scaleInner(c,0.72); const vg=await applyVig(ins); const soft=await featherAlpha(vg,2.5);
  const webp=await sharp(soft).webp({lossless:true,effort:4}).toBuffer();
  fs.writeFileSync(path.join(OUT,`cand_${seed}.webp`),webp);
  return sharp(soft).resize(512,256).png().toBuffer();
}
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const tiles=[];
  for(const s of SEEDS){ console.log('seed',s); const c=await one(s); const bg=await sharp({create:{width:512,height:256,channels:3,background:{r:90,g:105,b:120}}}).png().toBuffer(); tiles.push({buf:await sharp(bg).composite([{input:c}]).png().toBuffer(),s}); }
  const canvas=sharp({create:{width:1024,height:512,channels:3,background:{r:0,g:0,b:0}}});
  await canvas.composite([{input:tiles[0].buf,left:0,top:0},{input:tiles[1].buf,left:512,top:0},{input:tiles[2].buf,left:0,top:256},{input:tiles[3].buf,left:512,top:256}]).png().toFile(path.join(OUT,'preview.png'));
  console.log('seeds order TL,TR,BL,BR:',SEEDS.join(','));
})();
