const sharp=require('sharp');const fs=require('fs');const path=require('path');
(async()=>{
 const out=process.argv[2];const files=process.argv.slice(3);
 const C=Number(process.env.CELL||200),cols=Math.min(6,files.length),rows=Math.ceil(files.length/cols);
 const comps=[];
 for(let i=0;i<files.length;i++){
   const f=files[i];if(!fs.existsSync(f)){console.log('MISSING '+f);continue;}
   const b=await sharp(f).resize(C,C,{fit:'contain',background:{r:30,g:34,b:42,alpha:1}}).flatten({background:{r:30,g:34,b:42}}).png().toBuffer();
   comps.push({input:b,left:(i%cols)*C,top:Math.floor(i/cols)*(C+18)});
   const label=`<svg width="${C}" height="18"><rect width="${C}" height="18" fill="#12151b"/><text x="3" y="13" font-family="monospace" font-size="11" fill="#9aa4b2">${path.basename(f).replace(/\.(webp|png)$/,'').slice(0,30)}</text></svg>`;
   comps.push({input:Buffer.from(label),left:(i%cols)*C,top:Math.floor(i/cols)*(C+18)+C});
 }
 await sharp({create:{width:cols*C,height:rows*(C+18),channels:3,background:{r:18,g:21,b:27}}}).composite(comps).png().toFile(out);
 console.log('[montage] '+out);
})();
