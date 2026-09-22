import {rotate,radians,projectToScreen,DIRECTIONS,type V3,type Style,type Direction} from './pixel';
import type {PartTransform} from './shared-edit-types';
const add=(a:V3,b:V3)=>a.map((v,i)=>v+b[i]) as V3;
const sub=(a:V3,b:V3)=>a.map((v,i)=>v-b[i]) as V3;
const scaled=(v:V3,c:V3,t:PartTransform)=>v.map((n,i)=>c[i]+(n-c[i])*t.scale[i]) as V3;
const rotation=(t:PartTransform)=>(t.rotation||[0,0,0]).map(radians) as V3;
export function validatePartTransform(t:PartTransform){
 for(const [vector,min,max] of [[t.offset,-3,3],[t.scale,.1,3],[t.rotation||[0,0,0],-180,180],[t.pivot||[0,0,0],-5,5]] as [V3,number,number][])
  if(vector.length!==3||vector.some(n=>!Number.isFinite(n)||n<min||n>max))throw Error('パーツの位置・大きさ・向き・支点が設定範囲を超えています');
}
export function partPivot(center:V3,t:PartTransform):V3{return add(scaled(t.pivot||center,center,t),t.offset);}
export function transformPartPoint(v:V3,center:V3,t:PartTransform):V3{
 const point=scaled(v,center,t),pivot=scaled(t.pivot||center,center,t);
 // Preserve the old scale/offset arithmetic exactly when rotation is absent.
 if(!t.rotation?.some(Boolean))return add(point,t.offset);
 return add(add(pivot,rotate(sub(point,pivot),rotation(t))),t.offset);
}
function inverseRotate(v:V3,r:V3):V3{return rotate(rotate(rotate(v,[0,0,-r[2]]),[0,-r[1],0]),[-r[0],0,0]);}
/** Relocate the rotation handle without moving any geometry, including already rotated/scaled parts. */
export function movePartPivot(center:V3,t:PartTransform,world:V3):PartTransform{
 const old=scaled(t.pivot||center,center,t),delta=inverseRotate(sub(world,partPivot(center,t)),rotation(t));
 const next=add(old,delta),pivot=next.map((n,i)=>center[i]+(n-center[i])/t.scale[i]) as V3;
 const compensation=sub(rotate(delta,rotation(t)),delta),offset=add(t.offset,compensation);
 const result={...t,pivot,offset};validatePartTransform(result);return result;
}
/** Orthographic dragging retains camera depth; another direction exposes the remaining spatial axis. */
export function dragPivotOnView(pivot:V3,screen:[number,number],style:Style,direction:Direction,size=1,facing=0):V3{
 const depth=projectToScreen(pivot,style,direction,size,facing)[2],el=radians(style.elevation);
 const x=(screen[0]-style.anchor[0])/style.scale,up=(style.anchor[1]-screen[1])/style.scale;
 const camera:V3=[x,up*Math.sin(el)-depth*Math.cos(el),up*Math.cos(el)+depth*Math.sin(el)];
 return rotate(camera,[0,0,-radians(DIRECTIONS.indexOf(direction)*45+facing)]).map(n=>n/size) as V3;
}
