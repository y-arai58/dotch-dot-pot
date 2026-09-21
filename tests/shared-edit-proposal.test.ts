import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildMesh,clone,DEFAULT_STYLE,renderFrame,renderSet,type Mesh,type Revision,type SurfaceHit,type V3} from '../lib/pixel';
import {applySharedEdits,captureSurfacePaint,emptySharedEdits} from '../lib/shared-edits';
import {sharedEditProposal,frameDifference,type SharedMethod} from '../lib/shared-edit-proposal';
import {sharedEditsSchema} from '../lib/shared-edits-schema';
import {revisionSchema} from '../lib/contracts';
import {partLabel} from '../lib/part-labels';
import {animalRig,animalPose,animalPoseMesh,animalClips} from '../lib/animal-animation';
import {parseAnimal} from '../lib/animal-contracts';
import animalSamples from '../lib/animal-samples.json';

const box={id:'box',name:'箱',prompt:'',features:[],parts:[{id:'body',shape:'box' as const,position:[0,0,1] as V3,size:[1,1,1] as V3,color:'#718096'}]};
function revision(mesh:Mesh):Revision{const style=clone(DEFAULT_STYLE),frames=renderSet(mesh,style);return {id:'source',createdAt:'2026-09-22T00:00:00Z',name:'牛',prompt:'牛',features:[],modelId:'box',source:'sample',mode:'eight',facing:0,size:1,style,frames,baseFrames:clone(frames),approved:false,reviewed:false,issues:''};}
function hitsFor(mesh:Mesh,r:Revision){const hits:(SurfaceHit|undefined)[]=[];renderFrame(mesh,r.style,'S',1,0,hits);return hits;}
function proposal(base:Mesh,r:Revision,method:SharedMethod,preserveSource=true){return sharedEditProposal(base,r,'S',{method,preserveSource,choices:{},parts:{}});}

test('全反映方法で修正元の描いた状態を保持し、候補の作成・変更が元の版に影響しない',()=>{
 const base=buildMesh(box),r=revision(base),points=hitsFor(base,r).flatMap((h,i)=>h?[i]:[]);assert.ok(points.length>10);
 r.frames[0].body[points[4]]=7; // A white marking on the same part as the new color.
 r.sharedEdits={...emptySharedEdits(base),paints:captureSurfacePaint(base,r,'S').paints};
 r.frames=renderSet(applySharedEdits(base,r.sharedEdits),r.style);r.baseFrames=clone(r.frames);
 r.frames[0].body[points[8]]=10;r.frames[0].body[points[9]]=0;r.frames[0].body[0]=20;r.frames[0].shadow[1]=1;r.frames[2].body[0]=19;
 const original=clone(r),originalMesh=clone(base);
 for(const method of ['surface','color','part'] as const){
  const result=proposal(base,r,method);
  assert.deepEqual(result.frames[0],r.frames[0],method+'は修正元の画素を変えない');
  assert.equal(frameDifference(r.frames[0],result.frames[0]).count,0);
  assert.ok(result.sourceOnly>=3,'輪郭・削除・影は静止画の保持として数える');
  assert.equal(result.frames[2].body[0],19,'別方向の手修正も新候補に保持する');
  assert.equal(result.baseFrames[0].body[points[4]],r.frames[0].body[points[4]],'白い模様を3D表面にも残す');
  assert.equal(result.baseFrames[0].body[points[8]],10,'描いた色を3D表面にも残す');
  assert.ok(result.frames.slice(1).some((f,i)=>frameDifference(r.frames[i+1],f).count>0),'他の方向へ反映する');
  assert.deepEqual(revisionSchema.parse({...r,sharedEdits:result.edits}).sharedEdits,result.edits);
  result.frames[0].body[0]=9;result.edits.parts.body={offset:[1,0,0],scale:[1,1,1]};
  assert.deepEqual(r,original,'候補から元の版へ参照が漏れない');assert.deepEqual(base,originalMesh);
 }
});

test('修正元の保持を明示的に解除すると部位全体を塗り替え、形状調整中は元の形に固定しない',()=>{
 const base=buildMesh(box),r=revision(base),at=hitsFor(base,r).findIndex(Boolean);r.frames[0].body[at]=10;
 const unlocked=proposal(base,r,'part',false);assert.equal(unlocked.preserveSource,false);assert.ok(frameDifference(r.frames[0],unlocked.frames[0]).count>1);
 const resized=sharedEditProposal(base,r,'S',{method:'surface',preserveSource:true,choices:{},parts:{body:{offset:[.1,0,0],scale:[1.2,1,1]}}});
 assert.equal(resized.shapeChanged,true);assert.equal(resized.preserveSource,false);assert.ok(frameDifference(r.frames[0],resized.frames[0]).count>1);
});

