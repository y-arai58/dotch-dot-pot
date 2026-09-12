import {composite,rgba,DIRECTIONS} from './pixel';
import {png,zip} from './export';
import {unpackFrame,MOTION_VERSION,type AnimationDocument} from './animation';

export function exportAnimation(document:AnimationDocument,layer:'body'|'shadow'|'composite'='composite'){
 const files:Record<string,Uint8Array>={};
 const {config}=document;
 const directions=config.mode==='eight'?[...DIRECTIONS]:['S' as const];
 const clips=[];
 for(const clip of config.clips){
  const baked=document.baked.find(b=>b.id===clip.id);
  if(!baked||baked.frames.length!==clip.frames)throw Error('全フレームを生成してください');
  const width=clip.frames*64,height=directions.length*64,sheet=new Uint8Array(width*height*4),cells=[];
  for(let f=0;f<clip.frames;f++)for(let d=0;d<directions.length;d++){
   const frame=unpackFrame(baked.frames[f][d]);
   if(frame.direction!==directions[d])throw Error('方向の順序が一致しません');
   const pixels=rgba(composite(frame,layer),config.style.palette);
   for(let y=0;y<64;y++)sheet.set(pixels.subarray(y*256,(y+1)*256),((d*64+y)*width+f*64)*4);
   const filename=`${clip.id}/${frame.direction}/${String(f).padStart(3,'0')}.png`;
   files[filename]=png(64,64,pixels);
   cells.push({frame:f,direction:frame.direction,timeMs:f*1000/clip.fps,durationMs:1000/clip.fps,file:filename,rect:{x:f*64,y:d*64,width:64,height:64},pivot:config.style.anchor});
  }
  files[`${clip.id}/spritesheet.png`]=png(width,height,sheet);
  clips.push({id:clip.id,name:clip.name,fps:clip.fps,frameCount:clip.frames,durationMs:clip.frames*1000/clip.fps,loop:clip.loop,layout:'columns=time, rows=direction',sheet:`${clip.id}/spritesheet.png`,sheetSize:{width,height},inPlace:true,rootMotion:{horizontal:'external',vertical:'baked-in-pixels'},cycleDistance:clip.id==='walk'?clip.stride*2*config.scale:0,recommendedSpeed:clip.id==='walk'?clip.stride*2*config.scale/(clip.frames/clip.fps):0,units:'normalized model units; multiply by project pixels-per-unit for screen distance',events:baked.events.map(e=>({...e,timeMs:e.frame*1000/clip.fps})),cells});
 }
 files['animation.json']=new TextEncoder().encode(JSON.stringify({formatVersion:2,motionVersion:MOTION_VERSION,sourceRevisionId:document.sourceRevisionId,reviewed:document.reviewed,width:64,height:64,directions,layer,palette:config.style.palette,transparentIndex:0,camera:{projection:'orthographic',elevation:config.style.elevation},light:{azimuth:config.style.light,elevation:config.style.lightHeight,space:'world'},scale:config.scale,style:config.style,rig:config.rig,settings:config.clips,clips},null,2));
 return files;
}
export const animationZip=(document:AnimationDocument,layer:'body'|'shadow'|'composite'='composite')=>zip(exportAnimation(document,layer));
