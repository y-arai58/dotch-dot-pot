import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {buildMesh,renderSet,validateFrames,rgba,composite,RENDERER_VERSION,type Frame,type Style} from '../lib/pixel';
import {MOTION_VERSION,rigFromModel,defaultClips,bakeAnimations,unpackFrame,type RiggedModel,type MotionConfig} from '../lib/animation';
import {parseHumanoid,type HumanoidArtifact} from '../lib/generation';
import {png} from '../lib/export';

export async function inspectHumanoid(value:unknown,style:Style,outDir:string,signal?:AbortSignal){
 const model=parseHumanoid(value),mesh=buildMesh(model);
 const staticFrames=renderSet(mesh,style,'eight');
 const config:MotionConfig={version:MOTION_VERSION,rig:rigFromModel(model),clips:defaultClips(model.motionCorrections),scale:1,facing:0,style,mode:'eight'};
 const baked=await bakeAnimations(mesh,config,()=>{if(signal?.aborted)throw Error('生成を停止しました');});
 const issues=[...new Set([...validateFrames(staticFrames,style,'eight'),...baked.flatMap(b=>b.issues.map(issue=>`${b.id}: ${issue}`))])];
 await mkdir(outDir,{recursive:true});
 const previews:string[]=[];
 // Native 64px cells, eight directions left-to-right. Rows are time samples.
 for(const [name,rows] of [['static',[staticFrames]],...baked.map(b=>[b.id,b.frames.map(row=>row.map(unpackFrame))])] as [string,Frame[][]][]){
  const width=512,height=64*rows.length,pixels=new Uint8Array(width*height*4);
  rows.forEach((frames,y)=>frames.forEach((f,x)=>{const source=rgba(composite(f,'composite'),style.palette);for(let row=0;row<64;row++)pixels.set(source.subarray(row*256,(row+1)*256),((y*64+row)*width+x*64)*4);}));
  if(signal?.aborted)throw Error('生成を停止しました');
  const path=join(outDir,name+'.png');await writeFile(path,png(width,height,pixels));previews.push(path);
 }
 const validation={renderer:RENDERER_VERSION,motion:MOTION_VERSION,frames:8+baked.reduce((n,b)=>n+b.frames.length*8,0),issues};
 await writeFile(join(outDir,'validation.json'),JSON.stringify(validation,null,2));
 return {model,validation,previews};
}
export function artifact(model:RiggedModel,validation:HumanoidArtifact['validation'],visualReview:string):HumanoidArtifact{return {kind:'rigged-humanoid-v1',skillVersion:'1.0.0',model,validation,visualReview};}
