import {test} from 'node:test';
import assert from 'node:assert/strict';
import samples from '../lib/animal-samples.json';
import {parseAnimal,animalAnimationSchema,tailSettingsSchema} from '../lib/animal-contracts';
import {animalClips,animalRig,animalPose,animalPoseMesh,animalPhase,bakeAnimal,ANIMAL_BONES,ANIMAL_MOTION_VERSION,type AnimalDocument} from '../lib/animal-animation';
import {TAIL_DIRECTIONS,TAIL_PATTERNS,tailRotations,tailSettings,copyTailToClips,selectAnimalTail,isTailBone,type TailSettings} from '../lib/animal-tail';
import {qEuler,qRotate,unpackFrame} from '../lib/animation';
import {buildMesh,clone,renderSet,DEFAULT_STYLE} from '../lib/pixel';
import {inheritAnimation} from '../lib/animation-inheritance';
import {exportAnimation} from '../lib/animation-export';
const models=samples.map(parseAnimal),tail:TailSettings={direction:'back',pattern:'wag',amplitude:20,cycles:1};
const distance=(a:number[],b:number[])=>Math.hypot(...a.map((v,i)=>v-b[i]));
function document():AnimalDocument{const model=models[0];return {id:crypto.randomUUID(),assetId:crypto.randomUUID(),sourceRevisionId:crypto.randomUUID(),name:'尻尾の検証',version:0,updatedAt:'',reviewed:false,config:{version:ANIMAL_MOTION_VERSION,rig:animalRig(model),clips:animalClips(model.motionCorrections),style:clone(DEFAULT_STYLE),mode:'eight',scale:1,facing:0},baked:[]};}

test('旧データの尻尾と基準モデルは設定を触るまで同一の動きを保つ',()=>{
 for(const model of models){const rig=animalRig(model);for(const clip of animalClips(model.motionCorrections))for(let frame=0;frame<clip.frames;frame++){
  const phase=animalPhase(clip,frame),rotations=tailRotations(rig,clip,phase),tau=phase*2*Math.PI;
  assert.deepEqual(rotations,{base:qEuler([0,0,Math.sin(tau)*clip.tailSwing]),tip:qEuler([0,0,Math.sin(tau-.4)*clip.tailSwing*.5])});
 }}
 const old=document();assert.deepEqual(animalAnimationSchema.parse(old),old);assert.equal(old.config.clips[0].tail,undefined);
});

test('向きと全パターンは尻尾の二関節だけを変え、全身動作・四脚の接地・長さを維持する',()=>{
 for(const model of models){const rig=animalRig(model),mesh=buildMesh(model),bind=rig.bones.filter(b=>isTailBone(b.id));
 for(const clip of animalClips(model.motionCorrections))for(const pattern of TAIL_PATTERNS)for(const direction of TAIL_DIRECTIONS){
  const frame=Math.floor(clip.frames/3),before=animalPose(rig,clip,frame),after=animalPose(rig,{...clip,tail:{...tail,pattern,direction}},frame);
  for(const id of ANIMAL_BONES.filter(id=>!isTailBone(id)))assert.deepEqual(after.bones[id],before.bones[id],clip.id+'/'+direction+'/'+pattern+'/'+id);
  assert.deepEqual(after.contacts,before.contacts);assert.equal(after.rootHeight,before.rootHeight);
  assert.ok(Math.abs(distance(after.bones.tailBase.position,after.bones.tailTip.position)-distance(bind[0].pivot,bind[1].pivot))<1e-9);
  const posed=animalPoseMesh(mesh,rig,after),original=animalPoseMesh(mesh,rig,before);
  for(const [i,t] of posed.triangles.entries())if(!isTailBone(rig.bindings[t.partId!]))assert.deepEqual(t,original.triangles[i]);
 }
 }
});

test('尻尾の向きは元モデルの尾の軸を使い、動物自身の前後・左右・高さへ合わせる',()=>{
 for(const model of models){const rig=animalRig(model),clip=animalClips()[0];
 const v=(direction:TailSettings['direction'])=>{const pose=animalPose(rig,{...clip,tail:{...tail,pattern:'still',direction}},0);return pose.bones.tailTip.position.map((n,i)=>n-pose.bones.tailBase.position[i]);};
 const back=v('back');assert.ok(back[1]>0&&Math.abs(back[0])<1e-8&&Math.abs(back[2])<1e-8);
 const left=v('left'),right=v('right');assert.ok(left[0]>0&&left[1]>0);assert.ok(right[0]<0&&right[1]>0);assert.ok(v('up')[2]>0);assert.ok(v('down')[2]<0);
 const original=v('original'),base=rig.bones.find(b=>b.id==='tailBase')!,tip=rig.bones.find(b=>b.id==='tailTip')!;assert.ok(distance(original,tip.pivot.map((n,i)=>n-base.pivot[i]))<1e-9);
 }
});

