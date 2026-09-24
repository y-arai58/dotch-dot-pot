'use client';
import Link from 'next/link';
import {AppHeader} from '@/components/studio/app-header';
import {useStudio} from '@/components/studio/studio-provider';
import {EmptyState} from '@/components/studio/ui';
import {ProjectTabs,useProjectCrumbs} from './project-chrome';
import {useProject} from './project-provider';
import {JobCard,isActiveJob,visibleJobs} from './job-card';

export function JobsPage(){
 const studio=useStudio(),{projectId}=useProject(),crumbs=useProjectCrumbs();
 const jobs=visibleJobs(studio.jobs,projectId),groups=[{title:'作成中',items:jobs.filter(isActiveJob)},{title:'完了',items:jobs.filter(j=>j.state==='ready')},{title:'失敗・停止',items:jobs.filter(j=>j.state==='failed'||j.state==='cancelled')}];
 return <div className="page">
  <AppHeader crumbs={[...crumbs,{label:'作成依頼'}]}/>
  <ProjectTabs/>
  <main className="narrow-page">
   <div className="page-heading"><div><h1>作成依頼</h1><p className="help">Codexへの依頼は、画面を閉じてもこの端末で続きます。1度に作成できる依頼は1件です。</p></div><Link className="button primary" href={`/p/${projectId}/new`}>新しいアセット</Link></div>
   {!studio.codexReady&&<p className="notice">この端末のCodexに接続していないため、進み具合を更新できません。<Link href="/settings/codex">Codex連携</Link>から接続してください。</p>}
   {jobs.length?groups.filter(g=>g.items.length).map(g=><section key={g.title} className="job-group"><h2>{g.title}<small>{g.items.length}</small></h2><div className="job-list">{g.items.map(j=><JobCard key={j.id} job={j}/>)}</div></section>)
    :<EmptyState title="依頼はありません" action={<Link className="button" href={`/p/${projectId}/new`}>Codexに作成を依頼</Link>}>「新しいアセット」からCodexに人型・四足動物・物体の作成を依頼できます。</EmptyState>}
  </main>
 </div>;
}
