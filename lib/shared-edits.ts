import {clone,projectToScreen,renderFrame,renderSet,type Mesh,type Triangle,type V3,type SurfaceHit,type Revision,type Frame,type Direction,type Influence} from './pixel';
import {MAX_EDITED_TRIANGLES,MAX_SURFACE_PAINTS,type V2,type SharedEdits,type SurfacePaint,type PartTransform,type PartColor} from './shared-edit-types';
export type {SharedEdits,PartTransform,PartColor} from './shared-edit-types';

const eps=1e-9;
const mix=(a:number[],b:number[],t:number)=>a.map((v,i)=>v+(b[i]-v)*t);
const signedArea=(p:V2[])=>p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a[0]*b[1]-a[1]*b[0];},0)/2;
const cross2=(a:V2,b:V2,p:V2)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
const valid=(p:V2[])=>p.length>=3&&Math.abs(signedArea(p))>eps;
function clipUV(polygon:V2[],distance:(p:V2)=>number):V2[]{
 const result:V2[]=[];
 for(let i=0;i<polygon.length;i++){
  const a=polygon[i],b=polygon[(i+1)%polygon.length],da=distance(a),db=distance(b),insideA=da>=-eps,insideB=db>=-eps;
  if(insideA)result.push(a);
  if(insideA!==insideB)result.push(mix(a,b,da/(da-db)) as V2);
 }
 return result.filter((p,i)=>!i||Math.hypot(p[0]-result[i-1][0],p[1]-result[i-1][1])>eps);
}
const bary=(uv:V2)=>[1-uv[0]-uv[1],uv[0],uv[1]] as V3;
function combine<T extends number[]>(values:T[],weights:number[]):T{return values[0].map((_,axis)=>values.reduce((n,v,i)=>n+v[axis]*weights[i],0)) as T;}
function localBary(p:V2,vertices:V2[]):V3{
 const [a,b,c]=vertices,area=cross2(a,b,c);
 const y=((p[0]-a[0])*(c[1]-a[1])-(p[1]-a[1])*(c[0]-a[0]))/area;
 const z=((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]))/area;
 return [1-y-z,y,z];
}
function interpolateWeights(weights:Influence[][],coefficients:V3):Influence[]{
 const merged=new Map<string,number>();weights.forEach((list,i)=>list.forEach(w=>merged.set(w.bone,(merged.get(w.bone)||0)+w.weight*coefficients[i])));
 const all=[...merged].filter(([,weight])=>weight>eps),total=all.reduce((n,[,v])=>n+v,0)||1;
 return all.map(([bone,weight])=>({bone,weight:weight/total}));
}
/** Split a surface, preserving texture coordinates, joint weights, and original triangle coordinates. */
function triangulate(t:Triangle,polygon:V2[],paint=t.paint,surfacePaint=t.surfacePaint):Triangle[]{
 if(!valid(polygon))return [];
 const out:Triangle[]=[],source=t.sourceUV!;
 for(let i=1;i<polygon.length-1;i++){
  const uv=[polygon[0],polygon[i],polygon[i+1]] as [V2,V2,V2];if(!valid(uv))continue;
  const weights=uv.map(p=>localBary(p,source));
  out.push({...t,vertices:weights.map(w=>combine(t.vertices,w)) as [V3,V3,V3],sourceUV:uv,paint,surfacePaint,
   ...(t.uv?{uv:weights.map(w=>combine(t.uv!,w)) as [V2,V2,V2]}:{}),
   ...(t.weights?{weights:weights.map(w=>interpolateWeights(t.weights!,w)) as [Influence[],Influence[],Influence[]]}:{}),
  });
 }
 return out;
}
function paintTriangle(t:Triangle,patch:SurfacePaint):Triangle[]{
 const mask=signedArea(patch.polygon)<0?[...patch.polygon].reverse():patch.polygon;
 if(!valid(mask))throw Error('表面の修正範囲が不正です');
 let intersection=t.sourceUV! as V2[];
 for(let i=0;i<mask.length;i++)intersection=clipUV(intersection,p=>cross2(mask[i],mask[(i+1)%mask.length],p));
 if(!valid(intersection))return [t];
 let inside=t.sourceUV! as V2[];const result:Triangle[]=[];
 for(let i=0;i<mask.length;i++){
  const distance=(p:V2)=>cross2(mask[i],mask[(i+1)%mask.length],p);
  result.push(...triangulate(t,clipUV(inside,p=>-distance(p))));inside=clipUV(inside,distance);
 }
 result.push(...triangulate(t,inside,{color:patch.color,shade:patch.shade},true));return result;
}
/** Detect accidental topology drift; this fingerprint is not used for authentication. */
export function meshFingerprint(mesh:Mesh){let hash=2166136261;for(const t of mesh.triangles){const value=JSON.stringify([t.partId,t.vertices,t.uv]);for(let i=0;i<value.length;i++)hash=Math.imul(hash^value.charCodeAt(i),16777619);}return `mesh-v1-${mesh.triangles.length}-${(hash>>>0).toString(16)}`;}
export const emptySharedEdits=(base?:Mesh):SharedEdits=>({version:1,...(base?{source:meshFingerprint(base)}:{}),paints:[],parts:{}});
export const identityTransform=():PartTransform=>({offset:[0,0,0],scale:[1,1,1]});
export function partCenters(mesh:Mesh){
 const bounds=new Map<string,{min:V3;max:V3}>();
 for(const t of mesh.triangles)if(t.partId){let b=bounds.get(t.partId);if(!b){b={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};bounds.set(t.partId,b);}for(const v of t.vertices)for(let a=0;a<3;a++){b.min[a]=Math.min(b.min[a],v[a]);b.max[a]=Math.max(b.max[a],v[a]);}}
 return new Map([...bounds].map(([id,b])=>[id,b.min.map((v,i)=>(v+b.max[i])/2) as V3]));
}
export function applySharedEdits(base:Mesh,edits?:SharedEdits):Mesh{
 if(!edits||(!edits.paints.length&&!Object.keys(edits.parts).length&&!Object.keys(edits.partColors||{}).length&&!Object.keys(edits.colorReplacements||{}).length))return base;
 if(edits.version!==1||edits.paints.length>MAX_SURFACE_PAINTS||Object.keys(edits.partColors||{}).length>200||Object.keys(edits.colorReplacements||{}).length>200)throw Error('共通修正の上限を超えています');
 if(edits.source!==meshFingerprint(base))throw Error('元モデルの構造が変わっています。元のモデルを復元してから修正を読み込んでください');
 const centers=partCenters(base),byTriangle=new Map<number,SurfacePaint[]>();
 for(const id of Object.keys(edits.parts))if(!centers.has(id))throw Error('修正するパーツが元モデルにありません');
 for(const [id,color] of Object.entries(edits.partColors||{})){
  if(!centers.has(id))throw Error('色を変更するパーツが元モデルにありません');
  if(!/^#[0-9a-fA-F]{6}$/.test(color.color)||![.62,1,1.2].includes(color.shade))throw Error('パーツの色が不正です');
 }
 for(const [id,rules] of Object.entries(edits.colorReplacements||{})){
  if(!centers.has(id))throw Error('色を変更するパーツが元モデルにありません');
  if(!rules.length||rules.length>32||rules.some(r=>!/^#[0-9a-fA-F]{6}$/.test(r.from)||!/^#[0-9a-fA-F]{6}$/.test(r.color)||![.62,1,1.2].includes(r.shade)))throw Error('色の置き換え設定が不正です');
 }
 for(const p of edits.paints){if(!base.triangles[p.triangle])throw Error('修正する表面が元モデルにありません');const list=byTriangle.get(p.triangle)||[];list.push(p);byTriangle.set(p.triangle,list);}
 const triangles:Triangle[]=[];
 for(let i=0;i<base.triangles.length;i++){
  const original=base.triangles[i],transform=original.partId&&Object.hasOwn(edits.parts,original.partId)?edits.parts[original.partId]:undefined,center=original.partId?centers.get(original.partId):undefined;
  const partColor=original.partId&&edits.partColors&&Object.hasOwn(edits.partColors,original.partId)?edits.partColors[original.partId]:undefined;
  const replacements=original.partId&&edits.colorReplacements&&Object.hasOwn(edits.colorReplacements,original.partId)?edits.colorReplacements[original.partId]:undefined;
  const t:Triangle={...original,...(partColor?{paint:partColor}:{}),colorReplacements:replacements,sourceIndex:i,sourceUV:[[0,0],[1,0],[0,1]],vertices:transform&&center?original.vertices.map(v=>v.map((n,a)=>center[a]+(n-center[a])*transform.scale[a]+transform.offset[a]) as V3) as [V3,V3,V3]:original.vertices};
  let pieces=[t];for(const patch of byTriangle.get(i)||[]){pieces=pieces.flatMap(piece=>paintTriangle(piece,patch));if(pieces.length+triangles.length>MAX_EDITED_TRIANGLES)throw Error('表面の修正が細かすぎます。修正範囲を小さくしてください');}
  triangles.push(...pieces);if(triangles.length>MAX_EDITED_TRIANGLES)throw Error('修正後の面数が上限を超えています');
 }
 return {...base,triangles};
}

export type PartColorProposal=PartColor&{partId:string;pixels:number;hasMultipleColors:boolean;colors:(PartColor&{pixels:number})[];materials:{color:string;shade:number;pixels:number;indices:number[]}[];indices:number[]};
/** Suggest one whole-part color from the painted pixels; separate markings remain an explicit surface-edit choice. */
export function capturePartColors(mesh:Mesh,revision:Revision,direction:Direction):{proposals:PartColorProposal[];transferred:number[];localOnly:number[]}{
 const hits:(SurfaceHit|undefined)[]=new Array(4096),before=renderFrame(mesh,revision.style,direction,revision.size,revision.facing,hits),edited=revision.frames.find(f=>f.direction===direction);
 if(!edited)throw Error('修正した方向が見つかりません');
 const groups=new Map<string,{indices:number[];colors:Map<string,{pixels:number;shades:Map<number,number>}>;materials:Map<string,number[]>}>(),transferred:number[]=[],localOnly:number[]=[];
 for(let at=0;at<4096;at++){
  const index=edited.body[at];if(index===before.body[at])continue;
  const hit=hits[at],partId=hit&&mesh.triangles[hit.triangle].partId,color=revision.style.palette[index-1];
  if(!index||!hit||!partId||!color){localOnly.push(at);continue;}
  let group=groups.get(partId);if(!group){group={indices:[],colors:new Map(),materials:new Map()};groups.set(partId,group);}
  const normalized=color.toLowerCase();let choice=group.colors.get(normalized);if(!choice){choice={pixels:0,shades:new Map()};group.colors.set(normalized,choice);}
  choice.pixels++;choice.shades.set(hit.shade,(choice.shades.get(hit.shade)||0)+1);group.indices.push(at);transferred.push(at);
  if(!hit.surfacePaint){const points=group.materials.get(hit.materialColor)||[];points.push(at);group.materials.set(hit.materialColor,points);}
 }
 const proposals=[...groups].map(([partId,group])=>{
  const colors=[...group.colors].map(([color,choice])=>({color,pixels:choice.pixels,shade:[...choice.shades].sort((a,b)=>b[1]-a[1])[0][0]})).sort((a,b)=>b.pixels-a.pixels);
  const materials=[...group.materials].map(([color,indices])=>{
   const shades=new Map<number,number>();for(const at of indices){const shade=hits[at]!.shade;shades.set(shade,(shades.get(shade)||0)+1);}
   return {color,indices,pixels:indices.length,shade:[...shades].sort((a,b)=>b[1]-a[1])[0][0]};
  }).sort((a,b)=>b.pixels-a.pixels);
  return {partId,color:colors[0].color,shade:colors[0].shade,pixels:group.indices.length,hasMultipleColors:colors.length>1,colors,materials,indices:group.indices};
 });
 return {proposals,transferred,localOnly};
}

/** Trace only the nearest visible surface. A marking never tunnels through to the rear of an object. */
export function captureSurfacePaint(mesh:Mesh,revision:Revision,direction:Direction){
 const hits:(SurfaceHit|undefined)[]=new Array(4096),before=renderFrame(mesh,revision.style,direction,revision.size,revision.facing,hits),edited=revision.frames.find(f=>f.direction===direction);
 if(!edited)throw Error('修正した方向が見つかりません');
 const paints:SurfacePaint[]=[],transferred:number[]=[],localOnly:number[]=[];
 for(let at=0;at<4096;at++){
  const color=edited.body[at];if(color===before.body[at])continue;
  const hit=hits[at];if(!color||!hit){localOnly.push(at);continue;}
  const t=mesh.triangles[hit.triangle],originalUV:[V2,V2,V2]=[[0,0],[1,0],[0,1]];
  // Reconstruct the original surface so previous paint boundaries never truncate a new brush stroke.
  const vertices=t.sourceUV?originalUV.map(p=>combine(t.vertices,localBary(p,t.sourceUV!))):t.vertices;
  const screen=vertices.map(v=>projectToScreen(v,revision.style,direction,revision.size,revision.facing));
  const x=at%64,y=Math.floor(at/64),sample=(p:V2,axis:number)=>combine(screen,bary(p))[axis];
  let polygon:V2[]=[[0,0],[1,0],[0,1]];
  polygon=clipUV(polygon,p=>sample(p,0)-x);polygon=clipUV(polygon,p=>x+1-sample(p,0));
  polygon=clipUV(polygon,p=>sample(p,1)-y);polygon=clipUV(polygon,p=>y+1-sample(p,1));
  if(!valid(polygon)){localOnly.push(at);continue;}
  paints.push({triangle:t.sourceIndex??hit.triangle,polygon,color:revision.style.palette[color-1],shade:hit.shade});transferred.push(at);
 }
 return {paints,transferred,localOnly};
}

/** Keep edits that cannot be represented on a surface in their original direction. */
export function previewSharedRevision(base:Mesh,revision:Revision,direction:Direction,edits:SharedEdits,transferred:number[],preserveSource=false){
 const originalMesh=applySharedEdits(base,revision.sharedEdits),nextMesh=applySharedEdits(base,edits);
 const baseline=renderSet(originalMesh,revision.style,revision.mode,revision.size,revision.facing),baseFrames=renderSet(nextMesh,revision.style,revision.mode,revision.size,revision.facing),frames=clone(baseFrames),applied=new Set(transferred);
 let localOnly=0,sourceOnly=0;
 for(const f of frames){const old=revision.frames.find(v=>v.direction===f.direction)!,before=baseline.find(v=>v.direction===f.direction)!;
  if(preserveSource&&f.direction===direction){sourceOnly=f.body.reduce((n,v,i)=>n+Number(v!==old.body[i]||f.shadow[i]!==old.shadow[i]),0);f.body=[...old.body];f.shadow=[...old.shadow];continue;}
  for(let at=0;at<4096;at++){
   if(old.body[at]!==before.body[at]&&f.body[at]!==old.body[at]&&!(f.direction===direction&&applied.has(at))){f.body[at]=old.body[at];localOnly++;}
   if(old.shadow[at]!==before.shadow[at]&&f.shadow[at]!==old.shadow[at]){f.shadow[at]=old.shadow[at];localOnly++;}
  }
 }
 return {mesh:nextMesh,frames,baseFrames,localOnly,sourceOnly};
}
