import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {buildMesh,renderSet,validateFrames,rgba,composite,RENDERER_VERSION,type Style,type Frame} from '../lib/pixel';
import {ANIMAL_MOTION_VERSION,animalRig,animalClips,bakeAnimal,type AnimalConfig,type AnimalModel} from '../lib/animal-animation';
import {parseAnimal} from '../lib/animal-contracts';
import {unpackFrame} from '../lib/animation';
import {png} from '../lib/export';
import type {AnimalArtifact} from '../lib/generation';
export async function inspectAnimal(value:unknown,style:Style,outDir:string,signal?:AbortSignal){
 const model=parseAnimal(value),mesh=buildMesh(model),staticFrames=renderSet(mesh,style,'eight');
 const config:AnimalConfig={version:ANIMAL_MOTION_VERSION,rig:animalRig(model),clips:animalClips(model.motionCorrections),scale:1,facing:0,style,mode:'eight'};
 const baked=await bakeAnimal(mesh,config,()=>{if(signal?.aborted)throw Error('生成を停止しました');});
 const issues=[...new Set([...validateFrames(staticFrames,style,'eight'),...baked.flatMap(b=>b.issues.map(issue=>`${b.id}: ${issue}`))])];await mkdir(outDir,{recursive:true});const previews:string[]=[];
 for(const [name,rows] of [['static',[staticFrames]],...baked.map(b=>[b.id,b.frames.map(row=>row.map(unpackFrame))])] as [string,Frame[][]][]){
  const width=512,height=64*rows.length,pixels=new Uint8Array(width*height*4);rows.forEach((frames,y)=>frames.forEach((frame,x)=>{const source=rgba(composite(frame,'composite'),style.palette);for(let row=0;row<64;row++)pixels.set(source.subarray(row*256,(row+1)*256),((y*64+row)*width+x*64)*4);}));
  if(signal?.aborted)throw Error('生成を停止しました');const path=join(outDir,name+'.png');await writeFile(path,png(width,height,pixels));previews.push(path);
 }
 const validation={renderer:RENDERER_VERSION,motion:ANIMAL_MOTION_VERSION,frames:8+baked.reduce((n,b)=>n+b.frames.length*8,0),issues};await writeFile(join(outDir,'validation.json'),JSON.stringify(validation,null,2));return {model,validation,previews};
}
export function animalArtifact(model:AnimalModel,validation:AnimalArtifact['validation'],visualReview:string):AnimalArtifact{return {kind:'rigged-quadruped-v1',skillVersion:'1.0.0',model,validation,visualReview};}
