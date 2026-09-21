import {z} from 'zod';
import {idSchema,styleSchema} from './contracts';
import {ANIMAL_BONES,ANIMAL_MOTION_VERSION,animalRig,animalRigIssues,animalPose,type AnimalModel,type AnimalDocument} from './animal-animation';
import {buildMesh,validateFrames} from './pixel';
import {unpackFrame} from './animation';
import {TAIL_DIRECTIONS,TAIL_PATTERNS,tailUndersampled} from './animal-tail';
const vector=z.tuple([z.number().finite().min(-5).max(5),z.number().finite().min(-5).max(5),z.number().finite().min(-5).max(5)]);
const angles=z.tuple([z.number().min(-90).max(90),z.number().min(-90).max(90),z.number().min(-90).max(90)]);
const boneId=z.enum(ANIMAL_BONES),motionId=z.enum(['idle','walk','crouch','jump']);
const bones=z.array(z.object({id:boneId,parent:z.preprocess(v=>v===null?undefined:v,boneId.optional()),pivot:vector}).strict()).length(19);
export const animalModelSchema=z.object({id:idSchema,name:z.string().min(1).max(100),prompt:z.string().max(2000),features:z.array(z.string().max(250)).min(1).max(20),parts:z.array(z.object({id:idSchema,shape:z.enum(['box','ellipsoid','cylinder','cone']),position:vector,size:z.tuple([z.number().min(.005).max(3),z.number().min(.005).max(3),z.number().min(.005).max(3)]),color:z.string().regex(/^#[0-9a-fA-F]{6}$/),rotation:vector.optional(),bone:boneId}).strict()).min(19).max(100),rig:z.object({bones}).strict(),motionCorrections:z.record(boneId,angles).optional()}).strict();
export function parseAnimal(value:unknown):AnimalModel{
 const model=animalModelSchema.parse(value),issues=animalRigIssues(animalRig(model),buildMesh(model));
 if(new Set(model.parts.map(p=>p.id)).size!==model.parts.length)issues.push('部品IDが重複しています');
 for(const bone of ANIMAL_BONES.filter(id=>id!=='root'))if(!model.parts.some(p=>p.bone===bone))issues.push(`${bone}の部品がありません`);
 if(issues.length)throw Error(issues.join('\n'));return model;
}
export const tailSettingsSchema=z.object({direction:z.enum(TAIL_DIRECTIONS),pattern:z.enum(TAIL_PATTERNS),amplitude:z.number().finite().min(0).max(35),cycles:z.number().int().min(1).max(3)}).strict();
const clip=z.object({id:motionId,name:z.string().min(1).max(40),frames:z.number().int().min(4).max(24),fps:z.number().int().min(4).max(24),loop:z.boolean(),stride:z.number().min(0).max(.6),lift:z.number().min(0).max(.3),depth:z.number().min(0).max(.4),height:z.number().min(0).max(.6),tailSwing:z.number().min(0).max(35),tail:tailSettingsSchema.optional(),hold:z.number().min(.1).max(.7),keys:z.record(boneId,z.array(z.object({frame:z.number().int().min(0).max(23),rotation:angles})).max(24))}).refine(c=>c.id!=='walk'||c.frames>=8,{message:'四足歩行は8コマ以上にしてください'}).refine(c=>!c.tail||!tailUndersampled(c.tail,c.frames),{message:'尻尾の1周期につき4コマ以上必要です'});
const packed=z.object({direction:z.enum(['S','SE','E','NE','N','NW','W','SW']),body:z.string().max(6000),shadow:z.string().max(6000),clipped:z.boolean()});
export const animalAnimationSchema=z.object({id:idSchema,assetId:idSchema,sourceRevisionId:idSchema,name:z.string().min(1).max(100),config:z.object({version:z.literal(ANIMAL_MOTION_VERSION),rig:z.object({bones,bindings:z.record(z.string().max(200),boneId),reviewed:z.boolean(),origin:z.enum(['sample','skill'])}),clips:z.array(clip).min(1).max(4),scale:z.number().min(.1).max(2),facing:z.number().min(0).max(315).multipleOf(45),style:styleSchema,mode:z.enum(['front','eight'])}),baked:z.array(z.object({id:motionId,frames:z.array(z.array(packed).min(1).max(8)).min(4).max(24),issues:z.array(z.string().max(300)).max(1000),events:z.array(z.object({frame:z.number().int().min(0).max(23),name:z.string().max(50)})).max(200)})).max(4),version:z.number().int().min(0),updatedAt:z.string(),reviewed:z.boolean()});
export function animalAnimationIssues(doc:AnimalDocument){
 const issues=animalRigIssues(doc.config.rig),clips=doc.config.clips;
 if(new Set(clips.map(c=>c.id)).size!==clips.length||clips.reduce((n,c)=>n+c.frames,0)>64)issues.push('動作IDの重複または64コマ上限を確認してください');
 for(const clip of clips){if(clip.loop!==(clip.id==='walk'||clip.id==='idle'))issues.push('歩行・待機のみループにしてください');for(const keys of Object.values(clip.keys))if(keys&&(new Set(keys.map(k=>k.frame)).size!==keys.length||keys.some(k=>k.frame>=clip.frames)))issues.push('関節キーの時刻を確認してください');}
 if(new Set(doc.baked.map(b=>b.id)).size!==doc.baked.length)issues.push('描画結果が重複しています');
 for(const baked of doc.baked){const clip=clips.find(c=>c.id===baked.id);if(!clip||clip.frames!==baked.frames.length){issues.push('動作と描画枚数が一致しません');continue;}for(let f=0;f<baked.frames.length;f++){try{issues.push(...validateFrames(baked.frames[f].map(unpackFrame),doc.config.style,doc.config.mode));if(!animalRigIssues(doc.config.rig).length)issues.push(...animalPose(doc.config.rig,clip,f).issues);}catch{issues.push('描画データまたは関節が破損しています');}}}
 if(doc.reviewed&&(!doc.config.rig.reviewed||doc.baked.length!==clips.length))issues.push('関節確認と全動作の生成が必要です');return [...new Set(issues)];
}
