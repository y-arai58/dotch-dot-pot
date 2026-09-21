import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {buildMesh,renderSet,renderFrame,DEFAULT_STYLE,clone,RENDERER_VERSION,type Revision,type SurfaceHit} from '../lib/pixel';
import {applySharedEdits,captureSurfacePaint,emptySharedEdits,previewSharedRevision} from '../lib/shared-edits';
import {parseAnimal} from '../lib/animal-contracts';
import {animalRig,animalClips,bakeAnimal,ANIMAL_MOTION_VERSION,type AnimalDocument} from '../lib/animal-animation';
import {inheritAnimation} from '../lib/animation-inheritance';
import {exportRevision} from '../lib/export';
import {animationZip} from '../lib/animation-export';
import samples from '../lib/animal-samples.json';
import {sampleModel,humanoidSample,articulatedReplacement} from '../lib/sample-models';
import {rigFromModel,defaultClips,MOTION_VERSION,type AnimationDocument} from '../lib/animation';

const origin=process.env.TEST_ORIGIN||'http://localhost:5173';
assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(origin).hostname),'保存の検証はローカル環境だけで実行します');
const login=await fetch(origin+'/signin-with-chatgpt?return_to=/',{redirect:'manual'}),cookie=login.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');assert.ok(cookie);
async function call(path:string,data?:unknown,auth=cookie){const r=await fetch(origin+path,{method:data?'POST':'GET',headers:{...(auth?{cookie:auth}:{}),...(data?{'Content-Type':'application/json',Origin:origin}:{})},body:data?JSON.stringify(data):undefined});return {status:r.status,data:await r.json() as any};}
const projectId=crypto.randomUUID(),assetId=crypto.randomUUID(),originalId=crypto.randomUUID(),editedId=crypto.randomUUID(),animationId=crypto.randomUUID(),nextAnimationId=crypto.randomUUID();
writeFileSync('/private/tmp/dotforge-shared-test-records.json',JSON.stringify({projectId,assetId,animations:[animationId,nextAnimationId]}));
const style={...clone(DEFAULT_STYLE),id:crypto.randomUUID()},model=parseAnimal(samples[0]),base=buildMesh(model),frames=renderSet(base,style);
assert.equal((await call('/api/studio',{action:'project',project:{id:projectId,name:'共通修正の保存検証',styles:[style],version:0,updatedAt:''}})).status,200);
const original:Revision={id:originalId,rendererVersion:RENDERER_VERSION,createdAt:new Date().toISOString(),style,frames,baseFrames:clone(frames),approved:true,reviewed:true,issues:'',mode:'eight',source:'sample',rigKind:'quadruped',modelId:model.id,name:model.name,prompt:model.prompt,features:model.features,facing:0,size:1};
const initial=await call('/api/studio',{action:'asset',asset:{id:assetId,projectId,name:'共通修正の検証',revisions:[original],version:0,updatedAt:''}});assert.equal(initial.status,200,JSON.stringify(initial.data));
// Preserve the user's customised motion, including joint keys and pacing.
const clips=animalClips();clips[1].fps=10;clips[1].keys.head=[{frame:0,rotation:[0,0,3]}];
const oldMotion:AnimalDocument={id:animationId,assetId,sourceRevisionId:originalId,name:'調整した歩行',config:{version:ANIMAL_MOTION_VERSION,rig:animalRig(model),clips,scale:1,facing:0,style,mode:'eight'},baked:[],version:0,updatedAt:'',reviewed:false};
const savedMotion=await call('/api/animations',oldMotion);assert.equal(savedMotion.status,200,JSON.stringify(savedMotion.data));
const drawn=clone(original),hits:(SurfaceHit|undefined)[]=[];renderFrame(base,style,'S',1,0,hits);
const headPart=model.parts.find(p=>p.bone==='head')!.id;
const points=hits.flatMap((h,i)=>h&&base.triangles[h.triangle].partId===headPart?[i]:[]).slice(0,5);assert.ok(points.length);for(const at of points)drawn.frames[0].body[at]=20;
const captured=captureSurfacePaint(base,drawn,'S'),edits={...emptySharedEdits(base),paints:captured.paints},preview=previewSharedRevision(base,drawn,'S',edits,captured.transferred);
const edited:Revision={...clone(drawn),id:editedId,parentRevisionId:originalId,sharedEdits:edits,approved:false,reviewed:false,frames:preview.frames,baseFrames:preview.baseFrames};
const saved=await call('/api/studio',{action:'asset',asset:{...initial.data,revisions:[original,edited]}});assert.equal(saved.status,200,JSON.stringify(saved.data));
const loaded=await call('/api/studio?assetId='+assetId);assert.equal(loaded.status,200);const restored=loaded.data.revisions[1] as Revision;
assert.deepEqual(loaded.data.revisions[0],original,'採用済みの元版を維持');assert.deepEqual(restored.sharedEdits,edits);
const restoredMesh=applySharedEdits(buildMesh(model),restored.sharedEdits);assert.deepEqual(renderSet(restoredMesh,style),preview.baseFrames,'新規読込でも全方向が一致');
for(const at of points)assert.equal(restored.frames[0].body[at],20);
assert.ok(exportRevision(restored)['shared-edits.json']);assert.equal((await call('/api/studio?assetId='+assetId,undefined,'')).status,401);
// Inherit settings into the new revision, then bake using the restored shared geometry.
const previous=(await call('/api/animations?id='+animationId)).data as AnimalDocument;
const next=inheritAnimation(previous,{...oldMotion,id:nextAnimationId,sourceRevisionId:editedId});assert.deepEqual(next.config.clips,clips);assert.equal(next.reviewed,false);assert.equal(next.baked.length,0);
next.baked=await bakeAnimal(restoredMesh,next.config);assert.equal(next.baked.length,4);assert.ok(next.baked.every(b=>!b.issues.length));
const storedAnimation=await call('/api/animations',next);assert.equal(storedAnimation.status,200,JSON.stringify(storedAnimation.data));
const reloadedAnimation=(await call('/api/animations?id='+nextAnimationId)).data as AnimalDocument;assert.deepEqual(reloadedAnimation.baked,next.baked);assert.deepEqual(reloadedAnimation.config.clips,clips);assert.ok(animationZip(reloadedAnimation).length>1000);
const invalid=clone(loaded.data);invalid.revisions[1].sharedEdits.parts[headPart]={scale:[0,1,1],offset:[0,0,0]};assert.equal((await call('/api/studio',{action:'asset',asset:invalid})).status,400);
const wrongParent=clone(loaded.data);wrongParent.revisions[1].parentRevisionId='missing';assert.equal((await call('/api/studio',{action:'asset',asset:wrongParent})).status,400);
const changeAdopted=clone(loaded.data);changeAdopted.revisions[0].sharedEdits=edits;assert.equal((await call('/api/studio',{action:'asset',asset:changeAdopted})).status,400);
// Old humanoid assets keep their pixels and saved motion while creating an articulated candidate.
const legacyModel=sampleModel('forest-scout')!,replacement=articulatedReplacement(legacyModel.id)!,humanAssetId=crypto.randomUUID();
const legacyFrames=renderSet(buildMesh(legacyModel),style),legacy:Revision={...clone(original),id:crypto.randomUUID(),rigKind:'humanoid',modelId:legacyModel.id,frames:legacyFrames,baseFrames:clone(legacyFrames)};
const oldHuman=await call('/api/studio',{action:'asset',asset:{...initial.data,id:humanAssetId,version:0,revisions:[legacy]}});assert.equal(oldHuman.status,200,JSON.stringify(oldHuman.data));
const humanMotion:AnimationDocument={id:crypto.randomUUID(),assetId:humanAssetId,sourceRevisionId:legacy.id,name:'元サンプルの動作',config:{version:MOTION_VERSION,rig:rigFromModel(humanoidSample(legacyModel.id)!),clips:defaultClips(),scale:1,facing:0,style,mode:'eight'},baked:[],version:0,updatedAt:'',reviewed:false};
humanMotion.config.clips[1].fps=11;assert.equal((await call('/api/animations',humanMotion)).status,200);
const upgradedFrames=renderSet(buildMesh(replacement),style),upgraded:Revision={...clone(legacy),id:crypto.randomUUID(),modelId:replacement.id,parentRevisionId:legacy.id,frames:upgradedFrames,baseFrames:clone(upgradedFrames),approved:false,reviewed:false};
const upgradedSave=await call('/api/studio',{action:'asset',asset:{...oldHuman.data,revisions:[legacy,upgraded]}});assert.equal(upgradedSave.status,200,JSON.stringify(upgradedSave.data));
assert.deepEqual(upgradedSave.data.revisions[0],legacy);
const inheritedHuman=inheritAnimation((await call('/api/animations?id='+humanMotion.id)).data as AnimationDocument,{...humanMotion,id:crypto.randomUUID(),sourceRevisionId:upgraded.id});assert.equal(inheritedHuman.config.clips[1].fps,11);assert.equal((await call('/api/animations',inheritedHuman)).status,200);
writeFileSync('/private/tmp/dotforge-shared-test-records.json',JSON.stringify({projectId,assets:[assetId,humanAssetId],animations:[animationId,nextAnimationId,humanMotion.id,inheritedHuman.id]}));
console.log('Shared edit HTTP integration passed: authenticated storage, restored eight-direction pixels, original revision protection, inherited motion settings, 376-frame bake, animation reload and export, legacy humanoid migration and saved motion inheritance.');
