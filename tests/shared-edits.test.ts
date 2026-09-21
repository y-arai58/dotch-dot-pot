import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {applySharedEdits,capturePartColors,captureSurfacePaint,emptySharedEdits,previewSharedRevision} from '../lib/shared-edits';
import {buildMesh,renderFrame,renderSet,clone,DEFAULT_STYLE,RENDERER_VERSION,rgba,type Revision,type Mesh,type SurfaceHit,type V3} from '../lib/pixel';
import {sharedEditsSchema} from '../lib/shared-edits-schema';
import {revisionSchema} from '../lib/contracts';
import {animalRig,animalPose,animalPoseMesh,animalClips,renderAnimalFrame} from '../lib/animal-animation';
import {rigFromModel,evaluatePose,poseMesh,defaultClips} from '../lib/animation';
import {findParentAnimation,inheritAnimation} from '../lib/animation-inheritance';
import animalSamples from '../lib/animal-samples.json';
import humanSamples from '../lib/animation-samples.json';
import {parseAnimal} from '../lib/animal-contracts';
import {parseHumanoid} from '../lib/generation';
import {png,exportRevision} from '../lib/export';

const box={id:'box',name:'箱',prompt:'',features:[],parts:[{id:'body',shape:'box' as const,position:[0,0,1] as V3,size:[1,1,1] as V3,color:'#e5ebec'}]};
function revision(mesh:Mesh):Revision{const frames=renderSet(mesh,DEFAULT_STYLE);return {id:'revision-1',createdAt:'2026-09-13T00:00:00Z',rendererVersion:RENDERER_VERSION,style:clone(DEFAULT_STYLE),frames,baseFrames:clone(frames),approved:false,reviewed:false,issues:'',mode:'eight',source:'sample',modelId:'box',features:[],name:'test',prompt:'',facing:0,size:1};}
function paintVisible(mesh:Mesh,r:Revision,count=1,part?:string){
 const hits:(SurfaceHit|undefined)[]=[];renderFrame(mesh,r.style,'S',r.size,r.facing,hits);
 const points=hits.flatMap((h,i)=>h&&(!part||mesh.triangles[h.triangle].partId===part)?[i]:[]);
 assert.ok(points.length>=count);const chosen=points.slice(Math.floor(points.length/3),Math.floor(points.length/3)+count);
 for(const at of chosen)r.frames[0].body[at]=20;
 return chosen;
}
test('1方向の色修正は同じ表面だけへ反映し、元モデルと裏面を変更しない',()=>{
 const base=buildMesh(box),original=clone(base),r=revision(base),hits:(SurfaceHit|undefined)[]=[];renderFrame(base,r.style,'S',1,0,hits);const at=hits.findIndex(h=>h&&base.triangles[h.triangle].vertices.every(v=>v[1]===-.5));assert.ok(at>=0);r.frames[0].body[at]=20;const captured=captureSurfacePaint(base,r,'S');
 const edits={...emptySharedEdits(base),paints:captured.paints},mesh=applySharedEdits(base,edits),frames=renderSet(mesh,r.style);
 assert.equal(frames[0].body[at],20);assert.deepEqual(frames[0].body,r.frames[0].body,'修正元は画素単位で一致する');
 assert.deepEqual(frames[4],r.baseFrames[4],'裏へ透過しない');assert.ok(frames.some((f,i)=>i!==0&&JSON.stringify(f.body)!==JSON.stringify(r.baseFrames[i].body)),'斜めから同じ表面が見える');
 assert.deepEqual(base,original);assert.deepEqual(applySharedEdits(base),base);
});
test('複数画素の模様、サイズ・正面補正・俯角が変わっても保存した表面座標を使う',()=>{
 const base=buildMesh(box),r=revision(base);r.size=.85;r.facing=45;r.style.elevation=45;r.frames=renderSet(base,r.style,r.mode,r.size,r.facing);r.baseFrames=clone(r.frames);
 const chosen=paintVisible(base,r,20),edits={...emptySharedEdits(base),paints:captureSurfacePaint(base,r,'S').paints};
 const mesh=applySharedEdits(base,edits),result=renderFrame(mesh,r.style,'S',r.size,r.facing);
 for(const at of chosen)assert.equal(result.body[at],20);
 assert.deepEqual(result.body,r.frames[0].body);
 const parsed=sharedEditsSchema.parse(JSON.parse(JSON.stringify(edits)));
 assert.deepEqual(renderSet(applySharedEdits(base,parsed),r.style,r.mode,r.size,r.facing),renderSet(mesh,r.style,r.mode,r.size,r.facing));
});
test('一度反映した表面に再度描き、パーツを拡大・移動しても元モデルへ適用できる',()=>{
 const base=buildMesh(box),r=revision(base);paintVisible(base,r,3);const first={...emptySharedEdits(base),paints:captureSurfacePaint(base,r,'S').paints};
 const painted=applySharedEdits(base,first);r.sharedEdits=first;r.frames=renderSet(painted,r.style);r.baseFrames=clone(r.frames);const at=r.frames[0].body.findIndex(v=>v===20);assert.ok(at>=0);r.frames[0].body[at]=10;
 const captured=captureSurfacePaint(painted,r,'S'),second={...first,paints:[...first.paints,...captured.paints]};
 assert.equal(renderFrame(applySharedEdits(base,second),r.style,'S').body[at],10);
 const transformed={...second,parts:{body:{offset:[.1,0,0] as V3,scale:[1.2,1,1] as V3}}},mesh=applySharedEdits(base,transformed);
 assert.ok(mesh.triangles.some(t=>t.paint?.color===r.style.palette[9]));assert.ok(mesh.triangles.some(t=>t.vertices.some(v=>v[0]>.5)));
 assert.deepEqual(sharedEditsSchema.parse(transformed),transformed);
});
test('同じ画素を塗り直すと、分割された表面全体を上書きし全8方向に前の色を残さない',()=>{
 const base=buildMesh(box),r=revision(base),at=31*64+24;
 r.frames[0].body[at]=20;
 const first={...emptySharedEdits(base),paints:captureSurfacePaint(base,r,'S').paints},painted=applySharedEdits(base,first);
 r.sharedEdits=first;r.frames=renderSet(painted,r.style);r.frames[0].body[at]=10;
 const second={...first,paints:[...first.paints,...captureSurfacePaint(painted,r,'S').paints]},repainted=applySharedEdits(base,second);
 const fresh=revision(base);fresh.frames[0].body[at]=10;
 const expected=applySharedEdits(base,{...emptySharedEdits(base),paints:captureSurfacePaint(base,fresh,'S').paints});
 assert.ok(repainted.triangles.every(t=>t.paint?.color!==r.style.palette[19]),'上書き前の色を持つ表面が残らない');
 const frames=renderSet(repainted,r.style);assert.ok(frames.every(f=>!f.body.includes(20)),'SE・SWを含む全方向で前の色が消える');
 assert.deepEqual(frames,renderSet(expected,r.style),'最初から同じ色を塗った場合と全方向で一致する');
});
test('オブジェクトの継承プロパティと同名のパーツも表面を修正できる',()=>{
 const base=buildMesh({...box,parts:[{...box.parts[0],id:'constructor'}]}),r=revision(base),at=paintVisible(base,r)[0];
 const edits={...emptySharedEdits(base),paints:captureSurfacePaint(base,r,'S').paints};
 assert.equal(renderFrame(applySharedEdits(base,edits),r.style,'S').body[at],20);
});
test('輪郭・削除・影・別角度のローカル修正も新候補に残す',()=>{
 const base=buildMesh(box),r=revision(base),at=paintVisible(base,r)[0];r.frames[0].body[10*64+10]=20;r.frames[0].shadow[55*64+30]=1;r.frames[2].body[10*64+10]=10;
 const deleted=r.baseFrames[0].body.findIndex((v,i)=>v&&i!==at);r.frames[0].body[deleted]=0;
 const captured=captureSurfacePaint(base,r,'S'),draft={...emptySharedEdits(base),paints:captured.paints},preview=previewSharedRevision(base,r,'S',draft,captured.transferred);
 assert.equal(preview.localOnly,4);assert.equal(preview.frames[0].body[10*64+10],20);assert.equal(preview.frames[0].body[deleted],0);assert.equal(preview.frames[0].shadow[55*64+30],1);assert.equal(preview.frames[2].body[10*64+10],10);
 assert.equal(preview.baseFrames[0].body[10*64+10],0);assert.equal(preview.baseFrames[0].body[at],20);
});
test('人型・動物の色は頭パーツに付き、全動作で三角形と関節の追従が保たれる',async()=>{
 await mkdir('/private/tmp/dotforge-shared-edit-review',{recursive:true});
 for(const [kind,sample] of [['animal',parseAnimal(animalSamples[0])],['human',parseHumanoid(humanSamples[0])]] as const){
  const base=buildMesh(sample),r=revision(base),part=sample.parts.find(p=>p.bone==='head')!.id;paintVisible(base,r,3,part);
  const edits={...emptySharedEdits(base),paints:captureSurfacePaint(base,r,'S').paints},mesh=applySharedEdits(base,edits);assert.ok(mesh.triangles.some(t=>t.paint));
  const rig=kind==='animal'?animalRig(sample as ReturnType<typeof parseAnimal>):rigFromModel(sample as ReturnType<typeof parseHumanoid>),clips=kind==='animal'?animalClips():defaultClips();
  for(const clip of clips)for(const frame of [0,Math.floor(clip.frames/2),clip.frames-1]){
   const posed=kind==='animal'?animalPoseMesh(mesh,rig as ReturnType<typeof animalRig>,animalPose(rig as ReturnType<typeof animalRig>,clip as ReturnType<typeof animalClips>[number],frame)):poseMesh(mesh,rig as ReturnType<typeof rigFromModel>,evaluatePose(rig as ReturnType<typeof rigFromModel>,clip as ReturnType<typeof defaultClips>[number],frame));
   assert.equal(posed.triangles.filter(t=>t.paint).length,mesh.triangles.filter(t=>t.paint).length);assert.deepEqual(posed.triangles.map(t=>t.sourceUV),mesh.triangles.map(t=>t.sourceUV));
   const frames=renderSet(posed,r.style);assert.ok(frames.every(f=>f.body.length===4096&&f.body.every(v=>Number.isInteger(v)&&v<=r.style.palette.length)));
  }
  const frames=renderSet(mesh,r.style),files=exportRevision({...r,frames});await writeFile(`/private/tmp/dotforge-shared-edit-review/${kind}.png`,files['spritesheet.png']);
 }
});
test('サーバーの保存契約が共通修正を保持し、不正なサイズや容量を拒否する',()=>{
 const base=buildMesh(box),r=revision(base);paintVisible(base,r);r.sharedEdits={...emptySharedEdits(base),paints:captureSurfacePaint(base,r,'S').paints};r.parentRevisionId='previous';
 assert.deepEqual(revisionSchema.parse(r).sharedEdits,r.sharedEdits);
 assert.equal(sharedEditsSchema.safeParse({...r.sharedEdits,parts:{body:{offset:[0,0,0],scale:[0,1,1]}}}).success,false);
 assert.equal(sharedEditsSchema.safeParse({...r.sharedEdits,paints:new Array(2049).fill(r.sharedEdits.paints[0])}).success,false);
 assert.throws(()=>applySharedEdits(base,{...r.sharedEdits!,paints:[{...r.sharedEdits!.paints[0],triangle:99999}]}),/元モデル/);
 const changed=buildMesh({...box,parts:[{...box.parts[0],size:[1.1,1,1]}]});assert.throws(()=>applySharedEdits(changed,r.sharedEdits),/構造が変わ/);
});
test('修正を重ねた版も、最も近い祖先の保存済み動作を選ぶ',()=>{
 const first=revision(buildMesh(box)),second={...first,id:'second',parentRevisionId:first.id},third={...first,id:'third',parentRevisionId:second.id};
 const oldest={id:'motion-old',sourceRevisionId:first.id},closer={id:'motion-new',sourceRevisionId:second.id},unrelated={id:'other',sourceRevisionId:'elsewhere'};
 assert.equal(findParentAnimation([unrelated,oldest],[first,second,third],third),oldest);
 assert.equal(findParentAnimation([oldest,closer],[first,second,third],third),closer);
 assert.equal(findParentAnimation([oldest],[{...second,parentRevisionId:third.id},third],third),undefined,'循環した参照では停止する');
});
test('部位色は変更画素を色別に集計し、最多色の最多shadeを選んで輪郭・削除・未所属の表面を除く',()=>{
 const base=buildMesh({...box,parts:[{...box.parts[0],position:[-.6,0,1],size:[.7,.7,.7]},{...box.parts[0],id:'unassigned',position:[.6,0,1],size:[.7,.7,.7]}]});
 for(const t of base.triangles)if(t.partId==='unassigned')delete t.partId;
 const r=revision(base),hits:(SurfaceHit|undefined)[]=[];renderFrame(base,r.style,'S',1,0,hits);
 const points=(shade:number)=>hits.flatMap((h,i)=>h&&base.triangles[h.triangle].partId==='body'&&h.shade===shade?[i]:[]);
 const dark=points(.62),light=points(1.2);assert.ok(dark.length>=8&&light.length>=2);
 const primary=[...dark.slice(0,3),...light.slice(0,2)],secondary=dark.slice(3,7),changed=[...primary,...secondary].sort((a,b)=>a-b);
 for(const at of primary)r.frames[0].body[at]=20;for(const at of secondary)r.frames[0].body[at]=10;
 const deleted=dark[7],outline=r.frames[0].body.findIndex((v,i)=>v===1&&!hits[i]),blank=r.frames[0].body.findIndex(v=>v===0),unassigned=hits.findIndex(h=>h&&!base.triangles[h.triangle].partId);
 assert.ok(outline>=0&&blank>=0&&unassigned>=0);r.frames[0].body[deleted]=0;for(const at of [outline,blank,unassigned])r.frames[0].body[at]=20;
 const captured=capturePartColors(base,r,'S');assert.equal(captured.proposals.length,1);
 const proposal=captured.proposals[0];assert.equal(proposal.partId,'body');assert.equal(proposal.color,r.style.palette[19]);assert.equal(proposal.shade,.62);assert.equal(proposal.pixels,9);assert.equal(proposal.hasMultipleColors,true);
 assert.deepEqual(proposal.colors,[{color:r.style.palette[19],shade:.62,pixels:5},{color:r.style.palette[9],shade:.62,pixels:4}]);
 assert.deepEqual([...proposal.indices].sort((a,b)=>a-b),changed);assert.deepEqual([...captured.transferred].sort((a,b)=>a-b),changed);
 assert.deepEqual([...captured.localOnly].sort((a,b)=>a-b),[deleted,outline,blank,unassigned].sort((a,b)=>a-b));
});
test('部位全体の色替えは裏面を含む全8方向へ反映し、保存済みの表面模様を上に残す',()=>{
 const base=buildMesh(box),original=clone(base),r=revision(base),at=paintVisible(base,r)[0];
 const oldEdits={...emptySharedEdits(base),paints:captureSurfacePaint(base,r,'S').paints},before=renderSet(applySharedEdits(base,oldEdits),r.style);
 const edits={...oldEdits,partColors:{body:{color:r.style.palette[9],shade:1}}},mesh=applySharedEdits(base,edits),frames=renderSet(mesh,r.style);
 assert.equal(frames[0].body[at],20,'既存の局所的な模様を維持する');
 for(const [i,frame] of frames.entries())assert.notDeepEqual(frame.body,before[i].body,`${frame.direction}の部位色を変更する`);
 assert.ok(mesh.triangles.some(t=>t.paint?.color===r.style.palette[9]));assert.ok(mesh.triangles.some(t=>t.paint?.color===r.style.palette[19]));
 assert.equal(mesh.triangles.length,applySharedEdits(base,oldEdits).triangles.length,'部位色だけで表面を細分化しない');
 assert.ok(JSON.stringify(edits).length<1000,'全8方向の色替えを少量の編集データで保存する');assert.deepEqual(base,original);
});
test('動物の頭部全体を色替えしても他の部位と形状を保ち、動作中も全方向で追従する',()=>{
 const sample=parseAnimal(animalSamples[0]),base=buildMesh(sample),r=revision(base),part=sample.parts.find(p=>p.bone==='head')!.id;
 const selected=paintVisible(base,r,3,part);for(const at of selected)r.frames[0].body[at]=32;
 const captured=capturePartColors(base,r,'S'),proposal=captured.proposals.find(p=>p.partId===part)!;assert.ok(proposal);assert.equal(proposal.hasMultipleColors,false);
 const edits={...emptySharedEdits(base),partColors:{[part]:{color:proposal.color,shade:proposal.shade}}},mesh=applySharedEdits(base,edits),rig=animalRig(sample),clip=animalClips()[1];
 assert.equal(mesh.triangles.length,base.triangles.length);assert.deepEqual(mesh.parts,base.parts);
 for(const frame of [0,Math.floor(clip.frames/2)]){
  const pose=animalPose(rig,clip,frame),original=animalPoseMesh(base,rig,pose),painted=animalPoseMesh(mesh,rig,pose);
  assert.deepEqual(painted.triangles.map(t=>t.vertices),original.triangles.map(t=>t.vertices),'色替え前後の関節追従が一致する');
  for(const before of renderSet(original,r.style)){
   const hits:(SurfaceHit|undefined)[]=[];renderFrame(original,r.style,before.direction,1,0,hits);const after=renderFrame(painted,r.style,before.direction);
   const target=hits.flatMap((h,i)=>h&&original.triangles[h.triangle].partId===part?[i]:[]);assert.ok(target.length>0,`${before.direction}に頭部が見える`);
   assert.ok(target.some(at=>after.body[at]!==before.body[at]),`${before.direction}の頭部が色替えされる`);
   for(let at=0;at<4096;at++)if(!hits[at]||original.triangles[hits[at]!.triangle].partId!==part)assert.equal(after.body[at],before.body[at],'他部位・輪郭・背景を変更しない');
  }
 }
});
test('部位色の保存は旧形式と互換で、元モデル・部位・色・shade・容量の契約を守る',()=>{
 const base=buildMesh(box),old=emptySharedEdits(base),edits={...old,partColors:{body:{color:'#668653',shade:1}}},r=revision(base);r.sharedEdits=edits;
 assert.deepEqual(sharedEditsSchema.parse(old),old);assert.deepEqual(sharedEditsSchema.parse({version:1,paints:[],parts:{}}),{version:1,paints:[],parts:{}});
 assert.deepEqual(revisionSchema.parse(JSON.parse(JSON.stringify(r))).sharedEdits,edits);
 const parsed=sharedEditsSchema.parse(JSON.parse(JSON.stringify(edits)));assert.deepEqual(renderSet(applySharedEdits(base,parsed),r.style),renderSet(applySharedEdits(base,edits),r.style));
 for(const shade of [.62,1,1.2])assert.equal(sharedEditsSchema.safeParse({...edits,partColors:{body:{color:'#Aa00Ff',shade}}}).success,true);
 for(const color of ['red','#123','#12345678','#gg0000'])assert.equal(sharedEditsSchema.safeParse({...edits,partColors:{body:{color,shade:1}}}).success,false);
 for(const shade of [0,.8,2])assert.equal(sharedEditsSchema.safeParse({...edits,partColors:{body:{color:'#668653',shade}}}).success,false);
 assert.equal(sharedEditsSchema.safeParse({...edits,partColors:{body:{...edits.partColors.body,extra:true}}}).success,false);
 assert.equal(sharedEditsSchema.safeParse({...edits,source:undefined}).success,false);assert.throws(()=>applySharedEdits(base,{...edits,source:undefined}),/元モデル/);
 assert.throws(()=>applySharedEdits(base,{...edits,partColors:{missing:edits.partColors.body}}),/パーツ/);
 const changed=buildMesh({...box,parts:[{...box.parts[0],size:[1.1,1,1]}]});assert.throws(()=>applySharedEdits(changed,edits),/構造が変わ/);
 const partColors=Object.fromEntries(Array.from({length:200},(_,i)=>[`part-${i}`,edits.partColors.body]));assert.equal(sharedEditsSchema.safeParse({...old,partColors}).success,true);
 assert.equal(sharedEditsSchema.safeParse({...old,partColors:{...partColors,overflow:edits.partColors.body}}).success,false);
});
test('部位全体の色替えはテクスチャの透明部分とUV・骨格・関節ウェイトを維持する',()=>{
 const base=buildMesh(box);base.textures={coat:{width:2,height:1,data:new Uint8ClampedArray([255,255,255,0,255,255,255,255])}};base.skeleton=[{id:'root',pivot:[0,0,0]}];
 for(const t of base.triangles){t.texture='coat';t.uv=[[0,0],[1,0],[0,1]];t.weights=[[{bone:'root',weight:1}],[{bone:'root',weight:1}],[{bone:'root',weight:1}]];}
 const mesh=applySharedEdits(base,{...emptySharedEdits(base),partColors:{body:{color:'#64a0b5',shade:1}}});
 assert.deepEqual(mesh.textures,base.textures);assert.deepEqual(mesh.skeleton,base.skeleton);assert.deepEqual(mesh.parts,base.parts);
 assert.deepEqual(mesh.triangles.map(t=>[t.vertices,t.texture,t.uv,t.weights]),base.triangles.map(t=>[t.vertices,t.texture,t.uv,t.weights]));
 const style={...DEFAULT_STYLE,outline:false},opaque=renderSet({...base,textures:undefined},style),before=renderSet(base,style),after=renderSet(mesh,style);
 assert.ok(before.some((frame,i)=>frame.body.some((v,at)=>v===0&&opaque[i].body[at]!==0)),'元テクスチャに透明な穴がある');
 for(const [i,frame] of after.entries()){
  assert.notDeepEqual(frame.body,before[i].body);assert.deepEqual(frame.body.map(Boolean),before[i].body.map(Boolean),`${frame.direction}の透明な穴を埋めない`);
  assert.deepEqual(rgba(frame.body,style.palette).filter((_,at)=>at%4===3),rgba(before[i].body,style.palette).filter((_,at)=>at%4===3));
 }
});
