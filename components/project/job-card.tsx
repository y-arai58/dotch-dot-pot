'use client';
import {useRouter} from 'next/navigation';
import {Check,Loader2} from 'lucide-react';
import {toast} from 'sonner';
import {buildMesh,clone,renderSet,RENDERER_VERSION,type Revision} from '@/lib/pixel';
import {CREATION_SKILLS,parseCreationModel,type CreationArtifact} from '@/lib/generation';
import {api,post,newId,now} from '@/lib/studio/api';
import {cacheMesh} from '@/lib/studio/mesh';
import {ACTIVE_JOB_STATES,supportedJob,skillName,useRunner,useStudio,type Job} from '@/components/studio/studio-provider';
import {Pill} from '@/components/studio/ui';

const PHASES=[{id:'model',label:'形状とパーツを作成'},{id:'render',label:'全方向・全動作を検証'},{id:'review',label:'画像を確認・修正'}] as const;
export const visibleJobs=(jobs:Job[],projectId?:string)=>jobs.filter(j=>j.state!=='consumed'&&(!projectId||j.request.projectId===projectId));
export const isActiveJob=(job:Job)=>ACTIVE_JOB_STATES.includes(job.state);

/** Turn a finished generation into a saved asset, then open it in the workspace. */
export function useOpenJobResult(){
 const router=useRouter(),studio=useStudio();
 return async(job:Job)=>{
  if(!job.modelFile)throw Error('モデルの準備が完了していません');
  const id='generated-'+job.id,projectId=job.request.projectId,href=`/p/${projectId}/a/${id}/pixel`;
  const old=await fetch('/api/studio?assetId='+id);
  if(!old.ok&&old.status!==404)throw Error('保存済みのアセットを確認できません');
  if(!old.ok){
   const artifact=await api<CreationArtifact>('/api/files?id='+job.modelFile),model=parseCreationModel(artifact),mesh=buildMesh(model);
   cacheMesh(job.modelFile,mesh);
   const req=job.request,frames=renderSet(mesh,req.style,req.mode);
   const r:Revision={id:newId(),rendererVersion:RENDERER_VERSION,createdAt:now(),style:clone(req.style),frames,baseFrames:clone(frames),approved:false,reviewed:false,issues:'',mode:req.mode,source:'skill',
    rigKind:artifact.kind==='static-prop-v1'?'prop':artifact.kind==='rigged-quadruped-v1'?'quadruped':'humanoid',modelId:model.id,modelKey:job.modelFile,name:req.name,prompt:req.prompt,features:req.features,facing:0,size:1,referenceKeys:req.referenceKeys,reason:'skill'};
   await post('/api/studio',{action:'asset',asset:{id,projectId,name:req.name,version:0,updatedAt:now(),revisions:[r]}});
   toast.success(artifact.kind==='static-prop-v1'?'検証済みの物体を追加しました。8方向とパーツを確認できます':'検証済みの候補を追加しました。8方向とアニメーションを確認できます');
  }
  await post('/api/generate',{action:'consumed',id:job.id});
  studio.removeJob(job.id);void studio.refreshOverview();
  router.push(href);
 };
}

export function JobCard({job,compact=false}:{job:Job;compact?:boolean}){
 const studio=useStudio(),openResult=useOpenJobResult(),{busy,run}=useRunner();
 const skill=CREATION_SKILLS.find(s=>s.id===job.request.skillId),supported=supportedJob(job);
 const otherActive=studio.jobs.some(o=>o.id!==job.id&&isActiveJob(o));
 const phaseIndex=job.activity?PHASES.findIndex(p=>p.id===job.activity!.phase):-1;
 return <article className={`job-card job-${job.state}${compact?' compact':''}`}>
  <header><strong>{job.request.name}</strong><Pill tone="neutral">{skillName(job)}</Pill></header>
  {(job.state==='queued'||job.state==='running')&&<>
   <div className="progress" aria-label="進捗"><i style={{width:`${Math.max(4,job.progress||0)}%`}}/></div>
   {job.state==='running'&&job.activity?<ol className="job-phases">{PHASES.map((p,i)=><li key={p.id} className={i<phaseIndex?'done':i===phaseIndex?'current':''}>{i<phaseIndex&&<Check size={13}/>}{p.id==='render'&&job.request.skillId==='prop'?'静止8方向を検証':p.label}{p.id==='render'&&i===phaseIndex&&skill?` · ${skill.validationFrames}枚`:''}</li>)}</ol>:<p className="help">Codexの応答を待っています</p>}
   <div className="job-meta"><span>{job.activity?.attempt?`修正 ${job.activity.attempt}/2 · `:''}{job.activity?.lastActivityAt?`最終応答 ${new Date(job.activity.lastActivityAt).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})}`:`${job.progress||0}%`}</span>
    <span className="job-actions"><button type="button" className="text-button" disabled={busy||!studio.codexReady} onClick={()=>void run(()=>studio.resendJob(job))}>状態を確認</button><button type="button" className="text-button" disabled={busy} onClick={()=>void run(()=>studio.cancelJob(job))}>停止</button></span></div>
  </>}
  {(job.state==='paused'||job.state==='uncertain')&&<>
   <p className="help">この端末のCodexで状態を確認できていません。同じ依頼IDで再送しても、作成は増えません。</p>
   <div className="job-actions"><button type="button" className="button small" disabled={busy||!studio.codexReady} onClick={()=>void run(()=>studio.resendJob(job))}>同じ依頼を再送・確認</button><button type="button" className="text-button" disabled={busy} onClick={()=>void run(()=>studio.cancelJob(job))}>停止</button></div>
  </>}
  {job.state==='ready'&&<>
   <p className="ok-line"><Check size={14}/>品質確認が完了 · {skill?.validationFrames||0}枚を検証済み</p>
   {supported&&<button type="button" className="button primary full" disabled={busy} onClick={()=>void run(()=>openResult(job))}>{busy?<Loader2 size={15} className="spin"/>:null}候補として開く</button>}
  </>}
  {(job.state==='failed'||job.state==='cancelled')&&<>
   <Pill tone="warning">{job.state==='failed'?'作成失敗':'停止済み'}</Pill>
   {job.error&&<p className="help">{job.error}</p>}
   <div className="job-actions">{supported&&<button type="button" className="button small" disabled={busy||!studio.codexReady||otherActive} title={otherActive?'作成中の依頼が終わるまで再依頼できません':undefined} onClick={()=>void run(()=>studio.retryJob(job))}>同じ内容で再依頼</button>}<button type="button" className="text-button" disabled={busy} aria-label={`${job.request.name}の履歴を削除`} onClick={()=>void run(()=>studio.dismissJob(job))}>履歴から削除</button></div>
  </>}
 </article>;
}
