import {clone,renderFrame,renderSet,drawLine,type Mesh,type Revision,type Direction,type SurfaceHit} from './pixel';
import {applySharedEdits,captureSurfacePaint} from './shared-edits';
import {MAX_SURFACE_PAINTS,type SharedEdits} from './shared-edit-types';

/** Paint only the selected part's nearest visible surface; other parts and hidden faces are untouched. */
export function paintPartStroke(base:Mesh,revision:Revision,edits:SharedEdits,direction:Direction,partId:string,points:[number,number][],color:number,isolated=false){
 if(!Number.isInteger(color)||color<1||color>revision.style.palette.length)throw Error('パレットから色を選んでください');
 const whole=applySharedEdits(base,edits),mesh=isolated?{...whole,triangles:whole.triangles.filter(t=>t.partId===partId)}:whole;
 const hits:(SurfaceHit|undefined)[]=[],frame=renderFrame(mesh,revision.style,direction,revision.size,revision.facing,hits);
 let body=frame.body;
 for(let i=0;i<points.length;i++)body=drawLine(body,points[Math.max(0,i-1)],points[i],color);
 body=body.map((v,i)=>hits[i]&&mesh.triangles[hits[i]!.triangle].partId===partId?v:frame.body[i]);
 const capture=captureSurfacePaint(mesh,{...revision,frames:[{...frame,body}]},direction);
 if(edits.paints.length+capture.paints.length>MAX_SURFACE_PAINTS)throw Error('模様が細かくなりすぎました。元に戻すか、このパーツの模様を消して描き直してください');
 return {...clone(edits),paints:[...clone(edits.paints),...capture.paints]};
}
export function recolorPart(base:Mesh,edits:SharedEdits,partId:string,color:string){
 if(!base.parts?.some(p=>p.id===partId)||!/^#[0-9a-fA-F]{6}$/.test(color))throw Error('パーツと色を確認してください');
 const next=clone(edits);next.partColors={...next.partColors,[partId]:{color,shade:1}};
 if(next.colorReplacements)delete next.colorReplacements[partId];
 return next;
}
export function clearPartPattern(base:Mesh,edits:SharedEdits,partId:string){return {...clone(edits),paints:edits.paints.filter(p=>base.triangles[p.triangle]?.partId!==partId)};}
/** Unshared pixel edits remain in their original view; shared designs follow the transformed surface. */
export function previewPartDesign(base:Mesh,revision:Revision,edits:SharedEdits){
 const mesh=applySharedEdits(base,edits),baseFrames=renderSet(mesh,revision.style,revision.mode,revision.size,revision.facing),frames=clone(baseFrames);
 const baseline=renderSet(applySharedEdits(base,revision.sharedEdits),revision.style,revision.mode,revision.size,revision.facing);let localOnly=0;
 for(const frame of frames){const original=revision.frames.find(f=>f.direction===frame.direction)!,before=baseline.find(f=>f.direction===frame.direction)!;
  for(let i=0;i<4096;i++){
   if(original.body[i]!==before.body[i]){frame.body[i]=original.body[i];localOnly++;}
   if(original.shadow[i]!==before.shadow[i]){frame.shadow[i]=original.shadow[i];localOnly++;}
  }
 }
 return {mesh,frames,baseFrames,localOnly};
}
