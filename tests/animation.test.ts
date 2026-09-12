import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {mkdirSync,writeFileSync} from 'node:fs';
import samples from '../lib/animation-samples.json';
import {buildMesh,DEFAULT_STYLE,clone,validateFrames,type V3} from '../lib/pixel';
import {BONE_IDS,PARENTS,MOTION_VERSION,rigFromModel,defaultClips,evaluatePose,poseMesh,solveLeg,qRotate,envelopeSkin,bakeAnimations,packPixels,unpackPixels,unpackFrame,type RiggedModel,type AnimationDocument,type MotionConfig} from '../lib/animation';
import {exportAnimation} from '../lib/animation-export';
import {animationSchema,animationIssues} from '../lib/animation-contracts';
const models=samples as RiggedModel[];
const model=models[0],mesh=buildMesh(model),rig=rigFromModel(model),clips=defaultClips(model.motionCorrections);
const distance=(a:V3,b:V3)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const config:MotionConfig={version:MOTION_VERSION,rig,clips,scale:.9,facing:0,style:clone(DEFAULT_STYLE),mode:'eight'};
const base={id:'animation-test',assetId:'asset-test',sourceRevisionId:'revision-test',name:'基本動作',config,version:0,updatedAt:'',reviewed:false};

test('全動作の関節間距離を維持し、初期サンプルのパーツが地面を貫通しない',()=>{
 for(const m of models){const r=rigFromModel(m),source=buildMesh(m);for(const clip of defaultClips(m.motionCorrections))for(let i=0;i<clip.frames;i++){
  const pose=evaluatePose(r,clip,i);assert.deepEqual(pose.issues,[],`${m.id}/${clip.id}/${i}`);
  for(const id of BONE_IDS){const parent=PARENTS[id];if(!parent||id==='pelvis')continue;const expected=distance(r.bones.find(b=>b.id===id)!.pivot,r.bones.find(b=>b.id===parent)!.pivot);assert.ok(Math.abs(distance(pose.bones[id].position,pose.bones[parent].position)-expected)<1e-5,`${id} bone length`);}
  for(const t of poseMesh(source,r,pose).triangles)for(const v of t.vertices)assert.ok(v[2]>=-.015,`${m.id}/${clip.id}/${i}/${t.partId}: ${v[2]}`);
 }}
});
test('接地足の移動とゲーム側の推奨速度が相殺し、ループ端の姿勢が一致する',()=>{
 const clip=clips.find(c=>c.id==='walk')!,duration=clip.frames/clip.fps,speed=2*clip.stride/duration;
 const start=evaluatePose(rig,clip,0).bones.footL.position;
 for(let f=0;f<clip.frames/2;f+=.25){const p=evaluatePose(rig,clip,f);assert.equal(p.contacts.left,true);assert.ok(Math.abs((p.bones.footL.position[1]-speed*f/clip.fps)-start[1])<1e-5);assert.ok(Math.abs(p.bones.footL.position[2]-start[2])<1e-5);}
 assert.deepEqual(evaluatePose(rig,clip,0),evaluatePose(rig,clip,clip.frames));
});
test('ジャンプは離陸時に連続し、空中と着地を区別する',()=>{
 const clip=clips.find(c=>c.id==='jump')!,f=.2*(clip.frames-1);const before=evaluatePose(rig,clip,f-1e-6),after=evaluatePose(rig,clip,f);
 assert.ok(distance(before.bones.head.position,after.bones.head.position)<1e-4);
 assert.equal(before.contacts.left,true);assert.equal(after.contacts.left,false);
 const apex=evaluatePose(rig,clip,.46*(clip.frames-1));assert.ok(apex.rootHeight>.3);
 assert.equal(evaluatePose(rig,clip,clip.frames-1).contacts.left,true);
});
test('接地中のキーによる足の横滑りを検出し、子のキー軸が親の回転に追従する',()=>{
 const walk={...clone(clips[1]),keys:{thighL:[{frame:0,rotation:[0,0,0] as V3},{frame:4,rotation:[0,0,60] as V3}]}};
 assert.ok(evaluatePose(rig,walk,2).issues.some(e=>e.includes('接地')));
 const idle={...clone(clips[0]),keys:{upperArmL:[{frame:0,rotation:[40,0,0] as V3}]}};
 const original=evaluatePose(rig,idle,0),turned=evaluatePose(rig,{...idle,keys:{...idle.keys,root:[{frame:0,rotation:[0,0,90]}]}},0);
 const expected=qRotate(original.bones.handL.position,[0,0,Math.SQRT1_2,Math.SQRT1_2]);assert.ok(distance(expected,turned.bones.handL.position)<1e-5);
});
test('IKが到達不能でも長さを保ち、左右の膝は前方へ曲がる',()=>{
 const result=solveLeg([0,0,0],[0,0,0],.4,.2);assert.equal(result.unreachable,true);assert.ok(Math.abs(distance([0,0,0],result.knee)-.4)<1e-5);assert.ok(Math.abs(distance(result.knee,result.ankle)-.2)<1e-5);
 const pose=evaluatePose(rig,clips[2],4);assert.ok(pose.bones.shinL.position[1]<pose.bones.thighL.position[1]);assert.ok(pose.bones.shinR.position[1]<pose.bones.thighR.position[1]);
});
test('左手の剣が全コマで同じ関節に追従し、重み推定の合計が1になる',()=>{
 const triangle=mesh.triangles.find(t=>t.partId?.includes('sword'))!;assert.ok(triangle);const bind=rig.bones.find(b=>b.id==='handL')!.pivot;
 const radius=distance(triangle.vertices[0],bind);
 for(const clip of clips)for(let f=0;f<clip.frames;f++){const pose=evaluatePose(rig,clip,f);const moved=poseMesh(mesh,rig,pose).triangles.find(t=>t.partId===triangle.partId)!;assert.ok(Math.abs(distance(moved.vertices[0],pose.bones.handL.position)-radius)<1e-5);}
 const skinned=envelopeSkin(mesh,rig);for(const t of skinned.triangles)for(const w of t.weights!)assert.ok(Math.abs(w.reduce((n,p)=>n+p.weight,0)-1)<1e-6);
});
test('圧縮画素を正確に復元し、過大・不足・破損データを拒否する',()=>{
 const p=Array.from({length:4096},(_,i)=>i%65);assert.deepEqual(unpackPixels(packPixels(p)),p);assert.deepEqual(unpackPixels(packPixels(new Array(4096).fill(0))),new Array(4096).fill(0));
 assert.throws(()=>unpackPixels('r:AAE='));assert.throws(()=>unpackPixels('b:AAAA'));assert.throws(()=>unpackPixels('r:'+'A'.repeat(6000)));
});
function decode(bytes:Uint8Array){const b=Buffer.from(bytes);let i=8,w=0,h=0;const chunks:Buffer[]=[];while(i<b.length){const n=b.readUInt32BE(i),type=b.subarray(i+4,i+8).toString();if(type==='IHDR'){w=b.readUInt32BE(i+8);h=b.readUInt32BE(i+12);}if(type==='IDAT')chunks.push(b.subarray(i+8,i+8+n));i+=12+n;}const raw=inflateSync(Buffer.concat(chunks));return {w,h,row:(y:number)=>raw.subarray(y*(w*4+1)+1,(y+1)*(w*4+1))};}
test('全方向・全コマのPNGシートとJSONが一致し、保存形式を検証できる',async()=>{
 const baked=await bakeAnimations(mesh,config);const doc:AnimationDocument={...base,baked};assert.equal(animationSchema.safeParse(doc).success,true);assert.deepEqual(animationIssues(doc),[]);
 const files=exportAnimation(doc),meta=JSON.parse(new TextDecoder().decode(files['animation.json']));assert.equal(meta.formatVersion,2);assert.equal(meta.clips.length,4);
 for(const clip of clips){const b=baked.find(b=>b.id===clip.id)!;assert.deepEqual(b.issues,[],clip.id);for(const frame of b.frames)assert.deepEqual(validateFrames(frame.map(unpackFrame),config.style,'eight'),[]);const sheet=decode(files[`${clip.id}/spritesheet.png`]);assert.equal(sheet.w,clip.frames*64);assert.equal(sheet.h,512);for(let f=0;f<clip.frames;f++)for(let d=0;d<8;d++){const cell=meta.clips.find((c:any)=>c.id===clip.id).cells.find((c:any)=>c.frame===f&&c.direction===meta.directions[d]);assert.deepEqual(cell.rect,{x:f*64,y:d*64,width:64,height:64});const single=decode(files[cell.file]);assert.equal(single.w,64);assert.equal(single.h,64);for(let y=0;y<64;y++)assert.deepEqual(single.row(y),sheet.row(d*64+y).subarray(f*256,(f+1)*256));}}
 mkdirSync('/private/tmp/dotforge-animation-verification',{recursive:true});for(const c of clips)writeFileSync(`/private/tmp/dotforge-animation-verification/${c.id}.png`,files[`${c.id}/spritesheet.png`]);writeFileSync('/private/tmp/dotforge-animation-verification/document.json',JSON.stringify(doc));
 const bad={...doc,config:{...config,clips:[...clips,clips[0]]}};assert.ok(animationIssues(bad).some(e=>e.includes('重複')));
});
