import {z} from 'zod';
import {idSchema} from './contracts';
import {buildMesh,renderSet,validateFrames,type Model,type Style} from './pixel';

export const PROP_VERSION='static-prop-v1';
const vector=z.tuple([z.number().finite().min(-5).max(5),z.number().finite().min(-5).max(5),z.number().finite().min(-5).max(5)]);
export const propModelSchema=z.object({
 id:idSchema,name:z.string().min(1).max(100),prompt:z.string().max(2000),features:z.array(z.string().min(1).max(250)).min(1).max(20),
 parts:z.array(z.object({id:idSchema,shape:z.enum(['box','ellipsoid','cylinder','cone']),position:vector,size:z.tuple([z.number().finite().min(.005).max(3),z.number().finite().min(.005).max(3),z.number().finite().min(.005).max(3)]),color:z.string().regex(/^#[0-9a-fA-F]{6}$/),rotation:vector.optional()}).strict()).min(1).max(100),
}).strict();
export type PropModel=z.infer<typeof propModelSchema>;
export function parseProp(value:unknown):PropModel{
 const model=propModelSchema.parse(value);
 if(new Set(model.parts.map(p=>p.id)).size!==model.parts.length)throw Error('パーツIDが重複しています');
 return model;
}
export function propModelIssues(model:Model,style:Style){
 const mesh=buildMesh(model),issues=validateFrames(renderSet(mesh,style,'eight'),style,'eight');
 if(mesh.triangles.some(t=>t.vertices.some(v=>v[2]<-.015)))issues.push('物体が地面へ貫通しています');
 return issues;
}