test('止める・先だけ振る・左右・上下を区別し、ループ端と単発動作の終了姿勢を保つ',()=>{
 const model=models[0],rig=animalRig(model),mesh=buildMesh(model),clip=animalClips()[1];
 const tailVertices=(pattern:TailSettings['pattern'],frame:number,bone:string)=>animalPoseMesh(mesh,rig,animalPose(rig,{...clip,tail:{...tail,pattern}},frame)).triangles.filter(t=>rig.bindings[t.partId!]===bone).flatMap(t=>t.vertices);
 // Compare rotations, since the walking body itself moves even when the tail is still.
 assert.deepEqual(tailRotations(rig,{...clip,tail:{...tail,pattern:'still'}},.25),tailRotations(rig,{...clip,tail:{...tail,pattern:'still'}},.75));
 assert.deepEqual(tailVertices('tip',4,'tailBase'),tailVertices('still',4,'tailBase'));
 assert.notDeepEqual(tailVertices('tip',4,'tailTip'),tailVertices('still',4,'tailTip'));
 const wag=tailRotations(rig,{...clip,tail},.25),bounce=tailRotations(rig,{...clip,tail:{...tail,pattern:'bounce'}},.25);assert.notDeepEqual(wag,bounce);
 for(const pattern of TAIL_PATTERNS){const changed={...clip,tail:{...tail,pattern,cycles:3}};assert.deepEqual(animalPose(rig,changed,0),animalPose(rig,changed,changed.frames));}
 const jump={...animalClips()[3],tail:{...tail,cycles:2}};const start=tailRotations(rig,jump,0),end=tailRotations(rig,jump,1);assert.ok(distance(start.base,end.base)<1e-12&&distance(start.tip,end.tip)<1e-12);
});

test('尻尾単体の選択は付け根・先端・所属する模様のパーツをまとめ、モデルを変更しない',()=>{
 for(const model of models){const mesh=buildMesh(model),original=clone(mesh),rig=animalRig(model),selected=selectAnimalTail(mesh,rig);
 assert.ok(selected.parts!.length>=2);assert.ok(selected.triangles.length>0&&selected.triangles.length<mesh.triangles.length);
 const ids=new Set(selected.parts!.map(p=>rig.bindings[p.id]));assert.deepEqual([...ids].sort(),['tailBase','tailTip']);assert.ok(selected.triangles.every(t=>isTailBone(rig.bindings[t.partId!])));assert.deepEqual(mesh,original);
 }
});

test('全動作へ尻尾設定をコピーしても既存の歩幅・コマ数・関節キーを変えず、コピー間で参照を共有しない',()=>{
 const clips=animalClips();clips[1].fps=9;clips[1].keys.head=[{frame:2,rotation:[2,3,4]}];const before=clone(clips),next=copyTailToClips(clips,{...tail,cycles:2});
 for(const [i,c] of next.entries()){const {tail:copied,...body}=c;assert.deepEqual(body,clips[i]);assert.deepEqual(copied,{...tail,cycles:2});}
 next[0].tail!.amplitude=3;assert.equal(next[1].tail!.amplitude,20);assert.deepEqual(clips,before);
 assert.throws(()=>copyTailToClips(clips,{...tail,cycles:3}),/4コマ/);
});

test('保存契約は未対応の向き・動き・回数・振れ幅と周期の不足を拒否する',()=>{
 assert.deepEqual(tailSettingsSchema.parse(tail),tail);
 for(const invalid of [{...tail,amplitude:36},{...tail,amplitude:-1},{...tail,amplitude:Infinity},{...tail,cycles:1.5},{...tail,cycles:4},{...tail,cycles:0},{...tail,direction:'screen-left'},{...tail,pattern:'run'},{...tail,extra:true}])assert.equal(tailSettingsSchema.safeParse(invalid).success,false);
 const doc=document();doc.config.clips[0].tail={...tail,cycles:3};assert.equal(animalAnimationSchema.safeParse(doc).success,false);doc.config.clips[0].tail.pattern='still';assert.equal(animalAnimationSchema.safeParse(doc).success,true);
});

test('設定・全方向の画素・書き出しJSON・新しい版への継承で尻尾設定を復元する',async()=>{
 const doc=document(),mesh=buildMesh(models[0]);doc.config.clips=[{...doc.config.clips[1],frames:8,tail:{...tail,direction:'original',pattern:'tip',amplitude:6,cycles:2}}];
 doc.baked=await bakeAnimal(mesh,doc.config);assert.deepEqual(doc.baked[0].issues,[]);
 const restored=animalAnimationSchema.parse(JSON.parse(JSON.stringify(doc)));assert.deepEqual(restored,doc);
 for(const [i,frames] of restored.baked[0].frames.entries())assert.deepEqual(frames.map(unpackFrame),renderSet(animalPoseMesh(mesh,doc.config.rig,animalPose(doc.config.rig,doc.config.clips[0],i)),doc.config.style));
 const files=exportAnimation(restored),metadata=JSON.parse(new TextDecoder().decode(files['animation.json']));assert.deepEqual(metadata.settings[0].tail,doc.config.clips[0].tail);assert.equal(metadata.directions.length,8);
 const next=inheritAnimation(doc,{...document(),sourceRevisionId:crypto.randomUUID()});assert.deepEqual(next.config.clips[0].tail,doc.config.clips[0].tail);assert.deepEqual(next.baked,[]);
});
