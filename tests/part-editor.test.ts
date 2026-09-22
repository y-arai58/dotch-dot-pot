import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildMesh,clone,renderSet,renderFrame,projectToScreen,DEFAULT_STYLE,DIRECTIONS,type V3,type Model,type Revision,type SurfaceHit} from '../lib/pixel';
import {applySharedEdits,emptySharedEdits,partCenters,identityTransform} from '../lib/shared-edits';
import {sharedEditsSchema} from '../lib/shared-edits-schema';
import {transformPartPoint,partPivot,movePartPivot,dragPivotOnView} from '../lib/part-transform';
import {paintPartStroke,recolorPart,clearPartPattern,previewPartDesign} from '../lib/part-design';
import {exportRevision} from '../lib/export';
import {parseAnimal} from '../lib/animal-contracts';
import {animalRig,animalClips,animalPose,animalPoseMesh} from '../lib/animal-animation';
import animals from '../lib/animal-samples.json';
const close=(a:number[],b:number[])=>a.forEach((n,i)=>assert.ok(Math.abs(n-b[i])<1e-10,`${a} != ${b}`));
const model:Model={id:'hinged-box',name:'検証用の箱',prompt:'後ろに蝶番のある箱',features:['蓋'],parts:[{id:'body',shape:'box',position:[0,0,.35],size:[.9,.7,.7],color:'#ae7951'},{id:'lid',shape:'box',position:[0,0,.78],size:[1,.8,.12],color:'#d7a271'}]};
const base=buildMesh(model),frames=renderSet(base,DEFAULT_STYLE);
const revision:Revision={id:'original-part',createdAt:new Date().toISOString(),style:DEFAULT_STYLE,frames,baseFrames:clone(frames),approved:false,reviewed:false,issues:'',mode:'eight',source:'sample',rigKind:'prop',modelId:model.id,name:model.name,prompt:model.prompt,features:model.features,size:1,facing:0};

