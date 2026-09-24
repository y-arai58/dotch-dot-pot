'use client';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useState} from 'react';
import {Plus} from 'lucide-react';
import {DEFAULT_STYLE,clone,type Project} from '@/lib/pixel';
import {summaryPixels} from '@/lib/asset-summary';
import {newId,now,post} from '@/lib/studio/api';
import {FIRST_DEMO_ASSET,DEMO_PROJECT_ID} from '@/lib/studio/demo';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {AppHeader} from '@/components/studio/app-header';
import {useRunner,useStudio,type ProjectOverview} from '@/components/studio/studio-provider';
import {EmptyState,LoadError,Pill,Sprite} from '@/components/studio/ui';
import {visibleJobs,isActiveJob} from './job-card';

function ProjectCard({project}:{project:ProjectOverview}){
 const studio=useStudio(),style=project.styles[project.styles.length-1],active=visibleJobs(studio.jobs,project.id).filter(isActiveJob).length;
 return <Link className="project-card" href={`/p/${project.id}`}>
  <div className="project-card-head"><div><strong>{project.name}</strong><small>スタイル v{project.styles.length} · {style.name} {style.palette.length}色 · 更新 {new Date(project.updatedAt).toLocaleDateString('ja-JP',{month:'numeric',day:'numeric'})}</small></div>{active>0&&<Pill tone="candidate">作成中 {active}</Pill>}</div>
  <span className="palette-strip" aria-hidden="true">{style.palette.map((c,i)=><i key={i} style={{background:c}}/>)}</span>
  {project.recent.length?<div className="project-thumbs">{project.recent.map((s,i)=><Sprite key={i} pixels={summaryPixels(s)} palette={s.palette} size={52} label="アセット"/>)}</div>
   :<p className="help project-empty">{project.assetCount?'開くとアセットの絵が表示されます':'まだアセットがありません。先に色と光を決めると、全アセットでそろいます。'}</p>}
  <small className="project-count">アセット {project.assetCount}</small>
 </Link>;
}

export function ProjectsPage(){
 const studio=useStudio(),router=useRouter(),{busy,run}=useRunner();
 const [open,setOpen]=useState(false),[name,setName]=useState('');
 async function create(){
  const trimmed=name.trim();if(!trimmed)throw Error('プロジェクト名を入力してください');
  const p=await post<Project>('/api/studio',{action:'project',project:{id:newId(),name:trimmed,styles:[{...clone(DEFAULT_STYLE),id:newId()}],version:0,updatedAt:now()}});
  await studio.refreshOverview();setOpen(false);setName('');router.push(`/p/${p.id}/style?welcome=1`);
 }
 const projects=studio.overview;
 return <div className="page">
  <AppHeader crumbs={[{label:'プロジェクト'}]}/>
  <main className="wide-page">
   <div className="page-heading"><div><div className="eyebrow">PROJECTS{projects?` · ${projects.length}`:''}</div><h1>プロジェクト</h1></div><button type="button" className="button primary" onClick={()=>setOpen(true)}><Plus size={16}/>新しいプロジェクト</button></div>
   {studio.overviewError?<LoadError message={studio.overviewError} onRetry={()=>void studio.refreshOverview()}/>:!projects?<p className="help">読み込んでいます…</p>
    :projects.length?<div className="project-grid">{projects.map(p=><ProjectCard key={p.id} project={p}/>)}</div>
    :<EmptyState title="まだプロジェクトがありません" action={<button type="button" className="button primary" onClick={()=>setOpen(true)}>最初のプロジェクトを作る</button>}>プロジェクトごとに、パレット・光・カメラを共通の設定として持ちます。</EmptyState>}
   <Link className="sample-callout" href={`/p/${DEMO_PROJECT_ID}/a/${FIRST_DEMO_ASSET}/pixel`}><div><strong>サンプルで試す</strong><p className="help">6種類のサンプルで、描画・8方向・パーツ・動作を試せます。デモで行った変更は保存されません。</p></div><span className="button">デモを開く</span></Link>
  </main>
  <Dialog open={open} onOpenChange={setOpen}><DialogContent className="small-dialog"><DialogHeader><DialogTitle>新しいプロジェクト</DialogTitle><DialogDescription>作品ごとの色・光・カメラをまとめて管理します。作成後、最初にスタイルを決めます。</DialogDescription></DialogHeader>
   <form onSubmit={e=>{e.preventDefault();void run(create);}} className="form-stack"><label className="field-label" htmlFor="project-name">プロジェクト名</label><input id="project-name" value={name} maxLength={100} placeholder="森の冒険" onChange={e=>setName(e.target.value)} autoFocus/>
    <button type="submit" className="button primary" disabled={busy||!name.trim()}>プロジェクトを作成</button></form>
  </DialogContent></Dialog>
 </div>;
}