test('同じ部位の地色だけを変更して白い材質・既存の表面模様を全8方向で保持する',()=>{
 const base=buildMesh(box);for(const [i,t] of base.triangles.entries())if(i%2===0)t.color='#ffffff';
 const r=revision(base),hits=hitsFor(base,r),white=hits.findIndex(h=>h?.materialColor==='#ffffff'),grey=hits.flatMap((h,i)=>h?.materialColor==='#718096'?[i]:[]);
 assert.ok(white>=0&&grey.length>10);r.frames[0].body[grey[3]]=20;
 r.sharedEdits={...emptySharedEdits(base),paints:captureSurfacePaint(base,r,'S').paints};
 const before=applySharedEdits(base,r.sharedEdits);r.frames=renderSet(before,r.style);r.baseFrames=clone(r.frames);r.frames[0].body[grey[8]]=10;
 const result=proposal(base,r,'color',false);assert.equal(result.edits.colorReplacements?.body[0].from,'#718096');assert.deepEqual(result.edits.paints,r.sharedEdits.paints);
 for(const frame of r.baseFrames){
  const surface:(SurfaceHit|undefined)[]=[];renderFrame(before,r.style,frame.direction,1,0,surface);
  const after=result.frames.find(f=>f.direction===frame.direction)!;
  const eligible=surface.flatMap((h,i)=>h?.materialColor==='#718096'&&!h.surfacePaint?[i]:[]);assert.ok(eligible.some(i=>after.body[i]!==frame.body[i]),frame.direction+'の地色を変更する');
  for(const [i,h] of surface.entries())if(h&&(h.materialColor==='#ffffff'||h.surfacePaint))assert.equal(after.body[i],frame.body[i],frame.direction+'の白い部分と模様を残す');
 }
 assert.equal(result.frames[0].body[grey[3]],20);
 const reloaded=sharedEditsSchema.parse(JSON.parse(JSON.stringify(result.edits)));
 assert.deepEqual(renderSet(applySharedEdits(base,reloaded),r.style),result.baseFrames,'保存・再読み込みで地色と模様を保持する');
});

test('模様の上だけの描き直しは地色の変更対象に含めず、表面反映で描き直せる',()=>{
 const base=buildMesh(box),r=revision(base),at=hitsFor(base,r).findIndex(Boolean);r.frames[0].body[at]=20;
 r.sharedEdits={...emptySharedEdits(base),paints:captureSurfacePaint(base,r,'S').paints};r.frames=renderSet(applySharedEdits(base,r.sharedEdits),r.style);r.baseFrames=clone(r.frames);r.frames[0].body[at]=32;
 const color=proposal(base,r,'color');assert.equal(color.captured.parts.proposals[0].materials.length,0);assert.equal(color.transferred.length,0);assert.equal(color.edits.colorReplacements,undefined);
 const surface=proposal(base,r,'surface');assert.equal(surface.baseFrames[0].body[at],32);
});

test('選択した地色とその照明から色を置き換え、繰り返した色替えと継承プロパティ名の部位にも対応する',()=>{
 const base=buildMesh({...box,parts:[{...box.parts[0],id:'constructor'}]}),r=revision(base);for(const [i,t] of base.triangles.entries())if(i%2===0)t.color='#ffffff';r.frames=renderSet(base,r.style);r.baseFrames=clone(r.frames);
 const hits=hitsFor(base,r),white=hits.findIndex(h=>h?.materialColor==='#ffffff'),grey=hits.findIndex(h=>h?.materialColor==='#718096');assert.ok(white>=0&&grey>=0);r.frames[0].body[white]=20;r.frames[0].body[grey]=32;
 const first=sharedEditProposal(base,r,'S',{method:'color',preserveSource:false,choices:{constructor:{from:'#ffffff',color:'#64a0b5'}},parts:{}});
 assert.equal(first.edits.colorReplacements?.[String("constructor")][0].from,'#ffffff');assert.equal(first.edits.colorReplacements?.[String("constructor")][0].shade,hits[white]!.shade);
 r.sharedEdits=first.edits;r.frames=clone(first.baseFrames);r.baseFrames=clone(first.baseFrames);const afterHits=hitsFor(first.mesh,r),at=afterHits.findIndex(h=>h?.materialColor==='#64a0b5');assert.ok(at>=0);r.frames[0].body[at]=20;
 const second=proposal(base,r,'color',false);assert.equal(second.edits.colorReplacements?.[String("constructor")][1].from,'#64a0b5');assert.equal(second.baseFrames[0].body[at],20);
});

test('テクスチャの対象色だけを置き換え、他の色・透明画素・関節の情報を維持する',()=>{
 const base=buildMesh({...box,parts:[{...box.parts[0],color:'#ffffff'}]});base.textures={coat:{width:3,height:1,data:new Uint8ClampedArray([113,128,150,255,255,255,255,255,0,0,0,0])}};
 for(const t of base.triangles){t.texture='coat';t.uv=[[0,0],[1,0],[0,1]];t.weights=[[{bone:'root',weight:1}],[{bone:'root',weight:1}],[{bone:'root',weight:1}]];}
 const mesh=applySharedEdits(base,{...emptySharedEdits(base),colorReplacements:{body:[{from:'#718096',color:'#64a0b5',shade:1}]}}),style={...DEFAULT_STYLE,outline:false};
 assert.deepEqual(mesh.triangles.map(t=>[t.vertices,t.texture,t.uv,t.weights]),base.triangles.map(t=>[t.vertices,t.texture,t.uv,t.weights]));
 for(const direction of ['S','SE','E','NE','N','NW','W','SW'] as const){const hits:(SurfaceHit|undefined)[]=[],before=renderFrame(base,style,direction,1,0,hits),after=renderFrame(mesh,style,direction);assert.deepEqual(after.body.map(Boolean),before.body.map(Boolean));assert.notDeepEqual(after.body,before.body);for(const [i,h] of hits.entries())if(h?.materialColor==='#ffffff')assert.equal(after.body[i],before.body[i]);}
});

