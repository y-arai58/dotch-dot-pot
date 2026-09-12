import {clone,renderSet,rotate,validateFrames,type Mesh,type V3,type Style,type Frame,type Direction,type Model} from './pixel';

export const MOTION_VERSION='humanoid-ik-v1';
export const BONE_IDS=['root','pelvis','torso','head','upperArmL','lowerArmL','handL','upperArmR','lowerArmR','handR','thighL','shinL','footL','thighR','shinR','footR'] as const;
export type BoneId=typeof BONE_IDS[number];
export const BONE_NAMES:Record<BoneId,string>={root:'全身の基準',pelvis:'骨盤',torso:'胴',head:'頭',upperArmL:'左上腕',lowerArmL:'左前腕',handL:'左手',upperArmR:'右上腕',lowerArmR:'右前腕',handR:'右手',thighL:'左大腿',shinL:'左すね',footL:'左足',thighR:'右大腿',shinR:'右すね',footR:'右足'};
export const PARENTS:Record<BoneId,BoneId|null>={root:null,pelvis:'root',torso:'pelvis',head:'torso',upperArmL:'torso',lowerArmL:'upperArmL',handL:'lowerArmL',upperArmR:'torso',lowerArmR:'upperArmR',handR:'lowerArmR',thighL:'pelvis',shinL:'thighL',footL:'shinL',thighR:'pelvis',shinR:'thighR',footR:'shinR'};
export type Bone={id:BoneId;parent?:BoneId;pivot:V3};
export type Rig={bones:Bone[];bindings:Record<string,BoneId>;reviewed:boolean;origin:'sample'|'embedded'|'manual'|'skill';skinning?:'envelope'|'embedded'|'rigid';};
export type RiggedModel=Omit<Model,'parts'>&{parts:(Model['parts'][number]&{bone:BoneId})[];rig:{bones:Bone[]};motionCorrections?:Partial<Record<BoneId,V3>>};
export type MotionKind='idle'|'walk'|'crouch'|'jump';
export const MOTION_NAMES:Record<MotionKind,string>={idle:'待機',walk:'歩行',crouch:'しゃがみ',jump:'ジャンプ'};
export type Keyframe={frame:number;rotation:V3};
export type MotionClip={id:MotionKind;name:string;frames:number;fps:number;loop:boolean;stride:number;lift:number;depth:number;height:number;armSwing:number;hold:number;keys:Partial<Record<BoneId,Keyframe[]>>};
export type MotionConfig={version:typeof MOTION_VERSION;rig:Rig;clips:MotionClip[];scale:number;facing:number;style:Style;mode:'front'|'eight'};
export type BonePose={position:V3;rotation:Quat};
export type Pose={bones:Record<BoneId,BonePose>;contacts:{left:boolean;right:boolean};rootHeight:number;issues:string[]};
export type Quat=[number,number,number,number];
export type PackedFrame={direction:Direction;body:string;shadow:string;clipped:boolean};
export type BakedClip={id:MotionKind;frames:PackedFrame[][];issues:string[];events:{frame:number;name:string}[]};
export type AnimationDocument={id:string;assetId:string;sourceRevisionId:string;name:string;config:MotionConfig;baked:BakedClip[];version:number;updatedAt:string;reviewed:boolean};
const I:Quat=[0,0,0,1];
const add=(a:V3,b:V3):V3=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const sub=(a:V3,b:V3):V3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const mul=(a:V3,s:number):V3=>[a[0]*s,a[1]*s,a[2]*s];
const dot=(a:V3,b:V3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a:V3,b:V3):V3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const length=(a:V3)=>Math.hypot(...a);
const unit=(a:V3):V3=>mul(a,1/(length(a)||1));
const clamp=(v:number,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(t:number)=>{t=clamp(t);return t*t*(3-2*t);};
export function qMultiply(a:Quat,b:Quat):Quat{return [a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];}
export function qRotate(v:V3,q:Quat):V3{const u:V3=[q[0],q[1],q[2]];return add(v,add(mul(cross(u,v),2*q[3]),mul(cross(u,cross(u,v)),2)));}
function qFromTo(a:V3,b:V3):Quat{a=unit(a);b=unit(b);const d=clamp(dot(a,b),-1,1);if(d<-.999999){let axis=cross(a,[1,0,0]);if(length(axis)<.001)axis=cross(a,[0,1,0]);axis=unit(axis);return [...axis,0];}const c=cross(a,b),q:Quat=[...c,1+d],n=Math.hypot(...q)||1;return q.map(v=>v/n) as Quat;}
function qEuler(v:V3):Quat{const r=v.map(n=>n*Math.PI/360);return qMultiply(qMultiply([0,0,Math.sin(r[2]),Math.cos(r[2])],[0,Math.sin(r[1]),0,Math.cos(r[1])]),[Math.sin(r[0]),0,0,Math.cos(r[0])]);}
export function rigFromModel(model:RiggedModel,origin:Rig['origin']='sample'):Rig{return {bones:clone(model.rig.bones),bindings:Object.fromEntries(model.parts.map(p=>[p.id,p.bone])),reviewed:true,origin};}
export function defaultClips(corrections:Partial<Record<BoneId,V3>>={}):MotionClip[]{return (['idle','walk','crouch','jump'] as MotionKind[]).map(id=>({id,name:MOTION_NAMES[id],frames:id==='idle'?8:id==='crouch'?10:12,fps:id==='idle'?8:id==='crouch'?10:12,loop:id==='idle'||id==='walk',stride:.32,lift:.12,depth:.22,height:.32,armSwing:24,hold:.3,keys:Object.fromEntries(Object.entries(corrections).map(([id,rotation])=>[id,[{frame:0,rotation}]]))}));}
export function defaultRig():Rig{const pivots:Record<BoneId,V3>={root:[0,0,0],pelvis:[0,0,.82],torso:[0,0,1.08],head:[0,0,1.72],upperArmL:[.4,0,1.5],lowerArmL:[.43,0,1.15],handL:[.43,0,.85],upperArmR:[-.4,0,1.5],lowerArmR:[-.43,0,1.15],handR:[-.43,0,.85],thighL:[.18,0,.82],shinL:[.18,0,.48],footL:[.18,-.03,.14],thighR:[-.18,0,.82],shinR:[-.18,0,.48],footR:[-.18,-.03,.14]};return {bones:BONE_IDS.map(id=>({id,...(PARENTS[id]?{parent:PARENTS[id]!}:{}),pivot:pivots[id]})),bindings:{},reviewed:false,origin:'manual'};}
export function rigIssues(rig:Rig,mesh?:Mesh):string[]{const issues:string[]=[];if(rig.bones.length!==16||new Set(rig.bones.map(b=>b.id)).size!==16)return ['16個の関節を重複なく設定してください'];const map=new Map(rig.bones.map(b=>[b.id,b]));for(const id of BONE_IDS){const b=map.get(id);if(!b||b.parent!==(PARENTS[id]??undefined)||b.pivot.length!==3||b.pivot.some(n=>!Number.isFinite(n)||Math.abs(n)>5)){issues.push(`${BONE_NAMES[id]}の関節設定を確認してください`);continue;}if(b.parent&&!['pelvis','thighL','thighR'].includes(id)){const parent=map.get(b.parent);if(parent&&length(sub(b.pivot,parent.pivot))<.015)issues.push(`${BONE_NAMES[id]}の骨の長さが短すぎます`);}}
 for(const side of ['L','R']){const hip=map.get(('thigh'+side) as BoneId),knee=map.get(('shin'+side) as BoneId),ankle=map.get(('foot'+side) as BoneId);if(hip&&knee&&ankle&&(length(sub(hip.pivot,knee.pivot))<.03||length(sub(knee.pivot,ankle.pivot))<.03||hip.pivot[2]<=ankle.pivot[2]))issues.push('股・膝・足首の高さと長さを確認してください');}
 if(mesh){const missing=(mesh.parts||[]).filter(p=>!rig.bindings[p.id]&&!mesh.triangles.some(t=>t.partId===p.id&&t.weights));if(missing.length)issues.push(`${missing.length}個のパーツに関節を割り当ててください`);}return [...new Set(issues)];}
export function solveLeg(hip:V3,target:V3,upper:number,lower:number){const delta=sub(target,hip),distance=length(delta),min=Math.abs(upper-lower)+1e-6,max=upper+lower-1e-6,d=clamp(distance,min,max),axis:V3=distance<1e-8?[0,0,-1]:unit(delta);let pole=sub([0,-1,0],mul(axis,dot([0,-1,0],axis)));if(length(pole)<1e-6)pole=[0,0,1];pole=unit(pole);const along=(upper*upper-lower*lower+d*d)/(2*d),out=Math.sqrt(Math.max(0,upper*upper-along*along));return {knee:add(hip,add(mul(axis,along),mul(pole,out))),ankle:add(hip,mul(axis,d)),unreachable:distance>max+.0001||distance<min-.0001};}
export function clipPhase(clip:MotionClip,frame:number){return clip.loop?((frame%clip.frames)+clip.frames)%clip.frames/clip.frames:clamp(frame/Math.max(1,clip.frames-1));}
export function sampleKeys(clip:MotionClip,id:BoneId,frame:number):V3{const keys=[...(clip.keys[id]||[])].sort((a,b)=>a.frame-b.frame);if(!keys.length)return [0,0,0];if(keys.length===1)return keys[0].rotation;let t=clip.loop?((frame%clip.frames)+clip.frames)%clip.frames:clamp(frame,0,clip.frames-1);let a=keys.filter(k=>k.frame<=t).at(-1),b=keys.find(k=>k.frame>t);if(clip.loop){if(!a)a={...keys.at(-1)!,frame:keys.at(-1)!.frame-clip.frames};if(!b)b={...keys[0],frame:keys[0].frame+clip.frames};}else{a??=keys[0];b??=keys.at(-1)!;}const weight=b.frame===a.frame?0:smooth((t-a.frame)/(b.frame-a.frame));return a.rotation.map((v,i)=>v+(b.rotation[i]-v)*weight) as V3;}
export function evaluatePose(rig:Rig,clip:MotionClip,frame:number):Pose{
 const errors=rigIssues(rig);if(errors.length)throw Error(errors[0]);
 const bind=Object.fromEntries(rig.bones.map(b=>[b.id,b.pivot])) as Record<BoneId,V3>;
 const bones={} as Record<BoneId,BonePose>;const phase=clipPhase(clip,frame),tau=phase*Math.PI*2;
 let drop=0,rootHeight=0,lean=0;let contactL=true,contactR=true;
 if(clip.id==='idle'){drop=.008*(1-Math.cos(tau));}
 if(clip.id==='walk'){drop=.055+.012*(1-Math.cos(2*tau));lean=4;}
 if(clip.id==='crouch'){const edge=(1-clip.hold)/2;const amount=phase<edge?smooth(phase/edge):phase>1-edge?smooth((1-phase)/edge):1;drop=clip.depth*amount;lean=15*amount;}
 if(clip.id==='jump'){if(phase<.2){drop=clip.depth*.65*smooth(phase/.2);lean=8*smooth(phase/.2);}else if(phase<.72){const u=(phase-.2)/.52;rootHeight=clip.height*4*u*(1-u);drop=clip.depth*.65*(1-smooth(u/.15))+.05*Math.sin(Math.PI*u);lean=8*(1-smooth(u/.3));contactL=contactR=false;}else{const u=(phase-.72)/.28;drop=clip.depth*.55*Math.sin(Math.PI*u);lean=8*Math.sin(Math.PI*u);}}
 function child(id:BoneId,extra:Quat=I){const parent=PARENTS[id];if(!parent){bones[id]={position:add(bind[id],[0,0,rootHeight]),rotation:I};return;}const p=bones[parent];bones[id]={position:add(p.position,qRotate(sub(bind[id],bind[parent]),p.rotation)),rotation:qMultiply(p.rotation,extra)};}
 child('root');child('pelvis');bones.pelvis.position[2]-=drop;child('torso',qEuler([lean,0,0]));child('head',qEuler([-lean*.65,0,0]));
 for(const side of ['L','R'] as const){const offset=side==='L'?0:.5,cycle=(phase+offset)%1;const swing=clip.id==='walk'?Math.cos(cycle*2*Math.PI)*clip.armSwing:clip.id==='jump'?-35*Math.sin(phase*Math.PI):clip.id==='crouch'?-lean*3:0;const upper=('upperArm'+side) as BoneId,lower=('lowerArm'+side) as BoneId,hand=('hand'+side) as BoneId;child(upper,qEuler([swing,0,0]));child(lower,qEuler([-Math.abs(swing)*.35,0,0]));child(hand);
 const thigh=('thigh'+side) as BoneId,shin=('shin'+side) as BoneId,foot=('foot'+side) as BoneId;child(thigh);let target=add(bind[foot],[0,0,rootHeight]);
 if(clip.id==='walk'){const stance=cycle<.5;if(side==='L')contactL=stance;else contactR=stance;target[1]+=stance?-clip.stride/2+2*clip.stride*cycle:clip.stride/2-clip.stride*smooth((cycle-.5)*2);if(!stance)target[2]+=clip.lift*Math.sin((cycle-.5)*2*Math.PI);}
 const solution=solveLeg(bones[thigh].position,target,length(sub(bind[shin],bind[thigh])),length(sub(bind[foot],bind[shin])));
 if(solution.unreachable)errors.push(`${side==='L'?'左':'右'}足が届きません。歩幅・深さ・支点を調整してください`);
 bones[thigh].rotation=qFromTo(sub(bind[shin],bind[thigh]),sub(solution.knee,bones[thigh].position));bones[shin]={position:solution.knee,rotation:qFromTo(sub(bind[foot],bind[shin]),sub(solution.ankle,solution.knee))};bones[foot]={position:solution.ankle,rotation:I};
 }
 const planted={footL:clone(bones.footL.position),footR:clone(bones.footR.position)};
 // Per-joint corrections move the full descendant tree and retain every bone length.
 for(const id of BONE_IDS){const angles=sampleKeys(clip,id,frame);if(angles.every(v=>v===0))continue;const q=bones[id].rotation,delta=qMultiply(qMultiply(q,qEuler(angles)),[-q[0],-q[1],-q[2],q[3]]),pivot=bones[id].position;for(const descendant of BONE_IDS){let current:BoneId|null=descendant;while(current&&current!==id)current=PARENTS[current];if(current===id){bones[descendant]={position:add(pivot,qRotate(sub(bones[descendant].position,pivot),delta)),rotation:qMultiply(delta,bones[descendant].rotation)};}}}
 for(const [id,contact] of [['footL',contactL],['footR',contactR]] as const){if(contact&&(length(sub(bones[id].position,planted[id]))>.008||Math.abs(bones[id].position[2]-bind[id][2])>.008||Math.abs(bones[id].rotation[0])>.01||Math.abs(bones[id].rotation[1])>.01))errors.push(`${BONE_NAMES[id]}の接地が崩れています。関節キーを調整してください`);}
 return {bones,contacts:{left:contactL,right:contactR},rootHeight,issues:[...new Set(errors)]};
}
export function poseMesh(mesh:Mesh,rig:Rig,pose:Pose,onlyPart?:string):Mesh{const bind=Object.fromEntries(rig.bones.map(b=>[b.id,b.pivot])) as Record<BoneId,V3>;const transform=(point:V3,bone:BoneId)=>add(pose.bones[bone].position,qRotate(sub(point,bind[bone]),pose.bones[bone].rotation));return {...mesh,triangles:mesh.triangles.filter(t=>!onlyPart||t.partId===onlyPart).map(t=>({...t,vertices:t.vertices.map((v,i)=>{const override=t.partId&&rig.bindings[t.partId];if(override)return transform(v,override);const influences=t.weights?.[i]?.filter(w=>BONE_IDS.includes(w.bone as BoneId)&&w.weight>0);if(influences?.length){const total=influences.reduce((n,w)=>n+w.weight,0);return influences.reduce((point,w)=>add(point,mul(transform(v,w.bone as BoneId),w.weight/total)),[0,0,0] as V3);}return transform(v,'root');}) as [V3,V3,V3]}))};}
export function renderMotionFrame(mesh:Mesh,config:MotionConfig,clip:MotionClip,frame:number,onlyPart?:string){const pose=evaluatePose(config.rig,clip,frame),posed=poseMesh(mesh,config.rig,pose,onlyPart);if(posed.triangles.some(t=>t.vertices.some(v=>v[2]<-.015)))pose.issues.push('パーツが地面へ貫通しています。支点・追従先・関節キーを調整してください');return {pose,frames:renderSet(posed,config.style,config.mode,config.scale,config.facing)};}
export function packPixels(pixels:number[]):string{const raw=Uint8Array.from(pixels),runs:number[]=[];for(let i=0;i<raw.length;){let n=1;while(n<255&&i+n<raw.length&&raw[i+n]===raw[i])n++;runs.push(n,raw[i]);i+=n;}const rle=Uint8Array.from(runs),useRle=rle.length<raw.length;return (useRle?'r:':'b:')+btoa(String.fromCharCode(...(useRle?rle:raw)));}
export function unpackPixels(packed:string):number[]{if(packed.length>6000||!/^([rb]):[A-Za-z0-9+/]*={0,2}$/.test(packed))throw Error('画素の形式を確認してください');const raw=Uint8Array.from(atob(packed.slice(2)),c=>c.charCodeAt(0));let values:number[]=[];if(packed.startsWith('b:'))values=Array.from(raw);else{if(raw.length%2)throw Error('圧縮画素が破損しています');for(let i=0;i<raw.length;i+=2){if(!raw[i]||values.length+raw[i]>4096)throw Error('圧縮画素が破損しています');values.push(...new Array(raw[i]).fill(raw[i+1]));}}if(values.length!==4096)throw Error('64×64ではありません');return values;}
export const packFrame=(f:Frame):PackedFrame=>({...f,body:packPixels(f.body),shadow:packPixels(f.shadow)});
export const unpackFrame=(f:PackedFrame):Frame=>({...f,body:unpackPixels(f.body),shadow:unpackPixels(f.shadow)});
export function motionEvents(rig:Rig,clip:MotionClip){const events:{frame:number;name:string}[]=[];for(let i=0;i<clip.frames;i++){const current=evaluatePose(rig,clip,i).contacts;const prev=i===0?(clip.loop?evaluatePose(rig,clip,clip.frames-1).contacts:null):evaluatePose(rig,clip,i-1).contacts;for(const side of ['left','right'] as const){if(prev&&current[side]!==prev[side])events.push({frame:i,name:`${side}_${current[side]?'contact':'lift'}`});}}return events;}
export async function bakeAnimations(mesh:Mesh,config:MotionConfig,progress?:(done:number,total:number)=>void):Promise<BakedClip[]>{const rigErrors=rigIssues(config.rig,mesh);if(rigErrors.length)throw Error(rigErrors[0]);if(!config.rig.reviewed)throw Error('パーツと関節の対応を確認してください');const total=config.clips.reduce((n,c)=>n+c.frames,0);if(total>64)throw Error('全動作の合計を64フレーム以下にしてください');const result:BakedClip[]=[];let done=0;for(const clip of config.clips){const frames:PackedFrame[][]=[],issues=new Set<string>();for(let i=0;i<clip.frames;i++){const rendered=renderMotionFrame(mesh,config,clip,i);for(const error of [...rendered.pose.issues,...validateFrames(rendered.frames,config.style,config.mode)])issues.add(`${i+1}コマ: ${error}`);frames.push(rendered.frames.map(packFrame));progress?.(++done,total);await new Promise<void>(resolve=>setTimeout(resolve,0));}result.push({id:clip.id,frames,issues:[...issues],events:motionEvents(config.rig,clip)});}return result;}

/** Initial weight estimates for unrigged humanoids. They require explicit inspection. */
export function envelopeSkin(mesh:Mesh,rig:Rig):Mesh{
 const pivots=Object.fromEntries(rig.bones.map(b=>[b.id,b.pivot])) as Record<BoneId,V3>;
 const ends:Partial<Record<BoneId,BoneId>>={pelvis:'torso',torso:'head',upperArmL:'lowerArmL',lowerArmL:'handL',upperArmR:'lowerArmR',lowerArmR:'handR',thighL:'shinL',shinL:'footL',thighR:'shinR',shinR:'footR'};
 const candidates=BONE_IDS.filter(id=>id!=='root');
 const weights=(v:V3)=>{
  const ranked=candidates.map(id=>{const a=pivots[id],b=ends[id]?pivots[ends[id]!]:a,ab=sub(b,a),t=clamp(dot(sub(v,a),ab)/(dot(ab,ab)||1));return {bone:id,distance:length(sub(v,add(a,mul(ab,t))))};}).sort((a,b)=>a.distance-b.distance);
  const first=ranked[0],second=ranked.find(r=>r.bone!==first.bone&&(PARENTS[r.bone]===first.bone||PARENTS[first.bone]===r.bone));
  if(!second||second.distance-first.distance>.12)return [{bone:first.bone,weight:1}];
  const x=1/(first.distance+.03)**4,y=1/(second.distance+.03)**4;
  return [{bone:first.bone,weight:x/(x+y)},{bone:second.bone,weight:y/(x+y)}];
 };
 const used=new Set<BoneId>();
 const triangles=mesh.triangles.map(t=>{const w=t.vertices.map(weights) as TriangleWeights;const center=mul(add(add(t.vertices[0],t.vertices[1]),t.vertices[2]),1/3);const bone=weights(center)[0].bone;used.add(bone);return {...t,weights:w,partId:`region-${bone}`};});
 return {...mesh,triangles,parts:[...used].map(id=>({id:`region-${id}`,name:`${BONE_NAMES[id]}（推定）`}))};
}
type TriangleWeights=NonNullable<Mesh['triangles'][number]['weights']>;
