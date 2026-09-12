import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {existsSync} from 'node:fs';
export const codexBinary=()=>process.env.DOTFORGE_CODEX_BIN||(['/Applications/ChatGPT.app/Contents/Resources/codex','/Applications/Codex.app/Contents/Resources/codex'].find(existsSync))||'codex';

export const CODEX_OVERRIDES=['model_reasoning_effort="high"','web_search="disabled"','tools.view_image=false',...['shell_tool','unified_exec','shell_snapshot','apps','plugins','browser_use','browser_use_external','in_app_browser','computer_use','image_generation','multi_agent','hooks','plugin_hooks','skill_mcp_dependency_install'].map(name=>`features.${name}=false`)];
export class CodexRpc{
 private process:ChildProcessWithoutNullStreams;
 private sequence=0;
 private pending=new Map<number,{resolve:(v:any)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
 private listeners=new Set<(message:any)=>void>();
 private closed=false;
 constructor(binary=codexBinary()){
  this.process=spawn(binary,[...CODEX_OVERRIDES.flatMap(v=>['-c',v]),'app-server','--listen','stdio://'],{stdio:'pipe',env:{...process.env}});
  // Do not forward stderr: local config or provider errors may contain sensitive values.
  this.process.stderr.resume();
  this.process.on('error',()=>this.closeWithError(new Error('Codexを起動できません。codexのインストールとDOTFORGE_CODEX_BINを確認してください')));
  this.process.on('exit',()=>this.closeWithError(new Error('Codexとの接続が終了しました')));
  createInterface({input:this.process.stdout}).on('line',line=>{
   let message:any;try{message=JSON.parse(line);}catch{return;}
   if(message.method&&message.id!==undefined){this.process.stdin.write(JSON.stringify({id:message.id,error:{code:-32601,message:'Interactive tools and approvals are unavailable in Dotforge.'}})+'\n');return;}
   if(message.id!==undefined){const p=this.pending.get(message.id);if(!p)return;clearTimeout(p.timer);this.pending.delete(message.id);if(message.error)p.reject(new Error(String(message.error.message).slice(0,1000)));else p.resolve(message.result);return;}
   for(const listener of this.listeners)listener(message);
  });
 }
 async initialize(){await this.request('initialize',{clientInfo:{name:'dotforge_bridge',title:'Dotforge',version:'1.0.0'}});this.process.stdin.write(JSON.stringify({method:'initialized',params:{}})+'\n');}
 request(method:string,params:unknown,timeout=30000):Promise<any>{if(this.closed)return Promise.reject(new Error('Codexに接続されていません'));const id=++this.sequence;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Codexからの応答がタイムアウトしました'));},timeout);this.pending.set(id,{resolve,reject,timer});this.process.stdin.write(JSON.stringify({id,method,params})+'\n');});}
 onNotification(listener:(message:any)=>void){this.listeners.add(listener);return()=>this.listeners.delete(listener);}
 private closeWithError(error:Error){if(this.closed)return;this.closed=true;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();for(const listener of this.listeners)listener({method:'bridge/closed'});}
 close(){this.closeWithError(new Error('Codex接続を終了しました'));this.process.kill();}
 async turn(threadId:string,input:unknown[],outputSchema:unknown,signal:AbortSignal):Promise<string>{
  let turnId:string|undefined;let finalText='';
  return new Promise((resolve,reject)=>{
   let settled=false;
   const finish=(error?:Error)=>{if(settled)return;settled=true;clearTimeout(timer);off();signal.removeEventListener('abort',abort);error?reject(error):resolve(finalText);};
   const abort=()=>{if(turnId)void this.request('turn/interrupt',{threadId,turnId}).catch(()=>{});finish(new Error('生成を停止しました'));};
   const timer=setTimeout(()=>{abort();},12*60*1000);
   const off=this.onNotification(m=>{
    if(m.method==='bridge/closed'){finish(new Error('Codexとの接続が切れました。自動では再生成しません'));return;}
    if(m.params?.threadId!==threadId)return;
    if(m.method==='turn/started')turnId=m.params.turn.id;
    if(m.method==='item/completed'&&m.params.item.type==='agentMessage')finalText=m.params.item.text;
    if(m.method==='turn/completed'){const turn=m.params.turn;const fromItems=turn.items?.filter((i:any)=>i.type==='agentMessage').at(-1)?.text;if(fromItems)finalText=fromItems;finish(turn.status==='completed'&&finalText?undefined:new Error(turn.error?.message||'生成が完了しませんでした'));}
   });
   signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return;}
   void this.request('turn/start',{threadId,input,outputSchema,approvalPolicy:'never',sandboxPolicy:{type:'readOnly',networkAccess:false}}).then(result=>{turnId=result.turn.id;if(signal.aborted)void this.request('turn/interrupt',{threadId,turnId}).catch(()=>{});}).catch(e=>finish(e));
  });
 }
}
export const textInput=(text:string)=>({type:'text',text,text_elements:[]});
export async function connectedAccount(){const rpc=new CodexRpc();try{await rpc.initialize();const response=await rpc.request('account/read',{refreshToken:false});return {ready:!!response.account,message:response.account?'Codexに接続済み':'この端末で codex login を完了してください'};}finally{rpc.close();}}
