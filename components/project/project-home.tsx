'use client';
import Link from 'next/link';
import {useMemo,useState} from 'react';
import {Box,Plus,Sun} from 'lucide-react';
import {KIND_LABELS,summaryOutdated,summaryPixels,type AssetKind} from '@/lib/asset-summary';
import {latestStyle,styleNumber} from '@/lib/studio/revisions';
import {AppHeader} from '@/components/studio/app-header';
import {useStudio} from '@/components/studio/studio-provider';
import {Choice,EmptyState,LoadError,Pill,Sprite} from '@/components/studio/ui';
import {DemoBanner,ProjectTabs,useProjectCrumbs} from './project-chrome';
import {useProject,type AssetRow} from './project-provider';
import {JobCard,visibleJobs} from './job-card';

const LIGHT_NAMES:Record<number,string>={0:'手前',45:'右手前',90:'右',135:'右奥',180:'奥',225:'左奥',270:'左',315:'左手前'};

export function AssetCard({asset,href,latestStyleId}:{asset:AssetRow;href:string;latestStyleId?:string}){
 const s=asset.summary;
 return <Link className="asset-card" href={href}>
  <div className="asset-card-preview">{s?<Sprite pixels={summaryPixels(s)} palette={s.palette} size={128} label={`${asset.name} 正面`}/>:<Box size={40} aria-hidden="true"/>}</div>
  <div className="asset-card-body">
   <div className="asset-card-title"><strong>{asset.name}</strong>{s&&<Pill tone={s.approved?'approved':'candidate'} lock={s.approved}>版{s.latestIndex+1} · {s.approved?'採用済み':'確認待ち'}</Pill>}</div>
   {s?<div className="tag-row"><Pill tone="neutral">{KIND_LABELS[s.kind]}</Pill><Pill tone="neutral">{s.mode==='eight'?'8方向':'正面のみ'}</Pill>{latestStyleId&&s.styleId!==latestStyleId&&<Pill tone="new">新スタイルあり</Pill>}{summaryOutdated(s)&&<Pill tone="warning">描画更新あり</Pill>}</div>
    :<p className="help">開くと絵と状態が表示されます</p>}
  </div>
 </Link>;
}

export function ProjectHome(){
 const studio=useStudio(),{project,assets,loading,error,reload,isDemo,projectId}=useProject(),crumbs=useProjectCrumbs();
 const [kind,setKind]=useState<'all'|AssetKind|'review'>('all'),[sort,setSort]=useState('updated');
 const style=project?latestStyle(project):null;
 const counts=useMemo(()=>{const c:Record<string,number>={all:assets.length,review:0};for(const a of assets){if(!a.summary)continue;c[a.summary.kind]=(c[a.summary.kind]||0)+1;if(!a.summary.approved)c.review++;}return c;},[assets]);
 const shown=useMemo(()=>assets.filter(a=>kind==='all'||(kind==='review'?a.summary&&!a.summary.approved:a.summary?.kind===kind)).sort((a,b)=>sort==='name'?a.name.localeCompare(b.name,'ja'):b.updatedAt.localeCompare(a.updatedAt)),[assets,kind,sort]);
 const jobs=visibleJobs(studio.jobs,projectId);
 const filters:{id:typeof kind;label:string}[]=[{id:'all',label:'すべて'},{id:'humanoid',label:'人型'},{id:'quadruped',label:'四足動物'},{id:'prop',label:'物体'},{id:'import',label:'持ち込み'},{id:'review',label:'確認待ち'}];
 return <div className="page">
  <AppHeader crumbs={crumbs}/>
  <ProjectTabs/>
  {isDemo&&<DemoBanner/>}
  <div className={isDemo?'project-layout single':'project-layout'}>
   <main className="project-main">
    {error?<LoadError message={error} onRetry={()=>void reload()}/>:<>
     <div className="toolbar-row">
      <div className="filter-chips" role="group" aria-label="種類で絞り込む">{filters.filter(f=>f.id==='all'||counts[f.id]).map(f=><button key={f.id} type="button" aria-pressed={kind===f.id} className={kind===f.id?'active':''} onClick={()=>setKind(f.id)}>{f.label}<small>{counts[f.id]||0}</small></button>)}</div>
      <div className="toolbar-spacer"/>
      <Choice label="並び順" value={sort} onChange={setSort} options={[{value:'updated',label:'更新順'},{value:'name',label:'名前順'}]}/>
      {!isDemo&&<Link className="button primary" href={`/p/${projectId}/new`}><Plus size={16}/>新しいアセット</Link>}
     </div>
     {style&&<Link className="style-strip" href={`/p/${projectId}/style`}><Sun size={16} aria-hidden="true"/><span><b>スタイル v{styleNumber(project,style)}</b> · {style.name} {style.palette.length}色 · 光 {LIGHT_NAMES[style.light]||`${style.light}°`}から{style.lightHeight}° · 俯角 {style.elevation}° · 輪郭{style.outline?'あり':'なし'} · 影{style.shadow?'あり':'なし'}</span><span className="palette-strip" aria-hidden="true">{style.palette.map((c,i)=><i key={i} style={{background:c}}/>)}</span><span className="text-button">スタイルを編集</span></Link>}
     {loading&&!assets.length?<p className="help">読み込んでいます…</p>:shown.length?<div className="asset-grid">{shown.map(a=><AssetCard key={a.id} asset={a} href={`/p/${projectId}/a/${a.id}/pixel`} latestStyleId={style?.id}/>)}</div>
      :<EmptyState title={assets.length?'この条件のアセットはありません':'まだアセットがありません'} action={!isDemo&&!assets.length?<Link className="button primary" href={`/p/${projectId}/new`}><Plus size={16}/>最初のアセットを追加</Link>:undefined}>{assets.length?'絞り込みを「すべて」に戻してください。':'Codexに作成を依頼するか、サンプルや3Dモデルから始められます。'}</EmptyState>}
    </>}
   </main>
   {!isDemo&&<aside className="project-side">
    <div className="side-heading"><strong>作成依頼</strong><Link className="text-button" href={`/p/${projectId}/jobs`}>すべて見る</Link></div>
    {jobs.length?jobs.slice(0,6).map(j=><JobCard key={j.id} job={j}/>):<p className="help side-empty">Codexへの依頼はここに表示されます。作成中は工程と最終応答時刻、完了すると「候補として開く」が出ます。</p>}
   </aside>}
  </div>
 </div>;
}
