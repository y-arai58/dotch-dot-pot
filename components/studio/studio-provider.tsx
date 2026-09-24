'use client';
import {createContext,useCallback,useContext,useEffect,useMemo,useState} from 'react';
import {toast} from 'sonner';
import {Toaster} from '@/components/ui/sonner';
import {bridge,BridgeError,connectCodex as openCodexSession,hasCodexSession,dispatchToCodex,type BridgeJob} from '@/lib/bridge-client';
import {CREATION_SKILLS,type GenerationJob as Job,type GenerationRequest} from '@/lib/generation';
import type {Project} from '@/lib/pixel';
import type {AssetSummary} from '@/lib/asset-summary';
import {api,post,newId,errorMessage,signInPath,signOutPath} from '@/lib/studio/api';

export type ProjectOverview=Project&{assetCount:number;recent:AssetSummary[]};
export const ACTIVE_JOB_STATES=['queued','running','paused','uncertain'];
export const supportedJob=(job:Job)=>CREATION_SKILLS.some(s=>s.id===job.request.skillId);
export const skillName=(job:Job)=>CREATION_SKILLS.find(s=>s.id===job.request.skillId)?.name||'作成skill';

type Studio={
 signedIn:boolean;signInUrl:(returnTo?:string)=>string;signOutUrl:string;
 codexReady:boolean;connectCodex:()=>Promise<void>;
 overview:ProjectOverview[]|null;overviewError:string;refreshOverview:()=>Promise<void>;
 jobs:Job[];upsertJob:(job:Job)=>void;removeJob:(id:string)=>void;
 submitGeneration:(request:GenerationRequest)=>Promise<Job>;retryJob:(job:Job)=>Promise<void>;resendJob:(job:Job)=>Promise<void>;
 cancelJob:(job:Job)=>Promise<void>;dismissJob:(job:Job)=>Promise<void>;
};
const StudioContext=createContext<Studio|null>(null);
export function useStudio(){const value=useContext(StudioContext);if(!value)throw Error('StudioProvider is missing');return value;}

