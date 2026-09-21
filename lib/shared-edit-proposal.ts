import {clone,type Mesh,type Revision,type Direction,type Frame} from './pixel';
import {applySharedEdits,capturePartColors,captureSurfacePaint,emptySharedEdits,previewSharedRevision} from './shared-edits';
import {MAX_SURFACE_PAINTS,type SharedEdits} from './shared-edit-types';

export type SharedMethod='surface'|'color'|'part';
export type PartChoice={enabled?:boolean;color?:string;from?:string};
export function sharedEditProposal(base:Mesh,revision:Revision,source:Direction,options:{method:SharedMethod;parts:SharedEdits['parts'];choices:Record<string,PartChoice>;preserveSource:boolean},captures?:{surface:ReturnType<typeof captureSurfacePaint>;parts:ReturnType<typeof capturePartColors>}){
 const edits=clone(revision.sharedEdits||emptySharedEdits(base));
 edits.parts=clone(options.parts);
 const current=captures?null:applySharedEdits(base,revision.sharedEdits);
 const captured=captures||{surface:captureSurfacePaint(current!,revision,source),parts:capturePartColors(current!,revision,source)};
 let transferred:number[]=[];
 if(options.method==='surface'){edits.paints.push(...captured.surface.paints);transferred=captured.surface.transferred;}
 else{
  const selected=captured.parts.proposals.filter(p=>options.choices[p.partId]?.enabled!==false);
  for(const p of selected){
   const choice=options.choices[p.partId],color=choice?.color||p.color;
   if(options.method==='color'){
    const material=p.materials.find(m=>m.color===(choice?.from||p.materials[0]?.color));if(!material)continue;
    const previous=edits.colorReplacements&&Object.hasOwn(edits.colorReplacements,p.partId)?edits.colorReplacements[p.partId]:[];
    edits.colorReplacements={...edits.colorReplacements,[p.partId]:[...previous,{from:material.color,color,shade:material.shade}]};
    transferred.push(...material.indices);
   }else{
    edits.partColors={...edits.partColors,[p.partId]:{color,shade:p.shade}};
    if(edits.colorReplacements)delete edits.colorReplacements[p.partId];
    edits.paints=edits.paints.filter(paint=>base.triangles[paint.triangle]?.partId!==p.partId);
    transferred.push(...p.indices);
   }
  }
 }
 const shapeChanged=JSON.stringify(options.parts)!==JSON.stringify(revision.sharedEdits?.parts||{}),preserveSource=options.preserveSource&&!shapeChanged;
 // Protect visible source colors on the actual surfaces, so they also follow the joints.
 if(preserveSource){
  const proposed=applySharedEdits(base,edits),protectedPaint=captureSurfacePaint(proposed,revision,source);
  edits.paints.push(...protectedPaint.paints);
 }
 if(edits.paints.length>MAX_SURFACE_PAINTS)throw Error('模様の保持範囲が上限に達しました。修正範囲を小さくするか「修正元の見た目を保持」を解除し、差分を確認してください');
 const result=previewSharedRevision(base,revision,source,edits,transferred,preserveSource);
 return {...result,edits,captured,transferred,shapeChanged,preserveSource};
}

export const DIFF_PALETTE=['#7ce7aa','#ff849e','#ffd166'];
/** One count per pixel, including transparent, body, and shadow changes. */
export function frameDifference(before:Frame,after:Frame){
 let count=0;
 const pixels=before.body.map((body,i)=>{
  if(body===after.body[i]&&before.shadow[i]===after.shadow[i])return 0;
  count++;const had=!!(body||before.shadow[i]),has=!!(after.body[i]||after.shadow[i]);
  return !had&&has?1:had&&!has?2:3;
 });
 return {count,pixels};
}
