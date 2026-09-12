import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {generationRequestSchema,type GenerationRequest,type CreationArtifact,type GenerationActivity} from '../lib/generation';
import {connectedAccount,GenerationTimeoutError} from './codex-rpc';
import {generateCharacter} from './codex-runner';
type LocalJob={id:string;origin:string;digest:string;state:'running'|'ready'|'failed'|'cancelled';progress:number;activity?:GenerationActivity;error?:string;artifact?:CreationArtifact};
type Reference={side:string;data:string};
type Runner=(request:GenerationRequest,references:Reference[],directory:string,signal:AbortSignal,progress:(n:number,activity?:GenerationActivity)=>void)=>Promise<CreationArtifact>;
const publicJob=({origin,digest,...job}:LocalJob)=>job;
const publicError=(e:unknown)=>e instanceof GenerationTimeoutError?e.message:e instanceof Error&&/^(品質確認|生成を停止|この端末で codex login|Codexとの接続が切れ)/.test(e.message)?e.message.slice(0,1500):'Codexで作成を完了できませんでした。接続・ログイン・モデルの対応状況を確認してください';
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function startBridge({port=43117,origins=['https://dotforge-studio.y-arai-dev222.chatgpt.site','http://localhost:5173','http://localhost:5174'],directory=join(homedir(),'.dotforge'),runner=generateCharacter,status=connectedAccount}:{port?:number;origins?:string[];directory?:string;runner?:Runner;status?:typeof connectedAccount}={}){
 await mkdir(join(directory,'jobs'),{recursive:true,mode:0o700});
 const sessions=new Map<string,string>(),jobs=new Map<string,LocalJob>(),active=new Map<string,AbortController>();
 for(const id of await readdir(join(directory,'jobs'))){if(!/^[\w-]+$/.test(id))continue;try{const j=JSON.parse(await readFile(join(directory,'jobs',id,'job.json'),'utf8')) as LocalJob;const interrupted=j.state==='running';if(interrupted){j.state='failed';j.error='連携サービスが再起動しました。自動では再生成しません';}jobs.set(id,j);if(interrupted)await save(j);}catch{}}
 async function save(job:LocalJob){const dir=join(directory,'jobs',job.id);await mkdir(dir,{recursive:true,mode:0o700});const temp=join(dir,'job.tmp-'+randomBytes(6).toString('hex'));await writeFile(temp,JSON.stringify(job),{mode:0o600});await rename(temp,join(dir,'job.json'));}
 const respond=(res:ServerResponse,status:number,data:unknown)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
 const body=async(req:IncomingMessage)=>{if(req.headers['content-type']!=='application/json')throw Error('JSON_REQUIRED');let size=0;const chunks:Buffer[]=[];for await(const chunk of req){size+=chunk.length;if(size>43*1024*1024)throw Error('TOO_LARGE');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));};
 const server=createServer(async(req,res)=>{
  const origin=req.headers.origin||'',expectedHost=`127.0.0.1:${(server.address() as {port:number})?.port}`;
  if(req.headers.host!==expectedHost||!origins.includes(origin)){respond(res,403,{error:'この制作画面からは接続できません'});return;}
  res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');
  if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');res.setHeader('Access-Control-Allow-Private-Network','true');res.writeHead(204);res.end();return;}
  try{
   const path=new URL(req.url||'/',`http://${expectedHost}`).pathname;
   if(path==='/session'&&req.method==='POST'){await body(req);let token=sessions.get(origin);if(!token){token=randomBytes(32).toString('hex');sessions.set(origin,token);}respond(res,200,{token});return;}
   const token=sessions.get(origin),provided=req.headers.authorization?.replace(/^Bearer /,'')||'';
   if(!token||provided.length!==token.length||!timingSafeEqual(Buffer.from(provided),Buffer.from(token))){respond(res,401,{error:'Codexへ接続し直してください'});return;}
   if(path==='/status'&&req.method==='GET'){respond(res,200,await status());return;}
   const match=path.match(/^\/jobs\/([\w-]+)(\/cancel)?$/);
   if(match){const job=jobs.get(match[1]);if(!job||job.origin!==origin){respond(res,404,{error:'この端末に生成依頼がありません。依頼を再送するか停止してください'});return;}
    if(req.method==='GET'&&!match[2]){respond(res,200,publicJob(job));return;}
    if(req.method==='POST'&&match[2]){await body(req);if(job.state==='running'){job.state='cancelled';job.error='生成を停止しました';active.get(job.id)?.abort();await save(job);}respond(res,200,publicJob(job));return;}
   }
   if(path==='/jobs'&&req.method==='POST'){
    const input=await body(req),request=generationRequestSchema.parse(input.request),references=input.references as Reference[];
    if(!Array.isArray(references)||references.length!==request.referenceKeys.length||references.some((r,i)=>r.side!==request.referenceSides[i]||typeof r.data!=='string'||r.data.length>14*1024*1024||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(r.data))){respond(res,400,{error:'参照画像の形式を確認してください'});return;}
    const hash=digest(input),old=jobs.get(request.id);
    if(old){if(old.origin!==origin||old.digest!==hash){respond(res,409,{error:'同じ依頼IDの内容が一致しません'});return;}respond(res,200,publicJob(old));return;}
    if(active.size){respond(res,409,{error:'この端末で作成中です。完了を待ってください'});return;}
    const job:LocalJob={id:request.id,origin,digest:hash,state:'running',progress:0};jobs.set(job.id,job);const controller=new AbortController();active.set(job.id,controller);try{await save(job);}catch(e){active.delete(job.id);jobs.delete(job.id);throw e;}
    void runner(request,references,join(directory,'jobs',job.id),controller.signal,(n,activity)=>{if(job.state==='running'){job.progress=n;if(activity)job.activity=activity;}}).then(result=>{if(job.state==='running'){job.artifact=result;job.state='ready';job.progress=100;}}).catch(e=>{if(job.state==='running'){job.state='failed';job.error=publicError(e);}}).finally(async()=>{await save(job).catch(()=>{job.state='failed';job.error='結果を保存できませんでした';});active.delete(job.id);});
    respond(res,202,publicJob(job));return;
   }
   respond(res,404,{error:'この操作には対応していません'});
  }catch(e){respond(res,400,{error:'接続または入力内容を確認してください'});}
 });
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{server.off('error',reject);resolve();});});
 return {server,close:async()=>{for(const controller of active.values())controller.abort();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const instance=await startBridge({origins:process.env.DOTFORGE_ALLOWED_ORIGINS?.split(',').filter(Boolean),directory:process.env.DOTFORGE_HOME});
 console.log('Dotforge Codex bridge ready on http://127.0.0.1:43117 (loopback only)');
 for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{void instance.close().finally(()=>process.exit());});
}