/** Session-wide state: sign-in, the local Codex bridge and generation jobs across every project. */
export function StudioProvider({signedIn,children}:{signedIn:boolean;children:React.ReactNode}){
 const [codexReady,setCodexReady]=useState(false);
 const [overview,setOverview]=useState<ProjectOverview[]|null>(signedIn?null:[]),[overviewError,setOverviewError]=useState('');
 const [jobs,setJobs]=useState<Job[]>([]);
 const fetchOverview=()=>api<{projects:ProjectOverview[];jobs:Job[]}>('/api/studio?view=overview');
 const applyOverview=useCallback((data:{projects:ProjectOverview[];jobs:Job[]})=>{setOverview(data.projects);setJobs(data.jobs);setOverviewError('');},[]);
 const overviewFailed=useCallback((e:unknown)=>setOverviewError(errorMessage(e,'プロジェクトを読み込めませんでした')),[]);
 const refreshOverview=useCallback(async()=>{if(signedIn)await fetchOverview().then(applyOverview,overviewFailed);},[signedIn,applyOverview,overviewFailed]);
 useEffect(()=>{if(!signedIn)return;let dead=false;fetchOverview().then(d=>{if(!dead)applyOverview(d);},e=>{if(!dead)overviewFailed(e);});return()=>{dead=true;};},[signedIn,applyOverview,overviewFailed]);
 useEffect(()=>{if(hasCodexSession())void openCodexSession().then(s=>setCodexReady(s.ready)).catch(()=>setCodexReady(false));},[]);
 const upsertJob=useCallback((job:Job)=>setJobs(list=>[job,...list.filter(j=>j.id!==job.id)].sort((a,b)=>b.createdAt.localeCompare(a.createdAt))),[]);
 const removeJob=useCallback((id:string)=>setJobs(list=>list.filter(j=>j.id!==id)),[]);
 async function syncJob(job:Job):Promise<Job>{
  let local:BridgeJob;
  try{local=await bridge<BridgeJob>('/jobs/'+job.id);}catch(e){if(e instanceof BridgeError&&e.status===404&&job.state==='queued')return job;throw e;}
  if(local.state==='ready'&&local.artifact)return post<Job>('/api/generate',{action:'complete',id:job.id,artifact:local.artifact});
  if(local.state==='failed'||local.state==='cancelled')return post<Job>('/api/generate',{action:local.state==='failed'?'failed':'cancel',id:job.id,error:local.error});
  return {...job,state:local.state,progress:local.progress,activity:local.activity};
 }
 useEffect(()=>{
  const pending=jobs.filter(j=>supportedJob(j)&&['queued','running'].includes(j.state));
  if(!pending.length||!codexReady)return;
  const timer=setTimeout(()=>{Promise.all(pending.map(syncJob)).then(updates=>setJobs(current=>current.map(j=>updates.find(u=>u.id===j.id)||j))).catch(e=>{toast.error(errorMessage(e));setCodexReady(false);});},4000);
  return()=>clearTimeout(timer);
 },[jobs,codexReady]);
 async function connectCodex(){setCodexReady(false);const status=await openCodexSession();setCodexReady(status.ready);if(!status.ready)throw Error(status.message);toast.success('この端末のCodexに接続しました');}
 async function submitGeneration(request:GenerationRequest){
  if(!codexReady)throw Error('この端末のCodexへ接続してください');
  const job=await post<Job>('/api/generate',request);upsertJob(job);
  try{await dispatchToCodex(job.request);setCodexReady(true);toast.success(`${skillName(job)}skillへ作成を依頼しました`);}
  catch(e){throw Error(errorMessage(e,'接続に失敗しました')+'。依頼は保存済みです。同じ依頼を再送できます');}
  return job;
 }
 async function retryJob(job:Job){if(!['failed','cancelled'].includes(job.state)||!supportedJob(job))return;await submitGeneration({...structuredClone(job.request),id:newId()});}
 async function resendJob(job:Job){await dispatchToCodex(job.request);upsertJob(await syncJob(job));}
 async function cancelJob(job:Job){
  if(supportedJob(job)){try{await bridge('/jobs/'+job.id+'/cancel',{});}catch(e){if(!(e instanceof BridgeError&&e.status===404))throw Error('この端末の停止を確認できません。Codexに接続し直してから停止してください');}}
  upsertJob(await post<Job>('/api/generate',{action:'cancel',id:job.id}));
 }
 async function restoreJob(job:Job){
  try{upsertJob(await post<Job>('/api/generate',{action:'restore',id:job.id}));toast.success('履歴を元に戻しました');}
  catch(e){toast.error(errorMessage(e,'履歴を元に戻せませんでした'),{duration:10000,action:{label:'もう一度戻す',onClick:()=>{void restoreJob(job);}}});}
 }
 async function dismissJob(job:Job){
  await post<Job>('/api/generate',{action:'dismiss',id:job.id});removeJob(job.id);
  toast.success('履歴から削除しました',{duration:8000,action:{label:'元に戻す',onClick:()=>{void restoreJob(job);}}});
 }
 const value:Studio={signedIn,signInUrl:signInPath,signOutUrl:signOutPath('/'),codexReady,connectCodex,overview,overviewError,refreshOverview,jobs,upsertJob,removeJob,submitGeneration,retryJob,resendJob,cancelJob,dismissJob};
 return <StudioContext.Provider value={value}><Toaster theme="dark" position="bottom-right"/>{children}</StudioContext.Provider>;
}

/** Wrap an async UI action: a busy flag while it runs, and a toast when it fails. */
export function useRunner(){
 const [busy,setBusy]=useState(false);
 const run=useCallback(async(fn:()=>Promise<unknown>,fallback?:string)=>{setBusy(true);try{await fn();return true;}catch(e){toast.error(errorMessage(e,fallback));return false;}finally{setBusy(false);}},[]);
 return useMemo(()=>({busy,run}),[busy,run]);
}
export type {Job};
