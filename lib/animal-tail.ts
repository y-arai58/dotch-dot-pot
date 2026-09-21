import {clone,type Mesh,type V3} from './pixel';
import {qEuler,qFromTo,qMultiply,qRotate,type Quat} from './animation';
import type {AnimalClip,AnimalRig} from './animal-animation';

export const TAIL_DIRECTIONS=['original','back','up','down','left','right'] as const;
export const TAIL_PATTERNS=['still','wag','bounce','tip'] as const;
export type TailSettings={direction:typeof TAIL_DIRECTIONS[number];pattern:typeof TAIL_PATTERNS[number];amplitude:number;cycles:number};
export const TAIL_DIRECTION_NAMES:Record<TailSettings['direction'],string>={original:'元の向き',back:'後ろへ伸ばす',up:'上げる',down:'下げる',left:'左後ろへ向ける',right:'右後ろへ向ける'};
export const TAIL_PATTERN_NAMES:Record<TailSettings['pattern'],string>={still:'止める',wag:'左右に振る',bounce:'上下に振る',tip:'先だけ振る'};
export const tailSettings=(clip:AnimalClip):TailSettings=>clip.tail?clone(clip.tail):{direction:'original',pattern:'wag',amplitude:clip.tailSwing,cycles:1};
export const tailCycleLimit=(frames:number)=>Math.min(3,Math.floor(frames/4));
export const tailUndersampled=(tail:TailSettings,frames:number)=>tail.pattern!=='still'&&tail.amplitude>0&&tail.cycles>tailCycleLimit(frames);
export function copyTailToClips(clips:AnimalClip[],settings:TailSettings):AnimalClip[]{
 if(clips.some(c=>tailUndersampled(settings,c.frames)))throw Error('尻尾の1周期につき4コマ以上必要です。周期数を減らすか、各動作のコマ数を増やしてください');
 return clips.map(c=>({...clone(c),tail:clone(settings)}));
}
export const isTailBone=(id:string|undefined)=>id==='tailBase'||id==='tailTip';
/** Selection groups every bound tail part, including markings, without changing the model. */
export function selectAnimalTail(mesh:Mesh,rig:AnimalRig):Mesh{
 return {...mesh,triangles:mesh.triangles.filter(t=>isTailBone(t.partId?rig.bindings[t.partId]:undefined)),parts:mesh.parts?.filter(p=>isTailBone(rig.bindings[p.id]))};
}
const I:Quat=[0,0,0,1];
const cross=(a:V3,b:V3):V3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function around(axis:V3,angle:number):Quat{const length=Math.hypot(...axis);if(length<1e-9)return I;const half=angle*Math.PI/360;return [...axis.map(v=>v/length*Math.sin(half)),Math.cos(half)] as Quat;}
/** Direction is relative to the animal's body (+Y back, +X left), never the viewing angle. */
export function tailRotations(rig:AnimalRig,clip:AnimalClip,phase:number):{base:Quat;tip:Quat}{
 const tau=phase*2*Math.PI;
 // Preserve old documents and their rendered pixels exactly until the tail is edited.
 if(!clip.tail)return {base:qEuler([0,0,Math.sin(tau)*clip.tailSwing]),tip:qEuler([0,0,Math.sin(tau-.4)*clip.tailSwing*.5])};
 const tail=clip.tail,start=rig.bones.find(b=>b.id==='tailBase')!.pivot,end=rig.bones.find(b=>b.id==='tailTip')!.pivot,bind=end.map((v,i)=>v-start[i]) as V3;
 const targets:Record<Exclude<TailSettings['direction'],'original'>,V3>={back:[0,1,0],up:[0,.5,.8660254],down:[0,.8660254,-.5],left:[.7071068,.7071068,0],right:[-.7071068,.7071068,0]};
 const direction=tail.direction==='original'?bind:targets[tail.direction],orientation=tail.direction==='original'?I:qFromTo(bind,direction);
 if(tail.pattern==='still'||tail.amplitude===0)return {base:orientation,tip:I};
 const motion=tail.pattern==='bounce'?[0,0,1] as V3:[1,0,0] as V3;
 let axis=cross(direction,motion);if(Math.hypot(...axis)<1e-8)axis=cross(direction,[0,1,0]);
 // Convert the bend axis into the bind frame, so the tip inherits the base's direction and sway.
 const inverse:Quat=[-orientation[0],-orientation[1],-orientation[2],orientation[3]],tipAxis=qRotate(axis,inverse);
 const envelope=clip.loop?1:Math.sin(Math.PI*phase)**2,wave=tau*tail.cycles;
 const baseAngle=tail.pattern==='tip'?0:Math.sin(wave)*tail.amplitude*envelope;
 const tipAngle=Math.sin(wave-.4)*tail.amplitude*(tail.pattern==='tip'?1:.5)*envelope;
 return {base:qMultiply(around(axis,baseAngle),orientation),tip:around(tipAxis,tipAngle)};
}
