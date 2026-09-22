import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import samples from '../lib/animal-samples.json';
import humans from '../lib/animation-samples.json';
import {DEFAULT_STYLE,buildMesh,clone} from '../lib/pixel';
import {generationRequestSchema,parseHumanoid,CREATION_SKILLS} from '../lib/generation';
import {parseAnimal,animalAnimationIssues,animalAnimationSchema} from '../lib/animal-contracts';
import {ANIMAL_MOTION_VERSION,animalRig,animalClips,bakeAnimal,type AnimalConfig,type AnimalDocument} from '../lib/animal-animation';
import {inspectAnimal} from '../scripts/animal-quality';
import {exportAnimation} from '../lib/animation-export';
test('動物と人型は別のモデル契約を使い、登録済みskillだけを選択できる',()=>{
 assert.deepEqual(CREATION_SKILLS.map(s=>[s.id,s.validationFrames]),[['humanoid',344],['animal',376],['prop',8]]);
 assert.throws(()=>parseAnimal(humans[0]));assert.throws(()=>parseHumanoid(samples[0]));
 const model=clone(samples[0]);model.parts.push(model.parts[0]);assert.throws(()=>parseAnimal(model),/重複/);
 const request={id:'animal-test',projectId:'project-test',skillId:'animal',name:'キツネ',prompt:'青い首輪',features:[],mode:'eight',style:DEFAULT_STYLE,referenceKeys:[],referenceSides:[]};
 assert.ok(generationRequestSchema.safeParse(request).success);assert.equal(generationRequestSchema.safeParse({...request,skillId:'bird'}).success,false);
});
test('犬・キツネの両基準は376枚の画素・接地・地面検査を通り、検証シートはネイティブ64pxセル',async()=>{
 assert.equal(samples.length,2);
 for(const sample of samples){const out=await mkdtemp(join(tmpdir(),'dotforge-animal-quality-'));const inspected=await inspectAnimal(sample,DEFAULT_STYLE,out);assert.equal(inspected.validation.frames,376);assert.deepEqual(inspected.validation.issues,[]);const sheet=await readFile(join(out,'walk.png'));assert.equal(sheet.readUInt32BE(16),512);assert.equal(sheet.readUInt32BE(20),1024);}
 const controller=new AbortController();controller.abort();await assert.rejects(()=>inspectAnimal(samples[0],DEFAULT_STYLE,join(tmpdir(),'dotforge-animal-abort'),controller.signal),/停止/);
});
test('四足の保存とPNG出力は19関節・接地イベント・速度・時間方向レイアウトを保持',async()=>{
 const model=parseAnimal(samples[0]),config:AnimalConfig={version:ANIMAL_MOTION_VERSION,rig:animalRig(model),clips:animalClips(model.motionCorrections),scale:1,facing:0,style:DEFAULT_STYLE,mode:'eight' as const};
 const doc:AnimalDocument={id:'animal-motion',assetId:'asset-test',sourceRevisionId:'revision-test',name:'四足の動作',config,baked:await bakeAnimal(buildMesh(model),config),version:0,updatedAt:'',reviewed:true};
 assert.deepEqual(animalAnimationIssues(animalAnimationSchema.parse(doc) as AnimalDocument),[]);
 const files=exportAnimation(doc),meta=JSON.parse(new TextDecoder().decode(files['animation.json']));
 assert.equal(meta.motionVersion,ANIMAL_MOTION_VERSION);assert.equal(meta.rig.bones.length,19);
 const walk=meta.clips.find((c:any)=>c.id==='walk');assert.equal(walk.frameCount,16);assert.ok(Math.abs(walk.recommendedSpeed-.24)<1e-12);assert.equal(walk.sheetSize.width,1024);assert.equal(walk.sheetSize.height,512);assert.ok(walk.events.some((e:any)=>e.name==='frontPawL_contact'));
 const raw=Buffer.from(files['walk/spritesheet.png']);assert.equal(raw.readUInt32BE(16),1024);assert.equal(raw.readUInt32BE(20),512);
 const undersampled=clone(doc);undersampled.config.clips.find(c=>c.id==='walk')!.frames=4;assert.equal(animalAnimationSchema.safeParse(undersampled).success,false);
 const corrupt=clone(doc);corrupt.baked[0].frames[0][0].body='b:AAAA';assert.ok(animalAnimationIssues(corrupt).length);
 const wrongKey=clone(doc);wrongKey.config.clips[0].keys.frontPawL=[{frame:0,rotation:[90,0,0]}];assert.ok(animalAnimationIssues(wrongKey).some(s=>s.includes('接地')));
});