test('修正元の表面に残した色・模様は歩行・しゃがみ・ジャンプでも関節について動く',()=>{
 const model=parseAnimal(animalSamples[0]),base=buildMesh(model),r=revision(base),part=model.parts.find(p=>p.bone==='head')!.id,hits=hitsFor(base,r),at=hits.findIndex(h=>h&&base.triangles[h.triangle].partId===part);assert.ok(at>=0);r.frames[0].body[at]=32;
 const result=proposal(base,r,'color'),rig=animalRig(model);assert.ok(result.edits.paints.length>0);assert.equal(result.baseFrames[0].body[at],32);
 for(const clip of animalClips()){
  const pose=animalPose(rig,clip,Math.floor(clip.frames/2)),posed=animalPoseMesh(result.mesh,rig,pose);
  assert.deepEqual(posed.triangles.map(t=>[t.sourceUV,t.paint,t.surfacePaint,t.colorReplacements]),result.mesh.triangles.map(t=>[t.sourceUV,t.paint,t.surfacePaint,t.colorReplacements]));
  assert.ok(posed.triangles.some((t,i)=>t.surfacePaint&&JSON.stringify(t.vertices)!==JSON.stringify(result.mesh.triangles[i].vertices)),clip.id+'の保持した模様も表面と移動する');
  assert.ok(renderSet(posed,r.style).every(f=>f.body.length===4096));
 }
});

test('色置き換えの保存契約は旧形式と互換で、不正な色・容量・部位・元モデルを拒否する',()=>{
 const base=buildMesh(box),old=emptySharedEdits(base),rule={from:'#718096',color:'#64a0b5',shade:1},edits={...old,colorReplacements:{body:[rule]}};
 assert.deepEqual(sharedEditsSchema.parse(old),old);assert.deepEqual(sharedEditsSchema.parse(edits),edits);
 for(const wrong of [{...rule,from:'red'},{...rule,color:'#gg0000'},{...rule,shade:.8},{...rule,extra:1}])assert.equal(sharedEditsSchema.safeParse({...old,colorReplacements:{body:[wrong]}}).success,false);
 for(const rules of [[],new Array(33).fill(rule)])assert.equal(sharedEditsSchema.safeParse({...old,colorReplacements:{body:rules}}).success,false);
 assert.equal(sharedEditsSchema.safeParse({...edits,source:undefined}).success,false);assert.throws(()=>applySharedEdits(base,{...edits,source:undefined}),/元モデル/);
 assert.throws(()=>applySharedEdits(base,{...old,colorReplacements:{missing:[rule]}}),/パーツ/);
 assert.throws(()=>applySharedEdits(buildMesh({...box,parts:[{...box.parts[0],size:[2,1,1]}]}),edits),/構造が変わ/);
 assert.equal(sharedEditsSchema.safeParse({...old,colorReplacements:Object.fromEntries(Array.from({length:201},(_,i)=>[String(i),[rule]]))}).success,false);
});

test('差分は描き込み後との追加・削除・色・影を数え、同一画素の変更を重複計上しない',()=>{
 const before=revision(buildMesh(box)).frames[0];before.body.fill(0);before.shadow.fill(0);before.body[1]=5;before.body[2]=5;before.shadow[3]=1;before.body[4]=5;before.shadow[4]=1;
 const after=clone(before);after.body[0]=5;after.body[1]=0;after.body[2]=6;after.shadow[3]=0;after.body[3]=1;after.body[4]=6;after.shadow[4]=0;
 const difference=frameDifference(before,after);assert.equal(difference.count,5);assert.deepEqual(difference.pixels.slice(0,6),[1,2,3,3,3,0]);assert.equal(frameDifference(before,before).count,0);
});

test('部位名は左右と前後を日本語で示し、牛の蹄と犬の足先を区別する',()=>{
 const cow={name:'牛',prompt:'白黒の乳牛',features:[]},dog={name:'柴犬',prompt:'犬',features:[]};
 assert.equal(partLabel({id:'front-left-ankle',name:'front-left-ankle'},cow),'左前脚の足首');
 assert.equal(partLabel({id:'front-left-paw',name:'front-left-paw'},cow),'左前脚の蹄');
 assert.equal(partLabel({id:'hind-right-paw',name:'hind-right-paw'},dog),'右後脚の足先');
 assert.equal(partLabel({id:'front-left-paw',name:'特別な蹄'},cow),'特別な蹄');
 assert.equal(partLabel({id:'body',name:'body'},cow),'胴体');assert.equal(partLabel({id:'thing-abc',name:'thing-abc'},cow,2),'パーツ 3');
});
