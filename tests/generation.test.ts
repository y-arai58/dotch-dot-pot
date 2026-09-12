import {test} from 'node:test';
import {request as httpRequest} from 'node:http';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {startBridge} from '../scripts/codex-bridge';
import {inspectHumanoid,artifact} from '../scripts/humanoid-quality';
import {generationRequestSchema,parseHumanoid} from '../lib/generation';
import {DEFAULT_STYLE,clone} from '../lib/pixel';
import samples from '../lib/animation-samples.json';

const request={id:'character-1',projectId:'project-1',skillId:'humanoid',name:'テスト',prompt:'港町の修理技師',features:['ゴーグル'],mode:'eight',style:DEFAULT_STYLE,referenceKeys:[],referenceSides:[]};
test('人型専用の入力契約は別skill・任意実行入力・欠けた骨・重複パーツを拒否',()=>{
 assert.ok(generationRequestSchema.safeParse(request).success);
 assert.equal(generationRequestSchema.safeParse({...request,skillId:'bird'}).success,false);
 assert.equal(generationRequestSchema.safeParse({...request,command:'run arbitrary code'}).success,false);
 const model=clone(samples[0]);model.rig.bones.pop();assert.throws(()=>parseHumanoid(model));
 const dup=clone(samples[0]);dup.parts.push(dup.parts[0]);assert.throws(()=>parseHumanoid(dup),/重複/);
});
test('人型skillの両基準モデルは344枚の検査に合格し、不正モデルと中止は受理しない',async()=>{
 for(const sample of samples){const out=await mkdtemp(join(tmpdir(),'dotforge-quality-'));const checked=await inspectHumanoid(sample,DEFAULT_STYLE,out);assert.equal(checked.validation.frames,344);assert.deepEqual(checked.validation.issues,[]);const png=await readFile(join(out,'walk.png'));assert.equal(png.readUInt32BE(16),512);assert.equal(png.readUInt32BE(20),12*64);}
 const controller=new AbortController();controller.abort();await assert.rejects(()=>inspectHumanoid(samples[0],DEFAULT_STYLE,join(tmpdir(),'dotforge-abort-check'),controller.signal),/停止/);
});
test('bridgeはOrigin/Host/接続認証を検証し、同じ依頼の再送は一度だけ実行して結果を復元',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'dotforge-bridge-')),origin='https://studio.example';let calls=0,release!:()=>void;
 const gate=new Promise<void>(r=>{release=r;});const model=parseHumanoid(samples[0]);
 const options={port:0,origins:[origin],directory,runner:async()=>{calls++;await gate;return artifact(model,{renderer:'test',motion:'test',frames:344,issues:[]},'test visual review');},status:async()=>({ready:true,message:'test'})};
 let instance=await startBridge(options);let url=`http://127.0.0.1:${(instance.server.address() as any).port}`,token='';
 const call=async(path:string,data?:unknown,headers:Record<string,string>={})=>fetch(url+path,{method:data?'POST':'GET',headers:{Origin:origin,...(data?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{}),...headers},body:data?JSON.stringify(data):undefined});
 try{
  assert.equal((await call('/status')).status,401);assert.equal((await call('/session',{}, {Origin:'https://evil.example'})).status,403);const badHost=await new Promise<number|undefined>((resolve,reject)=>{const req=httpRequest(url+'/session',{method:'POST',headers:{Origin:origin,Host:'evil.example','Content-Type':'application/json'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end('{}');});assert.equal(badHost,403);
  token=((await (await call('/session',{})).json()) as any).token;assert.equal((await call('/status')).status,200);
  assert.equal((await call('/jobs',{request,references:[]})).status,202);
  assert.equal((await call('/jobs',{request,references:[]})).status,200);assert.equal(calls,1);
  assert.equal((await call('/jobs',{request:{...request,prompt:'changed'},references:[]})).status,409);
  release();await new Promise(r=>setTimeout(r,30));const result=await (await call('/jobs/character-1')).json() as any;assert.equal(result.state,'ready');assert.equal(result.artifact.model.id,model.id);
  await instance.close();instance=await startBridge(options);url=`http://127.0.0.1:${(instance.server.address() as any).port}`;
  assert.equal((await call('/status')).status,401);token=((await (await call('/session',{})).json()) as any).token;
  assert.equal(((await (await call('/jobs/character-1')).json()) as any).state,'ready');assert.equal(calls,1);
 }finally{release();await instance.close();}
});
test('bridgeの停止はrunnerへ伝わり、結果で停止状態を上書きしない',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'dotforge-cancel-')),origin='https://studio.example';let aborted=false;
 const instance=await startBridge({port:0,origins:[origin],directory,runner:async(_r,_refs,_dir,signal)=>new Promise((_ok,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(Error('stopped'));})),status:async()=>({ready:true,message:'test'})});
 const url=`http://127.0.0.1:${(instance.server.address() as any).port}`;
 const headers={Origin:origin,'Content-Type':'application/json',Authorization:''};const post=async(path:string,body:unknown)=>fetch(url+path,{method:'POST',headers,body:JSON.stringify(body)});
 try{headers.Authorization='Bearer '+((await (await post('/session',{})).json()) as any).token;await post('/jobs',{request,references:[]});assert.equal(((await (await post('/jobs/character-1/cancel',{})).json()) as any).state,'cancelled');assert.ok(aborted);}finally{await instance.close();}
});
test('bridgeは最初の保存失敗後に生成枠を解放する',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'dotforge-save-fail-')),origin='https://studio.example';let calls=0;
 await mkdir(join(directory,'jobs'),{recursive:true});await writeFile(join(directory,'jobs','character-1'),'not a directory');
 const instance=await startBridge({port:0,origins:[origin],directory,runner:async()=>{calls++;throw Error('test');},status:async()=>({ready:true,message:'test'})});
 const url=`http://127.0.0.1:${(instance.server.address() as any).port}`,headers={Origin:origin,'Content-Type':'application/json',Authorization:''};const post=async(path:string,body:unknown)=>fetch(url+path,{method:'POST',headers,body:JSON.stringify(body)});
 try{headers.Authorization='Bearer '+((await (await post('/session',{})).json()) as any).token;assert.equal((await post('/jobs',{request,references:[]})).status,400);assert.equal((await post('/jobs',{request:{...request,id:'character-2'},references:[]})).status,202);assert.equal(calls,1);}finally{await instance.close();}
});
