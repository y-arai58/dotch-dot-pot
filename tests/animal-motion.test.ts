import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {animalRig,animalClips,animalPose,animalEvents,pawTrajectory,ANIMAL_BONES,ANIMAL_PARENTS,PAWS,WALK_DUTY,animalPoseMesh,type AnimalModel} from '../lib/animal-animation';
import {buildMesh} from '../lib/pixel';
const models=JSON.parse(readFileSync(new URL('../lib/animal-samples.json',import.meta.url),'utf8')) as AnimalModel[];
const distance=(a:number[],b:number[])=>Math.hypot(...a.map((v,i)=>v-b[i]));
test('contact order and support count',()=>{
 for(const model of models){const rig=animalRig(model),walk=animalClips(model.motionCorrections).find(c=>c.id==='walk')!;
 assert.deepEqual(animalEvents(rig,walk).filter(e=>e.name.endsWith('_contact')),PAWS.map((p,i)=>({frame:i*4,name:p+'_contact'})));
 const counts=Object.fromEntries(PAWS.map(p=>[p,0]));
 for(let f=0;f<16;f++){const pose=animalPose(rig,walk,f);assert.equal(Object.values(pose.contacts).filter(Boolean).length,3);for(const p of PAWS)counts[p]+=Number(pose.contacts[p]);}
 for(const p of PAWS)assert.equal(counts[p],12);
 }
});
test('bone lengths, contact targets, and default geometry are stable',()=>{
 for(const model of models){const rig=animalRig(model),mesh=buildMesh(model),bind=Object.fromEntries(rig.bones.map(b=>[b.id,b.pivot]));
 for(const clip of animalClips(model.motionCorrections))for(let f=0;f<=clip.frames-1;f+=.25){
 const pose=animalPose(rig,clip,f);assert.deepEqual(pose.issues,[],model.id+'/'+clip.id+'/'+f);
 for(const id of ANIMAL_BONES){const parent=ANIMAL_PARENTS[id];if(parent&&id!=='body')assert.ok(Math.abs(distance(pose.bones[id].position,pose.bones[parent].position)-distance(bind[id],bind[parent]))<1e-6,model.id+'/'+id);}
 for(const paw of PAWS)if(pose.contacts[paw])assert.ok(Math.abs(pose.bones[paw].position[2]-bind[paw][2])<1e-6,paw);
 const posed=animalPoseMesh(mesh,rig,pose);
 for(const t of posed.triangles)for(const v of t.vertices)assert.ok(v[2]>=-.015,model.id+'/'+clip.id+'/'+f+'/'+t.partId+': z='+v[2]);
 }
 }
});
test('external movement cancels stance-foot motion',()=>{
 for(const model of models){const rig=animalRig(model),walk=animalClips(model.motionCorrections).find(c=>c.id==='walk')!,speed=walk.stride/(WALK_DUTY*(walk.frames/walk.fps));const previous:Record<string,number[]|undefined>={};
 for(let f=0;f<=32;f+=.25){const pose=animalPose(rig,walk,f);
 for(const paw of PAWS){if(!pose.contacts[paw]){previous[paw]=undefined;continue;}const p=[...pose.bones[paw].position];p[1]-=speed*f/walk.fps;if(previous[paw])assert.ok(distance(p,previous[paw]!)<1e-6,paw+' '+f);previous[paw]=p;}}
 }
});
test('idle/walk loop and jump phase transitions are continuous',()=>{
 for(const model of models){const rig=animalRig(model);
 for(const clip of animalClips(model.motionCorrections)){if(clip.loop)assert.deepEqual(animalPose(rig,clip,0),animalPose(rig,clip,clip.frames));
 if(clip.id==='jump'){for(const phase of [.2,.75]){const a=animalPose(rig,clip,(phase-1e-7)*(clip.frames-1)),b=animalPose(rig,clip,(phase+1e-7)*(clip.frames-1));for(const id of ANIMAL_BONES)assert.ok(distance(a.bones[id].position,b.bones[id].position)<1e-5,id+' '+phase);}assert.equal(Object.values(animalPose(rig,clip,.475*(clip.frames-1)).contacts).filter(Boolean).length,0);}}
 }
});
test('Hermite swing tangents match stance at takeoff and touchdown',()=>{
 const clip=animalClips().find(c=>c.id==='walk')!,e=1e-7,speed=clip.stride/WALK_DUTY;
 for(const phase of [0,.75]){const at=(p:number)=>pawTrajectory(clip,'hindPawL',((p%1)+1)%1);const a=at(phase-e),b=at(phase),c=at(phase+e);assert.ok(Math.abs((b.y-a.y)/e-speed)<1e-4);assert.ok(Math.abs((c.y-b.y)/e-speed)<1e-4);}
});
test('REGRESSION: four-frame walk reports undersampling or retains a lifted sample for every paw',()=>{
 const model=models[0],rig=animalRig(model),clip=animalClips(model.motionCorrections).find(c=>c.id==='walk')!;clip.frames=4;
 const poses=Array.from({length:4},(_,f)=>animalPose(rig,clip,f)),bind=Object.fromEntries(rig.bones.map(b=>[b.id,b.pivot]));
 if(poses.some(p=>p.issues.length))return;
 for(const paw of PAWS)assert.ok(poses.some(p=>!p.contacts[paw]&&p.bones[paw].position[2]>bind[paw][2]+.001),paw+' never leaves the ground');
});
test('REGRESSION: zero-height jump retains contacts or reports invalid motion',()=>{
 const model=models[0],rig=animalRig(model),clip=animalClips(model.motionCorrections).find(c=>c.id==='jump')!;clip.height=0;const pose=animalPose(rig,clip,.475*(clip.frames-1));
 assert.ok(pose.issues.length||Object.values(pose.contacts).every(Boolean),'all paws are marked airborne at zero root height');
});

