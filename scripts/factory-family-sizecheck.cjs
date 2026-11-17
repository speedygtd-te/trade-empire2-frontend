const sharp=require('sharp');const path=require('path');
const F=['electronics_factory','factory','housing_factory','hull_forge','drive_works','arms_plant'];
(async()=>{
 const rows=[48,96,144];const W=170;const comps=[];let top=0;
 for(const px of rows){
  for(let i=0;i<F.length;i++){
   const b=await sharp(path.join('assets','final',F[i]+'_v2.png')).resize(px,px,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
   comps.push({input:b,left:i*W+Math.floor((W-px)/2),top:top+Math.floor((160-px)/2)});
  }
  top+=160;
 }
 for(let i=0;i<F.length;i++){
   const b=await sharp(path.join('assets','final',F[i]+'_v2.png')).resize(150,150,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
   comps.push({input:b,left:i*W+10,top:top+5});
 }
 await sharp({create:{width:F.length*W,height:top+160,channels:3,background:{r:24,g:28,b:36}}}).composite(comps).png().toFile(process.argv[2]);
 console.log('ok '+process.argv[2]);
})();
