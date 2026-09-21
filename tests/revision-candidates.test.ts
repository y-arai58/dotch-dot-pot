import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sharedCandidateAsset} from '../lib/revision-candidates';
import {buildMesh,renderSet,DEFAULT_STYLE,clone,type Asset,type Revision} from '../lib/pixel';
import {SAMPLE_MODELS} from '../lib/sample-models';

function fixture():Asset{
 const model=SAMPLE_MODELS[0],frames=renderSet(buildMesh(model),DEFAULT_STYLE);
 const revision:Revision={id:'source',createdAt:'2026-09-22T00:00:00Z',style:clone(DEFAULT_STYLE),frames,baseFrames:clone(frames),approved:false,reviewed:true,issues:'既存の確認事項',mode:'eight',source:'sample',modelId:model.id,name:model.name,prompt:model.prompt,features:model.features,facing:0,size:1};
 return {id:'asset',projectId:'project',name:'検証',version:3,updatedAt:'2026-09-22T00:00:00Z',revisions:[revision]};
}
test('未保存の修正を新候補へ引き継いでも、保存済みの元版は全方向と設定を保持する',()=>{
 const saved=fixture(),original=clone(saved),draft=clone(saved);
 draft.revisions[0].frames[0].body[100]=20;draft.revisions[0].reviewed=false;
 const candidate={...clone(draft.revisions[0]),id:'next',parentRevisionId:'source'};
 const next=sharedCandidateAsset(saved,draft,candidate);
 assert.deepEqual(next.revisions[0],original.revisions[0]);assert.deepEqual(next.revisions[1],candidate);assert.deepEqual(saved,original);
 next.revisions[1].frames[0].body[100]=19;next.revisions[1].style.palette[0]='#123456';
 assert.deepEqual(next.revisions[0],original.revisions[0],'新候補の後続編集でも元版は変わらない');assert.equal(candidate.frames[0].body[100],20);
 // A subsequent branch uses the latest successful save, not the initial asset.
 const resaved={...clone(next),version:4},nextDraft=clone(resaved);nextDraft.revisions[1].frames[4].body[100]=18;
 const third={...clone(nextDraft.revisions[1]),id:'third',parentRevisionId:'next'};
 const again=sharedCandidateAsset(resaved,nextDraft,third);
 assert.deepEqual(again.revisions.slice(0,2),resaved.revisions);assert.equal(again.revisions[2].frames[4].body[100],18);
 assert.equal(sharedCandidateAsset({...saved,projectId:'demo',version:0},{...draft,projectId:'demo',version:0},candidate).revisions[0].frames[0].body[100],original.revisions[0].frames[0].body[100],'サンプルでも同じ保護を適用');
});
test('別アセット・保存競合・不明な親・上限では、元版を変更せず新候補の作成を止める',()=>{
 const saved=fixture(),original=clone(saved),candidate={...clone(saved.revisions[0]),id:'next',parentRevisionId:'source'};
 for(const draft of [{...saved,id:'another'},{...saved,projectId:'another'},{...saved,version:4}])assert.throws(()=>sharedCandidateAsset(saved,draft,candidate));
 assert.throws(()=>sharedCandidateAsset(saved,saved,{...candidate,parentRevisionId:'missing'}));
 assert.throws(()=>sharedCandidateAsset(saved,saved,{...candidate,id:'source'}));
 const full={...saved,revisions:[...saved.revisions,...Array.from({length:19},(_,i)=>({...clone(candidate),id:'other-'+i}))]};
 assert.throws(()=>sharedCandidateAsset(full,full,candidate),/20版/);assert.deepEqual(saved,original);
});
