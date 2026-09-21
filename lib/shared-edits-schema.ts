import {z} from 'zod';
import {MAX_SURFACE_PAINTS} from './shared-edit-types';
const vector=(min:number,max:number)=>z.tuple([z.number().finite().min(min).max(max),z.number().finite().min(min).max(max),z.number().finite().min(min).max(max)]);
const uv=z.tuple([z.number().finite().min(-.00001).max(1.00001),z.number().finite().min(-.00001).max(1.00001)]).refine(v=>v[0]+v[1]<=1.00001);
const polygon=z.array(uv).min(3).max(8).refine(points=>{
 const area=points.reduce((n,a,i)=>{const b=points[(i+1)%points.length];return n+a[0]*b[1]-a[1]*b[0];},0);if(Math.abs(area)<1e-9)return false;
 return points.every((a,i)=>{const b=points[(i+1)%points.length],c=points[(i+2)%points.length];return ((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]))*Math.sign(area)>=-1e-9;});
});
const partColorSchema=z.object({color:z.string().regex(/^#[0-9a-fA-F]{6}$/),shade:z.union([z.literal(.62),z.literal(1),z.literal(1.2)])}).strict();
export const sharedEditsSchema=z.object({
 version:z.literal(1),
 source:z.string().regex(/^mesh-v1-\d+-[0-9a-f]{1,8}$/).optional(),
 paints:z.array(z.object({triangle:z.number().int().min(0).max(59999),polygon,color:z.string().regex(/^#[0-9a-fA-F]{6}$/),shade:z.union([z.literal(.62),z.literal(1),z.literal(1.2)])}).strict()).max(MAX_SURFACE_PAINTS),
 parts:z.record(z.string().min(1).max(200),z.object({offset:vector(-3,3),scale:vector(.1,3)}).strict()).refine(parts=>Object.keys(parts).length<=200),
 partColors:z.record(z.string().min(1).max(200),partColorSchema).refine(colors=>Object.keys(colors).length<=200).optional(),
}).strict().refine(edits=>!edits.paints.length&&!Object.keys(edits.parts).length&&!Object.keys(edits.partColors||{}).length||!!edits.source);