test('支点を動かしても回転・非等方拡大済みのパーツは動かず、その後は新しい支点を中心に回る',()=>{
 const center:V3=[.1,-.2,.7],t={offset:[.1,.2,-.1] as V3,scale:[1.2,.8,1.4] as V3,rotation:[35,-20,70] as V3,pivot:[.4,.3,.5] as V3};
 const target:V3=[-.2,.3,.9],next=movePartPivot(center,t,target);close(partPivot(center,next),target);
 for(const p of [[0,0,0],[1,2,.5],[-.4,.6,1.3]] as V3[])close(transformPartPoint(p,center,t),transformPartPoint(p,center,next));
 const hinge:V3=[0,.4,.78],rotated={...identityTransform(),pivot:hinge,rotation:[-90,0,0] as V3};
 close(transformPartPoint(hinge,[0,0,.78],rotated),hinge);
 close(transformPartPoint([0,-.4,.78],[0,0,.78],rotated),[0,.4,1.58]);
 const edited=emptySharedEdits(base);edited.parts.lid=rotated;const mesh=applySharedEdits(base,edited);
 assert.deepEqual(mesh.triangles.filter(t=>t.partId==='body').map(t=>t.vertices),base.triangles.filter(t=>t.partId==='body').map(t=>t.vertices));
 assert.deepEqual(base,buildMesh(model),'元モデルは変更しない');
 for(const rotation of [[0,0,0],[0,0,25],[-40,0,0],[35,-20,70]] as V3[]){
  const before=emptySharedEdits(base);before.parts.lid={...identityTransform(),rotation,scale:[1.2,.8,1.4]};
  const after=clone(before);after.parts.lid=movePartPivot(partCenters(base).get('lid')!,before.parts.lid,[.31,-.13,1.17]);
  assert.deepEqual(renderSet(applySharedEdits(base,after),DEFAULT_STYLE),renderSet(applySharedEdits(base,before),DEFAULT_STYLE),'支点の移動だけなら8方向の全画素を維持する');
 }
});
test('8方向・正面補正・縮尺・俯角が変わっても支点のドラッグは画面上の移動と一致し奥行きを保つ',()=>{
 for(const direction of DIRECTIONS)for(const facing of [0,135])for(const size of [.75,1.3]){
  const style={...DEFAULT_STYLE,elevation:45},pivot:V3=[.2,.4,.8],before=projectToScreen(pivot,style,direction,size,facing),target:[number,number]=[before[0]+3,before[1]-2];
  const moved=dragPivotOnView(pivot,target,style,direction,size,facing),after=projectToScreen(moved,style,direction,size,facing);close(after,[...target,before[2]]);
 }
});
test('旧形状データの描画を維持し、新しい向きと支点を保存・書出し・検証できる',()=>{
 const edits=emptySharedEdits(base);edits.parts.lid={offset:[.1,0,.02],scale:[.8,1.1,.9]};const center=partCenters(base).get('lid')!;
 const legacy=base.triangles.map(t=>({...t,vertices:t.partId==='lid'?t.vertices.map(v=>v.map((n,i)=>center[i]+(n-center[i])*edits.parts.lid.scale[i]+edits.parts.lid.offset[i]) as V3):t.vertices}));
 assert.deepEqual(applySharedEdits(base,edits).triangles.map(t=>t.vertices),legacy.map(t=>t.vertices));
 edits.parts.lid={...identityTransform(),rotation:[-30,0,0],pivot:[0,.4,.78]};const parsed=sharedEditsSchema.parse(JSON.parse(JSON.stringify(edits)));assert.deepEqual(parsed,edits);
 const preview=previewPartDesign(base,revision,parsed),next={...revision,sharedEdits:parsed,frames:preview.frames,baseFrames:preview.baseFrames};
 const exported=JSON.parse(new TextDecoder().decode(exportRevision(next)['shared-edits.json']));assert.deepEqual(exported.edits,edits);
 assert.deepEqual(renderSet(applySharedEdits(base,exported.edits),DEFAULT_STYLE),preview.frames);
 for(const patch of [{rotation:[181,0,0]},{pivot:[0,Infinity,0]},{pivot:[6,0,0]},{offset:[4,0,0]}] as Partial<typeof edits.parts.lid>[]){const bad={...edits,parts:{lid:{...edits.parts.lid,...patch}}};assert.equal(sharedEditsSchema.safeParse(bad).success,false);assert.throws(()=>applySharedEdits(base,bad));}
 assert.deepEqual(revision.frames,frames);
});
test('パーツ単位の筆は他の部位・裏面を塗らず、回転後も同じ表面に追従し、地色変更は模様を残す',()=>{
 const hits:(SurfaceHit|undefined)[]=[];renderFrame(base,DEFAULT_STYLE,'S',1,0,hits);
 const point=hits.findIndex(h=>h&&base.triangles[h.triangle].partId==='lid');assert.ok(point>=0);
 const edits=paintPartStroke(base,revision,emptySharedEdits(base),'S','lid',[[point%64,Math.floor(point/64)]],20);
 assert.ok(edits.paints.length);assert.ok(edits.paints.every(p=>base.triangles[p.triangle].partId==='lid'));
 const originalPaint=clone(edits.paints),colored=recolorPart(base,edits,'lid',DEFAULT_STYLE.palette[30]);assert.deepEqual(colored.paints,originalPaint);
 const rotated=clone(colored);rotated.parts.lid={...identityTransform(),rotation:[-40,0,0],pivot:[0,.4,.78]};
 const before=applySharedEdits(base,colored),after=applySharedEdits(base,rotated),center=partCenters(base).get('lid')!;
 assert.equal(before.triangles.length,after.triangles.length);
 for(let i=0;i<before.triangles.length;i++){const a=before.triangles[i],b=after.triangles[i];assert.deepEqual(a.sourceUV,b.sourceUV);assert.deepEqual(a.paint,b.paint);for(let j=0;j<3;j++)close(b.vertices[j],a.partId==='lid'?transformPartPoint(a.vertices[j],center,rotated.parts.lid):a.vertices[j]);}
 assert.equal(clearPartPattern(base,rotated,'lid').paints.length,0);assert.deepEqual(clearPartPattern(base,rotated,'body').paints,rotated.paints);
 const background=paintPartStroke(base,revision,edits,'S','lid',[[0,0],[1,1]],20);assert.deepEqual(background,edits);
});
test('生き物のパーツの向きも関節ウェイトを維持し、共有後の動作に引き継ぐ',()=>{
 const animal=parseAnimal(animals[0]),mesh=buildMesh(animal),part=animal.parts.find(p=>p.bone==='head')!.id,edits=emptySharedEdits(mesh);
 edits.parts[part]={...identityTransform(),rotation:[0,8,0],pivot:animal.rig.bones.find(b=>b.id==='head')!.pivot};
 const transformed=applySharedEdits(mesh,edits),rig=animalRig(animal),pose=animalPose(rig,animalClips()[1],3),posed=animalPoseMesh(transformed,rig,pose);
 assert.deepEqual(transformed.triangles.map(t=>t.weights),mesh.triangles.map(t=>t.weights));assert.deepEqual(posed.triangles.map(t=>t.weights),transformed.triangles.map(t=>t.weights));
 assert.notDeepEqual(posed.triangles.filter(t=>t.partId===part).map(t=>t.vertices),animalPoseMesh(mesh,rig,pose).triangles.filter(t=>t.partId===part).map(t=>t.vertices));
});
