import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {buildMesh,renderSet,rgba,composite,RENDERER_VERSION,type Style} from '../lib/pixel';
import {parseProp,propModelIssues,PROP_VERSION,type PropModel} from '../lib/prop-contracts';
import {png} from '../lib/export';
import type {PropArtifact} from '../lib/generation';

export async function inspectProp(value:unknown,style:Style,outDir:string,signal?:AbortSignal){
 if(signal?.aborted)throw Error('生成を停止しました');
 const model=parseProp(value),frames=renderSet(buildMesh(model),style,'eight'),issues=propModelIssues(model,style);
 const native=new Uint8Array(512*64*4);
 frames.forEach((frame,x)=>{const source=rgba(composite(frame,'composite'),style.palette);for(let row=0;row<64;row++)native.set(source.subarray(row*256,(row+1)*256),(row*512+x*64)*4);});
 // Native 8-direction strip plus a nearest-neighbor 4x2 review grid; never resample source pixels.
 const zoom=new Uint8Array(1024*512*4);
 frames.forEach((frame,i)=>{const source=rgba(composite(frame,'composite'),style.palette);for(let y=0;y<256;y++)for(let x=0;x<256;x++)zoom.set(source.subarray((Math.floor(y/4)*64+Math.floor(x/4))*4,(Math.floor(y/4)*64+Math.floor(x/4))*4+4),((Math.floor(i/4)*256+y)*1024+(i%4)*256+x)*4);});
 if(signal?.aborted)throw Error('生成を停止しました');
 await mkdir(outDir,{recursive:true});const previews=[join(outDir,'static.png'),join(outDir,'static-zoom.png')];
 await writeFile(previews[0],png(512,64,native));await writeFile(previews[1],png(1024,512,zoom));
 const validation={renderer:RENDERER_VERSION,motion:PROP_VERSION,frames:8,issues};
 await writeFile(join(outDir,'validation.json'),JSON.stringify(validation,null,2));return {model,validation,previews};
}
export function propArtifact(model:PropModel,validation:PropArtifact['validation'],visualReview:string):PropArtifact{return {kind:PROP_VERSION,skillVersion:'1.0.0',model,validation,visualReview};}
