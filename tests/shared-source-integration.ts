import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {buildMesh,renderFrame,renderSet,DEFAULT_STYLE,clone,RENDERER_VERSION,type Asset,type Revision,type SurfaceHit} from '../lib/pixel';
import {sharedEditProposal} from '../lib/shared-edit-proposal';
import samples from '../lib/animal-samples.json';
import {parseAnimal} from '../lib/animal-contracts';

const origin=process.env.TEST_ORIGIN||'http://localhost:5173';
assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname),'ローカル環境専用');
const login=await fetch(origin+'/signin-with-chatgpt?return_to=/',{redirect:'manual'}),cookie=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');assert.ok(cookie);
async function call(path:string,data?:unknown){const response=await fetch(origin+path,{method:data?'POST':'GET',headers:{cookie,...(data?{'Content-Type':'application/json',Origin:origin}:{})},body:data?JSON.stringify(data):undefined});return {status:response.status,data:await response.json() as any};}
const projectId=crypto.randomUUID(),assetId=crypto.randomUUID(),style={...clone(DEFAULT_STYLE),id:crypto.randomUUID()},model=parseAnimal(samples[0]),base=buildMesh(model),frames=renderSet(base,style);
assert.equal((await call('/api/studio',{action:'project',project:{id:projectId,name:'元の版の保護テスト',styles:[style],version:0,updatedAt:''}})).status,200);
const original:Revision={id:crypto.randomUUID(),createdAt:new Date().toISOString(),rendererVersion:RENDERER_VERSION,style,frames,baseFrames:clone(frames),approved:false,reviewed:false,issues:'',mode:'eight',source:'sample',rigKind:'quadruped',modelId:model.id,name:model.name,prompt:model.prompt,features:model.features,facing:0,size:1};
const initial=await call('/api/studio',{action:'asset',asset:{id:assetId,projectId,name:'元の版の保護テスト',revisions:[original],version:0,updatedAt:''}});assert.equal(initial.status,200,JSON.stringify(initial.data));
const saved=initial.data as Asset,draft=clone(saved),source=draft.revisions[0],hits:(SurfaceHit|undefined)[]=[];
renderFrame(base,style,'S',1,0,hits);const at=hits.findIndex(h=>h&&base.triangles[h.triangle].partId===model.parts.find(p=>p.bone==='head')!.id);assert.ok(at>=0);source.frames[0].body[at]=source.frames[0].body[at]===20?32:20;
// An unshared edit must survive in the new candidate without overwriting its source revision.
source.frames[4].body[0]=19;
const preview=sharedEditProposal(base,source,'S',{method:'color',preserveSource:true,choices:{},parts:{}}),edits=preview.edits;
assert.ok(preview.transferred.length>0,'実際の色変更を新候補に反映する');
assert.ok(Object.keys(edits.colorReplacements||{}).length>0,'模様を残す色置き換えを保存する');
assert.deepEqual(preview.frames[0],source.frames[0],'修正元は描き込み後と一致する');
const candidate:Revision={...clone(source),id:crypto.randomUUID(),parentRevisionId:source.id,sharedEdits:edits,frames:preview.frames,baseFrames:preview.baseFrames};
// Regression: the old UI submitted the painted original and candidate together.
const overwrite=await call('/api/studio',{action:'asset',asset:{...draft,revisions:[source,candidate]}});
assert.equal(overwrite.status,400,'新候補の追加で未採用の元版を同時に上書きしない');
assert.deepEqual((await call('/api/studio?assetId='+assetId)).data,saved,'拒否時に保存内容を変更しない');
const next={...saved,revisions:[...saved.revisions,candidate]};
const result=await call('/api/studio',{action:'asset',asset:next});assert.equal(result.status,200,JSON.stringify(result.data));
const reloaded=(await call('/api/studio?assetId='+assetId)).data as Asset;
assert.deepEqual(reloaded.revisions[0],saved.revisions[0],'未採用の元版も全方向・色・設定を保持');
assert.deepEqual(reloaded.revisions[1].sharedEdits,candidate.sharedEdits,'地色の置き換えと表面の保持を復元する');
assert.deepEqual(reloaded.revisions[1].frames,candidate.frames,'新候補だけに修正を保存');assert.equal(reloaded.revisions[1].frames[4].body[0],19,'共有対象外の描き込みも新候補に保持');
assert.equal((await call('/api/studio',{action:'asset',asset:next})).status,409,'古い保存版からの再送は競合として拒否');
// Saving a drawing explicitly remains supported, without adding a candidate.
const explicitSave=clone(reloaded);explicitSave.revisions[1].frames[0].body[0]=18;
assert.equal((await call('/api/studio',{action:'asset',asset:explicitSave})).status,200,'明示的な保存は現在の候補を更新できる');
writeFileSync('/private/tmp/dotch-source-test-records.json',JSON.stringify({projectId,assetId,originalId:original.id,candidateId:candidate.id}));
console.log('Shared source integration passed: unapproved source preservation, separate candidate, local edits, reload, CAS and explicit save.');
