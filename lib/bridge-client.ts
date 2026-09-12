import type {GenerationRequest,CreationArtifact,GenerationActivity} from './generation';
export const BRIDGE_ORIGIN='http://127.0.0.1:43117';
const SESSION_KEY='dotforge.codex.session.v1';
export type BridgeJob={id:string;state:'running'|'ready'|'failed'|'cancelled';progress:number;activity?:GenerationActivity;error?:string;artifact?:CreationArtifact};
export class BridgeError extends Error{constructor(message:string,public status:number){super(message);}}
export async function bridge<T>(path:string,body?:unknown):Promise<T>{
 const token=sessionStorage.getItem(SESSION_KEY);
 let response:Response;
 try{response=await fetch(BRIDGE_ORIGIN+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});}catch{throw Error('この端末のCodexに接続できません。連携サービスを起動し、ブラウザのローカルネットワーク接続を許可してください');}
 const data=await response.json() as T & {error?:string};if(!response.ok)throw new BridgeError(data.error||'Codexへの接続に失敗しました',response.status);return data;
}
export async function connectCodex(){const session=await bridge<{token:string}>('/session',{});sessionStorage.setItem(SESSION_KEY,session.token);return bridge<{ready:boolean;message:string}>('/status');}
export function hasCodexSession(){return !!sessionStorage.getItem(SESSION_KEY);}
export async function dispatchToCodex(request:GenerationRequest){
 const references=await Promise.all(request.referenceKeys.map(async(id,i)=>{const res=await fetch('/api/files?id='+encodeURIComponent(id));if(!res.ok)throw Error('参照画像を読み込めません');const blob=await res.blob();if(blob.size>10*1024*1024)throw Error('参照画像は10MB以下にしてください');const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(blob);});return {side:request.referenceSides[i],data};}));
 return bridge<BridgeJob>('/jobs',{request,references});
}
