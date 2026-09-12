import * as THREE from 'three';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import type {Mesh,Triangle,Texture,V3,Influence} from './pixel';
import {PARENTS,type BoneId} from './animation';

export function boneName(name:string):BoneId|undefined{
 const key=name.toLowerCase().replace(/mixamorig\d*[:_]?/g,'').replace(/[^a-z0-9]/g,'');
 const aliases:Record<BoneId,string[]>={root:['root','armature'],pelvis:['hips','pelvis'],torso:['spine','spine1','spine2','chest'],head:['head','neck'],upperArmL:['leftarm','leftupperarm','upperarml','lupperarm'],lowerArmL:['leftforearm','leftlowerarm','lowerarml','lforearm'],handL:['lefthand','handl','lhand'],upperArmR:['rightarm','rightupperarm','upperarmr','rupperarm'],lowerArmR:['rightforearm','rightlowerarm','lowerarmr','rforearm'],handR:['righthand','handr','rhand'],thighL:['leftupleg','leftthigh','thighl','lthigh','leftupperleg'],shinL:['leftleg','leftshin','shinl','lcalf','leftlowerleg'],footL:['leftfoot','footl','lfoot','leftankle'],thighR:['rightupleg','rightthigh','thighr','rthigh','rightupperleg'],shinR:['rightleg','rightshin','shinr','rcalf','rightlowerleg'],footR:['rightfoot','footr','rfoot','rightankle']};
 return (Object.keys(aliases) as BoneId[]).find(id=>key===id.toLowerCase()||aliases[id].includes(key));
}
function boneFor(node:THREE.Object3D|null):BoneId|undefined{for(let current=node;current;current=current.parent){const id=boneName(current.name);if(id)return id;}return undefined;}
export async function loadGLB(url:string):Promise<Mesh>{
 const response=await fetch(url);if(!response.ok)throw Error('モデルを取得できません');
 const bytes=await response.arrayBuffer();if(bytes.byteLength>25*1024*1024)throw Error('モデルは25MB以下にしてください');
 if(bytes.byteLength<20)throw Error('GLB形式ではありません');const header=new DataView(bytes);
 if(header.getUint32(0,true)!==0x46546c67||header.getUint32(4,true)!==2||header.getUint32(8,true)!==bytes.byteLength)throw Error('GLB v2形式ではありません');
 const jsonLength=header.getUint32(12,true);if(jsonLength>bytes.byteLength-20)throw Error('GLBが破損しています');
 const json=JSON.parse(new TextDecoder().decode(bytes.slice(20,20+jsonLength)));
 if([...(json.buffers||[]),...(json.images||[])].some((v:{uri?:string})=>v.uri&&!v.uri.startsWith('data:')))throw Error('外部ファイルを含むモデルには対応していません');
 if(json.extensionsRequired?.includes('KHR_texture_basisu'))throw Error('圧縮を解除したGLBを使用してください');
 const draco=new DRACOLoader().setDecoderPath('/decoders/');
 const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setDRACOLoader(draco);
 let gltf;try{gltf=await loader.parseAsync(bytes,'');}finally{draco.dispose();}
 gltf.scene.updateMatrixWorld(true);
 const box=new THREE.Box3().setFromObject(gltf.scene),center=box.getCenter(new THREE.Vector3()),height=box.max.y-box.min.y;
 if(!Number.isFinite(height)||height<=0)throw Error('モデルのサイズを確認できません');
 const factor=2.35/height,triangles:Triangle[]=[],textures:Record<string,Texture>={},parts:NonNullable<Mesh['parts']>=[];
 const world=(v:THREE.Vector3):V3=>[(v.x-center.x)*factor,-(v.z-center.z)*factor,(v.y-box.min.y)*factor];
 const skeleton=new Map<BoneId,{id:BoneId;parent?:BoneId;pivot:V3}>();
 gltf.scene.traverse(obj=>{if(obj instanceof THREE.Bone){const id=boneName(obj.name);if(id&&!skeleton.has(id))skeleton.set(id,{id,...(PARENTS[id]?{parent:PARENTS[id]!}:{}),pivot:world(obj.getWorldPosition(new THREE.Vector3()))});}});
 if(skeleton.size)skeleton.set('root',{id:'root',pivot:[0,0,0]});
 let count=0,meshIndex=0;
 try{gltf.scene.traverse(obj=>{
  if(!(obj instanceof THREE.Mesh))return;const partId=`mesh-${meshIndex++}`;parts.push({id:partId,name:obj.name||`パーツ ${meshIndex}`});
  const geo=obj.geometry,pos=geo.attributes.position,uv=geo.attributes.uv,index=geo.index,materials=Array.isArray(obj.material)?obj.material:[obj.material];if(!pos)return;
  const vertexCount=index?index.count:pos.count;count+=vertexCount/3;if(count>60000)throw Error('60,000面以下のモデルを使用してください');
  const skinned=obj instanceof THREE.SkinnedMesh?obj:null;
  skinned?.skeleton.update();
  for(let i=0;i<vertexCount;i+=3){
   const group=geo.groups.find((g:{start:number;count:number;materialIndex?:number})=>i>=g.start&&i<g.start+g.count),mat=materials[group?.materialIndex||0] as THREE.MeshStandardMaterial;
   if(mat.visible===false||mat.opacity<.5)continue;
   let texture:string|undefined;
   if(mat.map?.image){texture=mat.map.uuid;if(!textures[texture]){const image=mat.map.image as CanvasImageSource&{width:number;height:number},w=Math.min(1024,image.width),h=Math.min(1024,image.height);if(w*h>0){const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d',{willReadFrequently:true});if(ctx){ctx.drawImage(image,0,0,w,h);textures[texture]={width:w,height:h,data:ctx.getImageData(0,0,w,h).data};}}}}
   const ids=[0,1,2].map(n=>index?index.getX(i+n):i+n);
   const vertices=ids.map(j=>world(obj.getVertexPosition(j,new THREE.Vector3()).applyMatrix4(obj.matrixWorld))) as [V3,V3,V3];
   const coords=uv?ids.map(j=>{const v=new THREE.Vector2(uv.getX(j),uv.getY(j));if(mat.map)mat.map.transformUv(v);return [v.x,v.y] as [number,number];}) as Triangle['uv']:undefined;
   let weights:Triangle['weights'];
   if(skinned&&geo.attributes.skinIndex&&geo.attributes.skinWeight){weights=ids.map(j=>{const influences:Influence[]=[];for(let k=0;k<4;k++){const w=geo.attributes.skinWeight.getComponent(j,k),bone=skinned.skeleton.bones[geo.attributes.skinIndex.getComponent(j,k)];if(w>0&&bone)influences.push({bone:boneFor(bone)||'root',weight:w});}return influences;}) as Triangle['weights'];}
   else{const attached=boneFor(obj);if(attached)weights=ids.map(()=>[{bone:attached,weight:1}]) as Triangle['weights'];}
   triangles.push({vertices,color:'#'+(mat.color?.getHexString(THREE.SRGBColorSpace)||'ffffff'),texture,uv:coords,partId,weights});
  }
 });if(!triangles.length)throw Error('モデルに描画できる形状がありません');return {triangles,textures,parts,skeleton:[...skeleton.values()]};
 }finally{gltf.scene.traverse(obj=>{if(obj instanceof THREE.Mesh){obj.geometry.dispose();const materials=Array.isArray(obj.material)?obj.material:[obj.material];materials.forEach(m=>{(m as THREE.MeshStandardMaterial).map?.dispose();m.dispose();});}});}
}
