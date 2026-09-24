import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildMesh,renderSet,DEFAULT_STYLE,RENDERER_VERSION,clone,type Asset,type Revision} from '../lib/pixel';
import {SAMPLE_MODELS} from '../lib/sample-models';
import {assetSchema} from '../lib/contracts';
import {summarizeAsset,summaryPixels,summaryOutdated,revisionKind} from '../lib/asset-summary';
import {candidateFrom,reasonLabel,redrawCandidate} from '../lib/studio/revisions';

function fixture():Asset{
 const model=SAMPLE_MODELS[0],frames=renderSet(buildMesh(model),DEFAULT_STYLE);
 const revision:Revision={id:'source',rendererVersion:RENDERER_VERSION,createdAt:'2026-09-22T00:00:00Z',style:clone(DEFAULT_STYLE),frames,baseFrames:clone(frames),approved:true,reviewed:true,issues:'',mode:'eight',source:'sample',modelId:model.id,name:model.name,prompt:model.prompt,features:model.features,facing:0,size:1};
 return {id:'asset',projectId:'project',name:'検証',version:1,updatedAt:'2026-09-22T00:00:00Z',revisions:[revision]};
}

test('新しい候補は元の版を親に持ち、未採用で作成理由を保存できる',()=>{
 const asset=fixture(),source=asset.revisions[0],candidate=candidateFrom(source,'duplicate');
 assert.equal(candidate.parentRevisionId,'source');assert.equal(candidate.approved,false);assert.equal(candidate.reviewed,false);assert.equal(candidate.reason,'duplicate');
 assert.notEqual(candidate.id,source.id);
 candidate.frames[0].body[0]=5;assert.notEqual(source.frames[0].body[0],5,'元の版の画素を共有しない');
 const parsed=assetSchema.parse({...asset,revisions:[source,candidate]});
 assert.equal(parsed.revisions[1].reason,'duplicate','作成理由は保存時に落ちない');
 assert.equal(reasonLabel(candidate,[source,candidate]),'版1を複製');
});

test('作成理由が無い旧データは、親との違いから理由を推定する',()=>{
 const asset=fixture(),source=asset.revisions[0];
 const restyled={...clone(source),id:'restyled',parentRevisionId:'source',style:{...clone(source.style),id:'style-2'}};
 assert.equal(reasonLabel(source,[source]),'サンプルから作成');
 assert.equal(reasonLabel(restyled,[source,restyled]),'版1から新しいスタイルで再描画');
});

test('1方向の描き直しは他の方向の手修正を残し、新スタイルでの描き直しは理由を restyle にする',()=>{
 const asset=fixture(),source=clone(asset.revisions[0]),mesh=buildMesh(SAMPLE_MODELS[0]);
 source.frames[1].body[2000]=7;
 const one=redrawCandidate(source,mesh,'direction',{style:source.style,size:1,facing:0,direction:'S'});
 assert.equal(one.reason,'redraw-direction');assert.equal(one.frames[1].body[2000],7,'描き直さない方向の手修正を保持');
 const next=redrawCandidate(source,mesh,'all',{style:{...clone(DEFAULT_STYLE),id:'style-2',light:135},size:1,facing:0,direction:'S'});
 assert.equal(next.reason,'restyle');assert.equal(next.style.id,'style-2');assert.equal(next.rendererVersion,RENDERER_VERSION);
});

test('一覧用の要約は最新版の正面・状態・種類を持ち、画素を復元できる',()=>{
 const asset=fixture(),summary=summarizeAsset(asset),front=asset.revisions[0].frames[0];
 assert.equal(summary.kind,'humanoid');assert.equal(summary.approved,true);assert.equal(summary.revisions,1);assert.equal(summary.styleId,DEFAULT_STYLE.id);
 assert.equal(summaryOutdated(summary),false);
 const pixels=summaryPixels(summary);assert.equal(pixels.length,4096);
 assert.deepEqual(pixels,front.body.map((b,i)=>b||front.shadow[i]),'物体と影を合成した正面');
 assert.equal(revisionKind({...asset.revisions[0],modelId:'travel-chest',rigKind:undefined}),'prop');
});
