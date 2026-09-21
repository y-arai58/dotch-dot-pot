import type {SharedEdits,V2} from './shared-edit-types';
export const RENDERER_VERSION = 'orthographic-topdown-v2';
export const DIRECTIONS = ['S','SE','E','NE','N','NW','W','SW'] as const;
export type Direction = typeof DIRECTIONS[number];
export type V3 = [number,number,number];
export type Part = { id:string; shape:'box'|'ellipsoid'|'cylinder'|'cone'; position:V3; size:V3; color:string; rotation?:V3 };
export type Model = { id:string; name:string; prompt:string; features:string[]; parts:Part[] };
export type Influence = {bone:string;weight:number};
export type Triangle = { vertices:[V3,V3,V3]; color:string; uv?:[[number,number],[number,number],[number,number]]; texture?:string; partId?:string; weights?:[Influence[],Influence[],Influence[]];sourceIndex?:number;sourceUV?:[V2,V2,V2];paint?:{color:string;shade:number} };
export type Texture = {width:number;height:number;data:Uint8ClampedArray};
export type Mesh = {triangles:Triangle[];textures?:Record<string,Texture>;parts?:{id:string;name:string}[];skeleton?:{id:string;parent?:string;pivot:V3}[]};
export type Style = {id:string;name:string;palette:string[];light:number;lightHeight:number;elevation:number;outline:boolean;shadow:boolean;scale:number;anchor:[number,number]};
export type Frame = {direction:Direction;body:number[];shadow:number[];clipped:boolean};
export type Revision = {id:string;rendererVersion?:string;createdAt:string;style:Style;frames:Frame[];baseFrames:Frame[];approved:boolean;reviewed:boolean;issues:string;mode:'front'|'eight';source:'sample'|'tripo'|'import'|'skill';rigKind?:'humanoid'|'quadruped';modelId:string;features:string[];name:string;prompt:string;facing:number;size:number;modelKey?:string;referenceKeys?:string[];sharedEdits?:SharedEdits;parentRevisionId?:string};
export type Asset = {id:string;projectId:string;name:string;revisions:Revision[];updatedAt:string;version:number};
export type Project = {id:string;name:string;styles:Style[];updatedAt:string;version:number};
export const PALETTE = ['#151b29','#29334b','#45516a','#718096','#aeb9c8','#e5ebec','#ffffff','#273d34','#3f6544','#668653','#91ad69','#c9d69a','#302a3f','#504369','#79658e','#ab8fbb','#4b3033','#85444c','#bd6860','#e89b78','#523d34','#805842','#ae7951','#d7a271','#f0cca0','#493e26','#806c37','#b7984b','#e5c469','#f6e3a3','#356075','#64a0b5'];
export const DEFAULT_STYLE:Style={id:'style-1',name:'森のパレット',palette:PALETTE,light:225,lightHeight:45,elevation:30,outline:true,shadow:false,scale:20,anchor:[32,52]};
export const clone = <T,>(v:T):T => JSON.parse(JSON.stringify(v));
export const radians=(d:number)=>d*Math.PI/180;
const sub=(a:V3,b:V3):V3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross=(a:V3,b:V3):V3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a:V3,b:V3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const norm=(a:V3):V3=>{const n=Math.hypot(...a)||1;return a.map(v=>v/n) as V3;};
export function rotate(v:V3,r:V3):V3{
 let [x,y,z]=v;let c=Math.cos(r[0]),s=Math.sin(r[0]);[y,z]=[y*c-z*s,y*s+z*c];
 c=Math.cos(r[1]);s=Math.sin(r[1]);[x,z]=[x*c+z*s,-x*s+z*c];
 c=Math.cos(r[2]);s=Math.sin(r[2]);return [x*c-y*s,x*s+y*c,z];
}
export const rgb=(hex:string):V3=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)) as V3;
export function nearestColor(color:V3,palette:string[]):number{
 let best=0,min=Infinity;palette.forEach((p,i)=>{const c=rgb(p);const d=(color[0]-c[0])**2*.3+(color[1]-c[1])**2*.59+(color[2]-c[2])**2*.11;if(d<min){min=d;best=i;}});return best+1;
}
export function buildMesh(model:Model):Mesh{
 const triangles:Triangle[]=[];
 for(const p of model.parts){
  const vertices:V3[]=[];const faces:number[][]=[];
  if(p.shape==='box'){
   for(const z of [-.5,.5])for(const y of [-.5,.5])for(const x of [-.5,.5])vertices.push([x,y,z]);
   faces.push([0,2,3,1],[4,5,7,6],[0,1,5,4],[2,6,7,3],[0,4,6,2],[1,3,7,5]);
  }else if(p.shape==='ellipsoid'){
   const rings=8,segments=12;
   for(let j=0;j<=rings;j++){const v=Math.PI*j/rings;for(let i=0;i<segments;i++){const u=2*Math.PI*i/segments;vertices.push([Math.sin(v)*Math.cos(u)/2,Math.sin(v)*Math.sin(u)/2,Math.cos(v)/2]);}}
   for(let j=0;j<rings;j++)for(let i=0;i<segments;i++){const k=j*segments+i,n=j*segments+(i+1)%segments;faces.push([k,n,n+segments,k+segments]);}
  }else{
   const segments=12;for(let j=0;j<2;j++)for(let i=0;i<segments;i++){const a=2*Math.PI*i/segments,r=p.shape==='cone'&&j===1?0:.5;vertices.push([r*Math.cos(a),r*Math.sin(a),j-.5]);}
   for(let i=0;i<segments;i++){const n=(i+1)%segments;faces.push([i,n,n+segments,i+segments]);}
   faces.push(Array.from({length:segments},(_,i)=>segments-1-i),Array.from({length:segments},(_,i)=>segments+i));
  }
  const world=vertices.map(v=>{const t=rotate(v.map((n,i)=>n*p.size[i]) as V3,p.rotation??[0,0,0]);return t.map((n,i)=>n+p.position[i]) as V3;});
  for(const face of faces)for(let i=1;i<face.length-1;i++)triangles.push({vertices:[world[face[0]],world[face[i]],world[face[i+1]]],color:p.color,partId:p.id});
 }
 return {triangles,parts:model.parts.map(p=>({id:p.id,name:p.id}))};
}
export type SurfaceHit={triangle:number;bary:V3;shade:number};
export function projectToScreen(point:V3,style:Style,direction:Direction,size=1,facing=0):V3{
 const v=rotate(point.map(n=>n*size) as V3,[0,0,radians(DIRECTIONS.indexOf(direction)*45+facing)]),el=radians(style.elevation);
 return [style.anchor[0]+v[0]*style.scale,style.anchor[1]-(v[1]*Math.sin(el)+v[2]*Math.cos(el))*style.scale,-v[1]*Math.cos(el)+v[2]*Math.sin(el)];
}
export function renderFrame(mesh:Mesh,style:Style,direction:Direction,size=1,facing=0,hits?:(SurfaceHit|undefined)[]):Frame{
 const body=new Array<number>(4096).fill(0),shadow=new Array<number>(4096).fill(0),depth=new Float64Array(4096).fill(-Infinity);
 const yaw=radians(DIRECTIONS.indexOf(direction)*45+facing),el=radians(style.elevation),sin=Math.sin(el),cos=Math.cos(el);
 const a=radians(style.light),h=radians(style.lightHeight),light:V3=[Math.sin(a)*Math.cos(h),-Math.cos(a)*Math.cos(h),Math.sin(h)];
 const view:V3=[0,-cos,sin];let clipped=false;
 const project=(v:V3):V3=>[style.anchor[0]+v[0]*style.scale,style.anchor[1]-(v[1]*sin+v[2]*cos)*style.scale,-v[1]*cos+v[2]*sin];
 function raster(vertices:[V3,V3,V3],color:string,shade:number,shadowOnly=false,triangle?:Triangle,triangleIndex?:number){
  const [p,q,r]=vertices.map(project),area=(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);if(Math.abs(area)<.00001)return;
  const x0=Math.floor(Math.min(p[0],q[0],r[0])),x1=Math.ceil(Math.max(p[0],q[0],r[0]));
  const y0=Math.floor(Math.min(p[1],q[1],r[1])),y1=Math.ceil(Math.max(p[1],q[1],r[1]));
  if(x0<2||y0<2||x1>62||y1>62)clipped=true;
  const cache=new Map<string,number>();
  for(let y=Math.max(0,y0);y<Math.min(64,y1);y++)for(let x=Math.max(0,x0);x<Math.min(64,x1);x++){
   const px=x+.5,py=y+.5;const b=((px-p[0])*(r[1]-p[1])-(py-p[1])*(r[0]-p[0]))/area;
   const c=((q[0]-p[0])*(py-p[1])-(q[1]-p[1])*(px-p[0]))/area;const aa=1-b-c;
   if(aa<-.00001||b<-.00001||c<-.00001)continue;const at=y*64+x;
   if(shadowOnly){shadow[at]=1;continue;}
   const z=aa*p[2]+b*q[2]+c*r[2];if(z<depth[at])continue;
   let base=rgb(triangle?.paint?.color||color);const tex=triangle?.texture&&mesh.textures?.[triangle.texture];
   if(tex&&triangle?.uv){const uv=triangle.uv;const u=aa*uv[0][0]+b*uv[1][0]+c*uv[2][0],v=aa*uv[0][1]+b*uv[1][1]+c*uv[2][1];const tx=Math.max(0,Math.min(tex.width-1,Math.floor(u*tex.width))),ty=Math.max(0,Math.min(tex.height-1,Math.floor(v*tex.height)));const ti=(ty*tex.width+tx)*4;if(tex.data[ti+3]<128)continue;if(!triangle.paint)base=[0,1,2].map(j=>tex.data[ti+j]*base[j]/255) as V3;}
   const shading=shade/(triangle?.paint?.shade||1),key=base.map(n=>Math.round(n*shading)).join(',');let index=cache.get(key);if(index===undefined){index=nearestColor(base.map(n=>Math.min(255,n*shading)) as V3,style.palette);cache.set(key,index);}
   body[at]=index;depth[at]=z;
   if(hits&&triangleIndex!==undefined)hits[at]={triangle:triangleIndex,bary:[aa,b,c],shade};
  }
 }
 for(const [triangleIndex,t] of mesh.triangles.entries()){
  const v=t.vertices.map(p=>rotate(p.map(n=>n*size) as V3,[0,0,yaw])) as [V3,V3,V3];
  if(style.shadow){const sh=v.map(p=>[p[0]-p[2]*light[0]/light[2],p[1]-p[2]*light[1]/light[2],0] as V3) as [V3,V3,V3];raster(sh,style.palette[0],1,true);}
  let normal=norm(cross(sub(v[1],v[0]),sub(v[2],v[0])));if(dot(normal,view)<0)normal=normal.map(n=>-n) as V3;
  const illumination=dot(normal,light);const shade=illumination>.65?1.2:illumination>.05?1:.62;
  raster(v,t.color,shade,false,t,triangleIndex);
 }
 if(style.outline){const original=[...body];for(let y=0;y<64;y++)for(let x=0;x<64;x++){const at=y*64+x;if(original[at])continue;if((x>0&&original[at-1])||(x<63&&original[at+1])||(y>0&&original[at-64])||(y<63&&original[at+64])){body[at]=1;if(x<2||x>61||y<2||y>61)clipped=true;}}}
 return {direction,body,shadow,clipped};
}
export function renderSet(mesh:Mesh,style:Style,mode:'front'|'eight'='eight',size=1,facing=0):Frame[]{return (mode==='front'?['S' as Direction]:DIRECTIONS).map(d=>renderFrame(mesh,style,d,size,facing));}
export function composite(frame:Frame,layer:'body'|'shadow'|'composite'='composite'){return layer==='body'?frame.body:layer==='shadow'?frame.shadow:frame.body.map((v,i)=>v||frame.shadow[i]);}
export function rgba(pixels:number[],palette:string[]):Uint8Array{const out=new Uint8Array(pixels.length*4);pixels.forEach((v,i)=>{if(v>0&&v<=palette.length){out.set(rgb(palette[v-1]),i*4);out[i*4+3]=255;}});return out;}
export function validateFrames(frames:Frame[],style:Style,mode:'front'|'eight'):string[]{
 const issues:string[]=[];const expected=mode==='front'?['S']:DIRECTIONS;
 if(frames.length!==expected.length||frames.some((f,i)=>f.direction!==expected[i]))issues.push('方向の構成が一致しません');
 for(const f of frames){if(f.body.length!==4096||f.shadow.length!==4096)issues.push(`${f.direction}: 64×64ではありません`);if([...f.body,...f.shadow].some(p=>!Number.isInteger(p)||p<0||p>style.palette.length))issues.push(`${f.direction}: パレット外の色があります`);if(f.body.some((v,i)=>v>0&&(i%64<2||i%64>61||Math.floor(i/64)<2||Math.floor(i/64)>61))||f.shadow.some((v,i)=>v>0&&(i%64<2||i%64>61||Math.floor(i/64)<2||Math.floor(i/64)>61)))issues.push(`${f.direction}: 外周2ピクセルの余白がありません`);if(f.clipped)issues.push(`${f.direction}: 素材または影が安全範囲を超えています`);if(!f.body.some(p=>p>0))issues.push(`${f.direction}: 物体が空です`);}
 return issues;
}
export function floodFill(pixels:number[],index:number,color:number):number[]{const out=[...pixels],before=out[index];if(before===color)return out;const stack=[index];out[index]=color;while(stack.length){const at=stack.pop()!;const x=at%64,y=Math.floor(at/64);for(const n of [x>0?at-1:-1,x<63?at+1:-1,y>0?at-64:-1,y<63?at+64:-1])if(n>=0&&out[n]===before){out[n]=color;stack.push(n);}}return out;}
export function drawLine(pixels:number[],from:[number,number],to:[number,number],color:number):number[]{const p=[...pixels];let [x,y]=from;const [tx,ty]=to,dx=Math.abs(tx-x),dy=-Math.abs(ty-y),sx=x<tx?1:-1,sy=y<ty?1:-1;let err=dx+dy;for(;;){if(x>=0&&x<64&&y>=0&&y<64)p[y*64+x]=color;if(x===tx&&y===ty)break;const e=2*err;if(e>=dy){err+=dy;x+=sx;}if(e<=dx){err+=dx;y+=sy;}}return p;}

/** A partial render must reuse exactly the same camera convention and object transform. */
export function canReuseFrames(revision:Revision,size:number,facing:number){return revision.rendererVersion===RENDERER_VERSION&&revision.size===size&&revision.facing===facing;}
