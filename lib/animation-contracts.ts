import {z} from 'zod';
import {idSchema,styleSchema} from './contracts';
import {BONE_IDS,MOTION_VERSION,rigIssues,unpackFrame,evaluatePose,type AnimationDocument} from './animation';
import {validateFrames} from './pixel';
const vector=z.tuple([z.number().min(-5).max(5),z.number().min(-5).max(5),z.number().min(-5).max(5)]);
const angles=z.tuple([z.number().min(-90).max(90),z.number().min(-90).max(90),z.number().min(-90).max(90)]);
const boneId=z.enum(BONE_IDS);
const motionId=z.enum(['idle','walk','crouch','jump']);
const clip=z.object({id:motionId,name:z.string().min(1).max(40),frames:z.number().int().min(4).max(24),fps:z.number().int().min(4).max(24),loop:z.boolean(),stride:z.number().min(0).max(.8),lift:z.number().min(0).max(.4),depth:z.number().min(0).max(.5),height:z.number().min(0).max(.8),armSwing:z.number().min(0).max(70),hold:z.number().min(.1).max(.7),keys:z.record(boneId,z.array(z.object({frame:z.number().int().min(0).max(23),rotation:angles})).max(24))});
const packed=z.object({direction:z.enum(['S','SE','E','NE','N','NW','W','SW']),body:z.string().max(6000),shadow:z.string().max(6000),clipped:z.boolean()});
export const animationSchema=z.object({id:idSchema,assetId:idSchema,sourceRevisionId:idSchema,name:z.string().min(1).max(100),config:z.object({version:z.literal(MOTION_VERSION),rig:z.object({bones:z.array(z.object({id:boneId,parent:boneId.optional(),pivot:vector})).length(16),bindings:z.record(z.string().max(200),boneId),reviewed:z.boolean(),origin:z.enum(['sample','embedded','manual']),skinning:z.enum(['envelope','embedded','rigid']).optional()}),clips:z.array(clip).min(1).max(4),scale:z.number().min(.1).max(2),facing:z.number().min(0).max(315).multipleOf(45),style:styleSchema,mode:z.enum(['front','eight'])}),baked:z.array(z.object({id:motionId,frames:z.array(z.array(packed).min(1).max(8)).min(4).max(24),issues:z.array(z.string().max(300)).max(1000),events:z.array(z.object({frame:z.number().int().min(0).max(23),name:z.string().max(50)})).max(100)})).max(4),version:z.number().int().min(0),updatedAt:z.string(),reviewed:z.boolean()});
export function animationIssues(doc:AnimationDocument){
 const errors=rigIssues(doc.config.rig);
 const clips=doc.config.clips;
 if(new Set(clips.map(c=>c.id)).size!==clips.length)errors.push('動作IDが重複しています');
 if(clips.reduce((n,c)=>n+c.frames,0)>64)errors.push('合計64フレーム以下にしてください');
 for(const c of clips){if((c.id==='walk'||c.id==='idle')!==c.loop)errors.push('歩行・待機だけをループにしてください');for(const keys of Object.values(c.keys)){if(keys){if(new Set(keys.map(k=>k.frame)).size!==keys.length||keys.some(k=>k.frame>=c.frames))errors.push('関節キーの時刻を確認してください');}}}
 if(new Set(doc.baked.map(b=>b.id)).size!==doc.baked.length)errors.push('描画結果が重複しています');
 for(const b of doc.baked){const c=clips.find(c=>c.id===b.id);if(!c||c.frames!==b.frames.length){errors.push('動作と描画枚数が一致しません');continue;}for(let i=0;i<b.frames.length;i++){
  try{const frames=b.frames[i].map(unpackFrame);errors.push(...validateFrames(frames,doc.config.style,doc.config.mode).map(e=>`${c.name} ${i+1}コマ: ${e}`));}catch{errors.push('描画データが破損しています');}
  if(!rigIssues(doc.config.rig).length)errors.push(...evaluatePose(doc.config.rig,c,i).issues.map(e=>`${c.name} ${i+1}コマ: ${e}`));
 }}
 if(doc.reviewed&&(!doc.config.rig.reviewed||doc.baked.length!==clips.length))errors.push('関節確認と全動作の生成が必要です');
 return [...new Set(errors)];
}
