import assert from 'node:assert/strict';
import {DEFAULT_STYLE,clone} from '../lib/pixel';

const origin=process.env.TEST_ORIGIN||'http://localhost:5173';
assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname),'ローカル環境専用');
const login=await fetch(origin+'/signin-with-chatgpt?return_to=/',{redirect:'manual'});
const cookies=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
assert.ok(cookies,'ローカル認証cookieが得られる');
async function request(path:string,data?:unknown,cookie=cookies){
 const response=await fetch(origin+path,{method:data?'POST':'GET',headers:{...(cookie?{cookie}:{}),...(data?{'Content-Type':'application/json',Origin:origin}:{})},body:data?JSON.stringify(data):undefined});
 return {status:response.status,data:await response.json() as any};
}
const projectId=crypto.randomUUID(),style={...clone(DEFAULT_STYLE),id:crypto.randomUUID()};
assert.equal((await request('/api/studio',{action:'project',project:{id:projectId,name:'履歴の自動検証',styles:[style],version:0,updatedAt:new Date().toISOString()}})).status,200);
const generation={id:crypto.randomUUID(),projectId,skillId:'humanoid',name:'履歴テスト',prompt:'港の修理技師',features:[],mode:'eight',style,referenceKeys:[],referenceSides:[]};
const list=async()=>{
 const result=await request('/api/studio?projectId='+projectId);
 assert.equal(result.status,200,JSON.stringify(result.data));return result.data.jobs as {id:string;state:string}[];
};
for(const state of ['failed','cancelled']){
 const req={...generation,id:crypto.randomUUID()};
 assert.equal((await request('/api/generate',req)).status,200);
 for(const action of ['dismiss','restore'])assert.equal((await request('/api/generate',{action,id:req.id})).status,409,'作成中の依頼は変更しない');
 assert.equal((await request('/api/generate',{action:state==='failed'?'failed':'cancel',id:req.id,error:'検証用エラー'})).data.state,state);
 assert.ok((await list()).some(j=>j.id===req.id));
 assert.equal((await request('/api/generate',{action:'dismiss',id:req.id},'')).status,401,'ログイン必須');
 const dismissed=await request('/api/generate',{action:'dismiss',id:req.id});
 assert.equal(dismissed.status,200);assert.ok(dismissed.data.dismissedAt);assert.equal(dismissed.data.state,state);
 assert.equal((await request('/api/generate',{action:'dismiss',id:req.id})).status,200,'削除の再送は安全');
 assert.ok(!(await list()).some(j=>j.id===req.id),'再読込でも非表示');
 const resent=await request('/api/generate',req);
 assert.equal(resent.data.state,state,'元のIDを再送しても新たな生成を開始しない');assert.ok(resent.data.dismissedAt);
 assert.equal((await request('/api/generate',{action:'complete',id:req.id,artifact:{}})).status,409,'削除済み依頼の遅延完了を拒否');
 const restored=await request('/api/generate',{action:'restore',id:req.id});
 assert.equal(restored.status,200);assert.equal(restored.data.dismissedAt,null);assert.deepEqual(restored.data.request,req);
 assert.ok((await list()).some(j=>j.id===req.id&&j.state===state),'元の状態で一覧へ復元');
 assert.equal((await request('/api/generate',{action:'restore',id:req.id})).status,200,'復元の再送は安全');
}
assert.equal((await request('/api/generate',{action:'dismiss',id:crypto.randomUUID()})).status,404,'取得権限のないIDを変更しない');
// 非表示の履歴が20件を超えても、表示対象の古い依頼を押し出さない。
for(let i=0;i<21;i++){
 const id=crypto.randomUUID();
 assert.equal((await request('/api/generate',{...generation,id})).status,200);
 assert.equal((await request('/api/generate',{action:'failed',id})).status,200);
 assert.equal((await request('/api/generate',{action:'dismiss',id})).status,200);
}
assert.equal((await list()).length,2,'非表示の履歴を除外してから一覧の件数を制限する');
console.log('History integration passed: failed/cancelled dismissal, restore, persistent filtering, auth, active-job protection and idempotency.');
