'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {FlaskConical} from 'lucide-react';
import {useStudio} from '@/components/studio/studio-provider';
import {Banner} from '@/components/studio/ui';
import type {Crumb} from '@/components/studio/app-header';
import {visibleJobs} from './job-card';
import {useProject} from './project-provider';

/** Breadcrumbs up to the current project, with a project switcher. */
export function useProjectCrumbs():Crumb[]{
 const studio=useStudio(),{project,projects,isDemo,projectId}=useProject();
 if(isDemo)return [{label:'サンプルルーム',href:`/p/${projectId}`}];
 const current={label:project?.name||'プロジェクト',href:`/p/${projectId}`,menuLabel:'プロジェクトを切り替え',menu:projects.map(p=>({label:p.name,href:`/p/${p.id}`,current:p.id===projectId})),extra:{label:'すべてのプロジェクト',href:'/projects'}};
 return studio.signedIn?[{label:'プロジェクト',href:'/projects'},current]:[current];
}

export function ProjectTabs(){
 const path=usePathname(),{projectId,isDemo}=useProject(),studio=useStudio();
 const base=`/p/${projectId}`,jobs=visibleJobs(studio.jobs,projectId).length;
 const tabs=[{href:base,label:'アセット',current:path===base},...(isDemo?[]:[{href:`${base}/jobs`,label:'作成依頼',count:jobs,current:path===`${base}/jobs`}]),{href:`${base}/style`,label:'スタイル',current:path===`${base}/style`}];
 return <nav className="sub-tabs" aria-label="プロジェクト">{tabs.map(t=><Link key={t.href} href={t.href} className={t.current?'active':''} aria-current={t.current?'page':undefined}>{t.label}{'count' in t&&t.count?<small>{t.count}</small>:null}</Link>)}</nav>;
}

export function DemoBanner(){
 const studio=useStudio(),path=usePathname();
 return <Banner tone="demo" icon={<FlaskConical size={16}/>} actions={studio.signedIn?<Link className="button small primary" href="/projects">自分のプロジェクトへ</Link>:<a className="button small primary" href={studio.signInUrl(path||'/')} target="_top">ログインして保存</a>}>
  <b>サンプルルーム</b>：描いたり動かしたりを試せます。変更はこの画面の中だけで保持され、再読み込みすると元に戻ります。
 </Banner>;
}
