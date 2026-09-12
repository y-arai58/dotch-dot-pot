import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runCodexTurn,GenerationTimeoutError} from '../scripts/codex-rpc';

function transport(delayed=false){
 const listeners=new Set<(event:any)=>void>(),calls:{method:string;params:any}[]=[];
 let release!:(value:any)=>void;
 const start=new Promise(resolve=>{release=resolve;});
 return {calls,listeners,release:()=>release({turn:{id:'turn-1'}}),
  request:async(method:string,params:unknown)=>{calls.push({method,params});return method==='turn/start'?(delayed?start:{turn:{id:'turn-1'}}):{};},
  onNotification:(listener:(event:any)=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},
  emit:(method:string,params:Record<string,unknown>={})=>{for(const listener of listeners)listener({method,params:{threadId:'thread-1',turnId:'turn-1',...params}});},
 };
}
const minute=60_000;
test('応答が続く生成は旧12分上限を越えて完了し、最終itemのJSONを返す',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const rpc=transport(),activity:string[]=[];
 const result=runCodexTurn(rpc,'thread-1',[],{},new AbortController().signal,{onActivity:event=>activity.push(event)});
 await Promise.resolve();
 for(let n=0;n<4;n++){t.mock.timers.tick(10*minute);rpc.emit('item/agentMessage/delta',{delta:'partial JSON'});}
 rpc.emit('item/completed',{item:{type:'agentMessage',text:'{"valid":true}'}});
 rpc.emit('turn/completed',{turn:{id:'turn-1',status:'completed',items:[]}});
 assert.equal(await result,'{"valid":true}');assert.equal(rpc.calls.filter(c=>c.method==='turn/interrupt').length,0);
 assert.equal(rpc.listeners.size,0);assert.ok(activity.includes('item/agentMessage/delta'));
 t.mock.timers.tick(60*minute);assert.equal(rpc.calls.length,1);
});
test('他タスク・別turn・一般通知では待機を延長せず、無応答を取消と区別する',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const rpc=transport();
 const result=runCodexTurn(rpc,'thread-1',[],{},new AbortController().signal);
 const rejected=assert.rejects(result,(e:unknown)=>e instanceof GenerationTimeoutError&&e.reason==='idle'&&!e.message.includes('生成を停止しました'));
 await Promise.resolve();t.mock.timers.tick(19*minute);
 rpc.emit('item/agentMessage/delta',{threadId:'another-thread',delta:'x'});
 rpc.emit('item/agentMessage/delta',{turnId:'another-turn',delta:'x'});
 rpc.emit('thread/status/changed');t.mock.timers.tick(minute);
 await rejected;assert.equal(rpc.calls.filter(c=>c.method==='turn/interrupt').length,1);assert.equal(rpc.listeners.size,0);
});
test('応答が続いても1工程60分で専用の上限エラーを返す',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const rpc=transport();
 const result=runCodexTurn(rpc,'thread-1',[],{},new AbortController().signal);
 const rejected=assert.rejects(result,(e:unknown)=>e instanceof GenerationTimeoutError&&e.reason==='deadline');
 await Promise.resolve();for(let n=0;n<5;n++){t.mock.timers.tick(10*minute);rpc.emit('item/reasoning/summaryTextDelta',{delta:'not retained'});}
 t.mock.timers.tick(10*minute);await rejected;assert.equal(rpc.calls.filter(c=>c.method==='turn/interrupt').length,1);
});
for(const reason of ['cancel','timeout'] as const)test(`${reason}: turn/start応答前の停止も遅れて届くturnへ一度だけ伝える`,async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const rpc=transport(true),controller=new AbortController();
 const result=runCodexTurn(rpc,'thread-1',[],{},controller.signal);
 const rejected=assert.rejects(result,reason==='cancel'?/生成を停止しました/:/応答が20分間途絶え/);
 if(reason==='cancel')controller.abort();else t.mock.timers.tick(20*minute);
 await rejected;assert.equal(rpc.calls.length,1);rpc.release();await new Promise<void>(resolve=>setImmediate(resolve));
 assert.deepEqual(rpc.calls[1],{method:'turn/interrupt',params:{threadId:'thread-1',turnId:'turn-1'}});
 rpc.emit('turn/completed',{turn:{id:'turn-1',status:'completed',items:[{type:'agentMessage',text:'late'}]}});
 t.mock.timers.tick(60*minute);assert.equal(rpc.calls.length,2);
});
test('切断で待機を解放し、既に取消済みの依頼は開始しない',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const rpc=transport();
 const result=runCodexTurn(rpc,'thread-1',[],{},new AbortController().signal);const rejected=assert.rejects(result,/接続が切れ/);
 rpc.emit('bridge/closed');await rejected;assert.equal(rpc.listeners.size,0);
 const controller=new AbortController();controller.abort();await assert.rejects(runCodexTurn(rpc,'thread-1',[],{},controller.signal),/停止/);assert.equal(rpc.calls.length,1);
});
