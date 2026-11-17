const sharp=require('sharp');const fs=require('fs');const path=require('path');
(async()=>{
for(const f of process.argv.slice(2)){
  if(!fs.existsSync(f)){console.log(`MISSING ${f}`);continue;}
  const {data,info}=await sharp(f).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let minx=1e9,maxx=-1,miny=1e9,maxy=-1,op=0;
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
    if(data[(y*info.width+x)*info.channels+3]>16){op++;if(x<minx)minx=x;if(x>maxx)maxx=x;if(y<miny)miny=y;if(y>maxy)maxy=y;}}
  const bw=maxx-minx+1,bh=maxy-miny+1;
  console.log(`${path.basename(f).padEnd(34)} ${info.width}x${info.height}  bbox ${bw}x${bh}  aspect ${(bw/bh).toFixed(2)}  cov ${(100*op/(info.width*info.height)).toFixed(1)}%`);
}})();
