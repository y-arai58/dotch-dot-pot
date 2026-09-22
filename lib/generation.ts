import {z} from 'zod';
import {idSchema,styleSchema} from './contracts';
import {BONE_IDS,MOTION_VERSION,rigFromModel,rigIssues,defaultClips,renderMotionFrame,type MotionConfig,type RiggedModel} from './animation';
import {buildMesh,renderSet,validateFrames,type Style,type Model} from './pixel';
import {parseAnimal} from './animal-contracts';
import {ANIMAL_MOTION_VERSION,animalRig,animalClips,renderAnimalFrame,type AnimalConfig,type AnimalModel} from './animal-animation';

import {parseProp,PROP_VERSION,type PropModel} from './prop-contracts';

// Add future species as separate contracts and skills, never as a humanoid prompt switch.
export const CREATION_SKILLS=[{id:'humanoid',name:'人型キャラクター',skillName:'dotforge-humanoid',version:'1.0.0',artifactKind:'rigged-humanoid-v1',validationFrames:344},{id:'animal',name:'四足動物',skillName:'dotforge-animal',version:'1.0.0',artifactKind:'rigged-quadruped-v1',validationFrames:376},{id:'prop',name:'物体・家具・小物',skillName:'dotforge-prop',version:'1.0.0',artifactKind:PROP_VERSION,validationFrames:8}] as const;
export const generationRequestSchema=z.object({id:idSchema,projectId:idSchema,skillId:z.enum(['humanoid','animal','prop']),name:z.string().min(1).max(100),prompt:z.string().min(1).max(2000),features:z.array(z.string().min(1).max(150)).max(10),mode:z.enum(['front','eight']),style:styleSchema,referenceKeys:z.array(idSchema).max(3),referenceSides:z.array(z.enum(['front','left','back','right'])).max(3)}).strict();
export type GenerationRequest=Omit<z.infer<typeof generationRequestSchema>,'style'>&{style:Style};
const vector=z.tuple([z.number().finite().min(-5).max(5),z.number().finite().min(-5).max(5),z.number().finite().min(-5).max(5)]);
const rotation=z.tuple([z.number().min(-90).max(90),z.number().min(-90).max(90),z.number().min(-90).max(90)]);
export const humanoidModelSchema=z.object({
 id:idSchema,name:z.string().min(1).max(100),prompt:z.string().max(2000),features:z.array(z.string().max(250)).min(1).max(20),
 parts:z.array(z.object({id:idSchema,shape:z.enum(['box','ellipsoid','cylinder','cone']),position:vector,size:z.tuple([z.number().min(.005).max(3),z.number().min(.005).max(3),z.number().min(.005).max(3)]),color:z.string().regex(/^#[0-9a-fA-F]{6}$/),rotation:vector.optional(),bone:z.enum(BONE_IDS)}).strict()).min(16).max(100),
 rig:z.object({bones:z.array(z.object({id:z.enum(BONE_IDS),parent:z.preprocess(v=>v===null?undefined:v,z.enum(BONE_IDS).optional()),pivot:vector}).strict()).length(16)}).strict(),
 motionCorrections:z.record(z.enum(BONE_IDS),rotation).optional(),
}).strict();
export function parseHumanoid(value:unknown):RiggedModel{
 const model=humanoidModelSchema.parse(value);
 if(new Set(model.parts.map(p=>p.id)).size!==model.parts.length)throw Error('パーツIDが重複しています');
 const rig=rigFromModel(model),issues=rigIssues(rig,buildMesh(model));
 const root=rig.bones.find(b=>b.id==='root')!;
 if(root.pivot.some(v=>v!==0))issues.push('rootは原点に置いてください');
 for(const bone of BONE_IDS.filter(id=>id!=='root'))if(!model.parts.some(p=>p.bone===bone))issues.push(`${bone}の部品がありません`);
 if(issues.length)throw Error(issues.join('\n'));
 return model;
}
export function staticModelIssues(model:Model,style:Style){return validateFrames(renderSet(buildMesh(model),style,'eight'),style,'eight');}
/** Recompute every motion from the submitted geometry; never trust a browser-supplied report. */
export async function motionModelIssues(model:RiggedModel,style:Style){
 const mesh=buildMesh(model),config:MotionConfig={version:MOTION_VERSION,rig:rigFromModel(model,'skill'),clips:defaultClips(model.motionCorrections),scale:1,facing:0,style,mode:'eight'};
 for(const clip of config.clips)for(let frame=0;frame<clip.frames;frame++){
  const result=renderMotionFrame(mesh,config,clip,frame),issues=[...result.pose.issues,...validateFrames(result.frames,style,'eight')];
  if(issues.length)return issues.map(issue=>`${clip.id} ${frame+1}: ${issue}`);
  await new Promise<void>(resolve=>setTimeout(resolve,0));
 }
 return [];
}
export type GenerationActivity={phase:'model'|'render'|'review';attempt:number;lastActivityAt:string};
export type GenerationJob={id:string;state:string;progress:number;activity?:GenerationActivity;modelFile?:string;error?:string;createdAt:string;dismissedAt?:string|null;request:GenerationRequest};
export type HumanoidArtifact={kind:'rigged-humanoid-v1';skillVersion:string;model:RiggedModel;validation:{renderer:string;motion:string;frames:number;issues:string[]};visualReview:string};

export type AnimalArtifact={kind:'rigged-quadruped-v1';skillVersion:string;model:AnimalModel;validation:HumanoidArtifact['validation'];visualReview:string};
export type PropArtifact={kind:typeof PROP_VERSION;skillVersion:string;model:PropModel;validation:HumanoidArtifact['validation'];visualReview:string};
export type CreationArtifact=HumanoidArtifact|AnimalArtifact|PropArtifact;
export function parseCreationModel(artifact:Pick<CreationArtifact,'kind'|'model'>){if(artifact.kind==='rigged-humanoid-v1')return parseHumanoid(artifact.model);if(artifact.kind==='rigged-quadruped-v1')return parseAnimal(artifact.model);if(artifact.kind===PROP_VERSION)return parseProp(artifact.model);throw Error('未対応のモデル形式です');}
export async function animalMotionModelIssues(model:AnimalModel,style:Style){const mesh=buildMesh(model),config:AnimalConfig={version:ANIMAL_MOTION_VERSION,rig:animalRig(model),clips:animalClips(model.motionCorrections),scale:1,facing:0,style,mode:'eight'};for(const clip of config.clips)for(let frame=0;frame<clip.frames;frame++){const result=renderAnimalFrame(mesh,config,clip,frame),issues=[...result.pose.issues,...validateFrames(result.frames,style,'eight')];if(issues.length)return issues.map(issue=>`${clip.id} ${frame+1}: ${issue}`);await new Promise<void>(resolve=>setTimeout(resolve,0));}return [];}
