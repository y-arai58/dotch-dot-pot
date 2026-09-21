import {clone,renderSet,validateFrames,type Mesh,type Model,type Style,type V3} from './pixel';
import {qEuler,qFromTo,qMultiply,qRotate,solveLeg,packFrame,type Quat,type BonePose,type MotionKind,type Keyframe,type BakedClip} from './animation';
import {tailRotations,tailUndersampled,type TailSettings} from './animal-tail';

export const ANIMAL_MOTION_VERSION='quadruped-ik-v1';
export const ANIMAL_BONES=['root','body','chest','neck','head','tailBase','tailTip','frontUpperL','frontLowerL','frontPawL','frontUpperR','frontLowerR','frontPawR','hindUpperL','hindLowerL','hindPawL','hindUpperR','hindLowerR','hindPawR'] as const;
export type AnimalBone=typeof ANIMAL_BONES[number];
export const ANIMAL_PARENTS:Record<AnimalBone,AnimalBone|null>={root:null,body:'root',chest:'body',neck:'chest',head:'neck',tailBase:'body',tailTip:'tailBase',frontUpperL:'chest',frontLowerL:'frontUpperL',frontPawL:'frontLowerL',frontUpperR:'chest',frontLowerR:'frontUpperR',frontPawR:'frontLowerR',hindUpperL:'body',hindLowerL:'hindUpperL',hindPawL:'hindLowerL',hindUpperR:'body',hindLowerR:'hindUpperR',hindPawR:'hindLowerR'};
export const ANIMAL_NAMES:Record<AnimalBone,string>={root:'全身の基準',body:'胴・腰',chest:'胸',neck:'首',head:'頭',tailBase:'尾の付け根',tailTip:'尾の先',frontUpperL:'左前脚・上',frontLowerL:'左前脚・下',frontPawL:'左前足',frontUpperR:'右前脚・上',frontLowerR:'右前脚・下',frontPawR:'右前足',hindUpperL:'左後脚・上',hindLowerL:'左後脚・下',hindPawL:'左後足',hindUpperR:'右後脚・上',hindLowerR:'右後脚・下',hindPawR:'右後足'};
export const PAWS=['hindPawL','frontPawL','hindPawR','frontPawR'] as const;
export type Paw=typeof PAWS[number];
export const WALK_DUTY=.75;
export type AnimalRig={bones:{id:AnimalBone;parent?:AnimalBone;pivot:V3}[];bindings:Record<string,AnimalBone>;reviewed:boolean;origin:'sample'|'skill'};
export type AnimalModel=Omit<Model,'parts'>&{parts:(Model['parts'][number]&{bone:AnimalBone})[];rig:{bones:AnimalRig['bones']};motionCorrections?:Partial<Record<AnimalBone,V3>>};
export type AnimalClip={id:MotionKind;name:string;frames:number;fps:number;loop:boolean;stride:number;lift:number;depth:number;height:number;tailSwing:number;tail?:TailSettings;hold:number;keys:Partial<Record<AnimalBone,Keyframe[]>>};
export type AnimalConfig={version:typeof ANIMAL_MOTION_VERSION;rig:AnimalRig;clips:AnimalClip[];scale:number;facing:number;style:Style;mode:'front'|'eight'};
export type AnimalDocument={id:string;assetId:string;sourceRevisionId:string;name:string;config:AnimalConfig;baked:BakedClip[];version:number;updatedAt:string;reviewed:boolean};
export type AnimalPose={bones:Record<AnimalBone,BonePose>;contacts:Record<Paw,boolean>;rootHeight:number;issues:string[]};
const add=(a:V3,b:V3):V3=>a.map((v,i)=>v+b[i]) as V3;
const sub=(a:V3,b:V3):V3=>a.map((v,i)=>v-b[i]) as V3;
const len=(v:V3)=>Math.hypot(...v);
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const smooth=(v:number)=>{v=clamp(v);return v*v*(3-2*v);};
const I:Quat=[0,0,0,1];
export function animalRig(model:AnimalModel,origin:AnimalRig['origin']='skill'):AnimalRig{return {bones:clone(model.rig.bones),bindings:Object.fromEntries(model.parts.map(p=>[p.id,p.bone])),reviewed:true,origin};}
export function animalClips(corrections:AnimalModel['motionCorrections']={}):AnimalClip[]{return (['idle','walk','crouch','jump'] as const).map(id=>({id,name:{idle:'待機',walk:'歩行',crouch:'伏せ・しゃがみ',jump:'ジャンプ'}[id],frames:{idle:8,walk:16,crouch:10,jump:12}[id],fps:id==='idle'?8:id==='crouch'?10:12,loop:id==='idle'||id==='walk',stride:.24,lift:.1,depth:.18,height:.22,tailSwing:10,hold:.3,keys:Object.fromEntries(Object.entries(corrections).map(([id,rotation])=>[id,[{frame:0,rotation}]]))}));}
export function animalRigIssues(rig:AnimalRig,mesh?:Mesh){
 const issues:string[]=[];
 if(rig.bones.length!==19||new Set(rig.bones.map(b=>b.id)).size!==19)return ['19個の動物用関節を重複なく設定してください'];
 const map=new Map(rig.bones.map(b=>[b.id,b]));
 for(const id of ANIMAL_BONES){const bone=map.get(id);if(!bone||bone.parent!==(ANIMAL_PARENTS[id]??undefined)||bone.pivot.some(n=>!Number.isFinite(n)||Math.abs(n)>5)){issues.push(`${ANIMAL_NAMES[id]}の設定を確認してください`);continue;}const parent=bone.parent&&map.get(bone.parent);if(parent&&len(sub(bone.pivot,parent.pivot))<.015)issues.push(`${ANIMAL_NAMES[id]}の骨が短すぎます`);}
 if(map.get('root')?.pivot.some(v=>v!==0))issues.push('全身の基準は原点に置いてください');
 for(const group of ['front','hind'])for(const side of ['L','R']){const a=map.get(`${group}Upper${side}` as AnimalBone),b=map.get(`${group}Lower${side}` as AnimalBone),c=map.get(`${group}Paw${side}` as AnimalBone);if(a&&b&&c&&(len(sub(a.pivot,b.pivot))<.03||len(sub(b.pivot,c.pivot))<.03||a.pivot[2]<=c.pivot[2]))issues.push('脚の長さと高さを確認してください');}
 if(mesh&&(mesh.parts||[]).some(p=>!ANIMAL_BONES.includes(rig.bindings[p.id])))issues.push('すべての部品を動物用関節へ割り当ててください');
 return [...new Set(issues)];
}
export const animalPhase=(clip:AnimalClip,frame:number)=>clip.loop?((frame%clip.frames)+clip.frames)%clip.frames/clip.frames:clamp(frame/(clip.frames-1));
export function animalKeys(clip:AnimalClip,bone:AnimalBone,frame:number):V3{
 const keys=[...(clip.keys[bone]||[])].sort((a,b)=>a.frame-b.frame);if(!keys.length)return [0,0,0];if(keys.length===1)return keys[0].rotation;
 const t=clip.loop?((frame%clip.frames)+clip.frames)%clip.frames:Math.min(clip.frames-1,Math.max(0,frame));let a=keys.filter(k=>k.frame<=t).at(-1),b=keys.find(k=>k.frame>t);
 if(clip.loop){a??={...keys.at(-1)!,frame:keys.at(-1)!.frame-clip.frames};b??={...keys[0],frame:keys[0].frame+clip.frames};}else{a??=keys[0];b??=keys.at(-1)!;}
 const w=a.frame===b.frame?0:smooth((t-a.frame)/(b.frame-a.frame));return a.rotation.map((v,i)=>v+(b.rotation[i]-v)*w) as V3;
}
/** Offsets describe contact-start phases: LH, LF, RH, RF. */
export function pawTrajectory(clip:AnimalClip,paw:Paw,phase:number){
 const cycle=(phase-PAWS.indexOf(paw)/4+1)%1,contact=cycle<WALK_DUTY;
 if(contact)return {y:-clip.stride/2+clip.stride*cycle/WALK_DUTY,z:0,contact};
 const t=(cycle-WALK_DUTY)/(1-WALK_DUTY),m=clip.stride*(1-WALK_DUTY)/WALK_DUTY;
 // Hermite tangents match stance velocity at takeoff and landing.
 const y=(2*t**3-3*t*t+1)*clip.stride/2+(t**3-2*t*t+t)*m+(-2*t**3+3*t*t)*(-clip.stride/2)+(t**3-t*t)*m;
 return {y,z:clip.lift*Math.sin(Math.PI*t)**2,contact};
}
export function animalPose(rig:AnimalRig,clip:AnimalClip,frame:number):AnimalPose{
 const issues=animalRigIssues(rig);if(issues.length)throw Error(issues[0]);if(clip.id==='walk'&&clip.frames<8)issues.push('四足歩行は8コマ以上にしてください');
 if(clip.tail&&tailUndersampled(clip.tail,clip.frames))issues.push('尻尾の1周期につき4コマ以上必要です');
 const bind=Object.fromEntries(rig.bones.map(b=>[b.id,b.pivot])) as Record<AnimalBone,V3>,bones={} as AnimalPose['bones'],contacts=Object.fromEntries(PAWS.map(p=>[p,true])) as Record<Paw,boolean>;
 const phase=animalPhase(clip,frame),tau=phase*2*Math.PI;let drop=0,rootHeight=0,lean=0;
 if(clip.id==='idle')drop=.006*(1-Math.cos(tau));
 if(clip.id==='walk')drop=.025+.008*(1-Math.cos(4*tau));
 if(clip.id==='crouch'){const edge=(1-clip.hold)/2,amount=phase<edge?smooth(phase/edge):phase>1-edge?smooth((1-phase)/edge):1;drop=clip.depth*amount;lean=3*amount;}
 if(clip.id==='jump'){if(phase<.2)drop=clip.depth*.5*smooth(phase/.2);else if(phase<.75){const u=(phase-.2)/.55;rootHeight=clip.height*4*u*(1-u);drop=clip.depth*.5*(1-smooth(u/.18));if(rootHeight>1e-8)for(const paw of PAWS)contacts[paw]=false;}else{const u=(phase-.75)/.25;drop=clip.depth*.4*Math.sin(Math.PI*u);}}
 function child(id:AnimalBone,rotation:Quat=I){const parent=ANIMAL_PARENTS[id];if(!parent){bones[id]={position:[0,0,rootHeight],rotation:I};return;}const p=bones[parent];bones[id]={position:add(p.position,qRotate(sub(bind[id],bind[parent]),p.rotation)),rotation:qMultiply(p.rotation,rotation)};}
 const tail=tailRotations(rig,clip,phase);
 child('root');child('body',qEuler([lean,0,0]));bones.body.position[2]-=drop;child('chest');child('neck',qEuler([-lean,0,0]));child('head');child('tailBase',tail.base);child('tailTip',tail.tip);
 for(const group of ['front','hind'] as const)for(const side of ['L','R'] as const){const upper=`${group}Upper${side}` as AnimalBone,lower=`${group}Lower${side}` as AnimalBone,paw=`${group}Paw${side}` as Paw;child(upper);let target=add(bind[paw],[0,0,rootHeight]);if(clip.id==='walk'){const trajectory=pawTrajectory(clip,paw,phase);target=add(target,[0,trajectory.y,trajectory.z]);contacts[paw]=trajectory.contact;}
  const solution=solveLeg(bones[upper].position,target,len(sub(bind[lower],bind[upper])),len(sub(bind[paw],bind[lower])),[0,group==='front'?1:-1,0]);
  if(solution.unreachable)issues.push(`${ANIMAL_NAMES[paw]}が届きません。歩幅・伏せの深さ・支点を調整してください`);
  bones[upper].rotation=qFromTo(sub(bind[lower],bind[upper]),sub(solution.knee,bones[upper].position));bones[lower]={position:solution.knee,rotation:qFromTo(sub(bind[paw],bind[lower]),sub(solution.ankle,solution.knee))};bones[paw]={position:solution.ankle,rotation:I};
 }
 const planted=Object.fromEntries(PAWS.map(id=>[id,clone(bones[id].position)])) as Record<Paw,V3>;
 for(const id of ANIMAL_BONES){const angles=animalKeys(clip,id,frame);if(angles.every(v=>v===0))continue;const q=bones[id].rotation,delta=qMultiply(qMultiply(q,qEuler(angles)),[-q[0],-q[1],-q[2],q[3]]),pivot=bones[id].position;for(const other of ANIMAL_BONES){let at:AnimalBone|null=other;while(at&&at!==id)at=ANIMAL_PARENTS[at];if(at===id)bones[other]={position:add(pivot,qRotate(sub(bones[other].position,pivot),delta)),rotation:qMultiply(delta,bones[other].rotation)};}}
 for(const paw of PAWS)if(contacts[paw]&&(len(sub(planted[paw],bones[paw].position))>.008||Math.abs(bones[paw].position[2]-bind[paw][2])>.008||Math.abs(bones[paw].rotation[0])>.01||Math.abs(bones[paw].rotation[1])>.01))issues.push(`${ANIMAL_NAMES[paw]}の接地が崩れています`);
 return {bones,contacts,rootHeight,issues:[...new Set(issues)]};
}
export function animalPoseMesh(mesh:Mesh,rig:AnimalRig,pose:AnimalPose,onlyPart?:string):Mesh{
 const bind=Object.fromEntries(rig.bones.map(b=>[b.id,b.pivot])) as Record<AnimalBone,V3>;
 return {...mesh,triangles:mesh.triangles.filter(t=>!onlyPart||t.partId===onlyPart).map(t=>{const id=rig.bindings[t.partId!];if(!id)throw Error('関節が未割当です');return {...t,vertices:t.vertices.map(v=>add(pose.bones[id].position,qRotate(sub(v,bind[id]),pose.bones[id].rotation))) as [V3,V3,V3]};})};
}
export function renderAnimalFrame(mesh:Mesh,config:AnimalConfig,clip:AnimalClip,frame:number){const pose=animalPose(config.rig,clip,frame),posed=animalPoseMesh(mesh,config.rig,pose);if(posed.triangles.some(t=>t.vertices.some(v=>v[2]<-.015)))pose.issues.push('部品が地面へ貫通しています');return {pose,frames:renderSet(posed,config.style,config.mode,config.scale,config.facing)};}
export function animalEvents(rig:AnimalRig,clip:AnimalClip){const events:{frame:number;name:string}[]=[];for(let f=0;f<clip.frames;f++){const current=animalPose(rig,clip,f).contacts,previous=f===0?(clip.loop?animalPose(rig,clip,clip.frames-1).contacts:null):animalPose(rig,clip,f-1).contacts;for(const paw of PAWS)if(previous&&current[paw]!==previous[paw])events.push({frame:f,name:`${paw}_${current[paw]?'contact':'lift'}`});}return events;}
export async function bakeAnimal(mesh:Mesh,config:AnimalConfig,progress?:(done:number,total:number)=>void){const errors=animalRigIssues(config.rig,mesh);if(errors.length||!config.rig.reviewed)throw Error(errors[0]||'関節の対応を確認してください');const total=config.clips.reduce((n,c)=>n+c.frames,0);if(total>64)throw Error('全動作合計64コマ以下にしてください');const baked:BakedClip[]=[];let done=0;for(const clip of config.clips){const frames:BakedClip['frames']=[],issues=new Set<string>();for(let f=0;f<clip.frames;f++){const result=renderAnimalFrame(mesh,config,clip,f);for(const issue of [...result.pose.issues,...validateFrames(result.frames,config.style,config.mode)])issues.add(`${f+1}コマ: ${issue}`);frames.push(result.frames.map(packFrame));progress?.(++done,total);await new Promise<void>(resolve=>setTimeout(resolve,0));}baked.push({id:clip.id,frames,issues:[...issues],events:animalEvents(config.rig,clip)});}return baked;}
