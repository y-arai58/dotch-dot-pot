'use client';
import {usePathname} from 'next/navigation';
import {ChevronDown,UserRound} from 'lucide-react';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuLabel,DropdownMenuSeparator,DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {Popover,PopoverContent,PopoverTrigger} from '@/components/ui/popover';
import {useStudio} from './studio-provider';
import {GuardedLink} from './navigation-guard';
import {JobCard,visibleJobs,isActiveJob} from '@/components/project/job-card';

export type Crumb={label:string;href?:string;menu?:{label:string;href:string;current?:boolean}[];menuLabel?:string;extra?:{label:string;href:string}};

function PotMark(){return <svg className="pot-mark" viewBox="0 0 12 10" aria-hidden="true" shapeRendering="crispEdges"><rect x="1" y="3" width="10" height="1" fill="#e5c469"/><rect x="2" y="4" width="8" height="4" fill="#64a0b5"/><rect x="3" y="8" width="6" height="1" fill="#356075"/><rect x="4" y="1" width="1" height="1" fill="#e5c469"/><rect x="6" y="0" width="1" height="1" fill="#91ad69"/><rect x="8" y="1" width="1" height="1" fill="#bd6860"/><rect x="4" y="5" width="1" height="1" fill="#e5ebec"/><rect x="7" y="6" width="1" height="1" fill="#e5ebec"/></svg>;}

function CrumbItem({crumb,last}:{crumb:Crumb;last:boolean}){
 if(crumb.menu)return <span className="crumb-split">{crumb.href&&!last?<GuardedLink className="crumb" href={crumb.href}>{crumb.label}</GuardedLink>:<span className={`crumb${last?' current':''}`} aria-current={last?'page':undefined}>{crumb.label}</span>}<DropdownMenu><DropdownMenuTrigger className="crumb-menu" aria-label={crumb.menuLabel||`${crumb.label}を切り替え`}><ChevronDown size={13} aria-hidden="true"/></DropdownMenuTrigger>
  <DropdownMenuContent align="start" className="crumb-dropdown">{crumb.menuLabel&&<DropdownMenuLabel>{crumb.menuLabel}</DropdownMenuLabel>}
   {crumb.menu.map(item=><DropdownMenuItem key={item.href} asChild><GuardedLink href={item.href} aria-current={item.current?'page':undefined} className={item.current?'current':''}>{item.label}</GuardedLink></DropdownMenuItem>)}
   {crumb.extra&&<><DropdownMenuSeparator/><DropdownMenuItem asChild><GuardedLink href={crumb.extra.href}>{crumb.extra.label}</GuardedLink></DropdownMenuItem></>}
  </DropdownMenuContent></DropdownMenu></span>;
 if(crumb.href&&!last)return <GuardedLink className="crumb" href={crumb.href}>{crumb.label}</GuardedLink>;
 return <span className={`crumb${last?' current':''}`} aria-current={last?'page':undefined}>{crumb.label}</span>;
}

function JobsChip(){
 const studio=useStudio(),list=visibleJobs(studio.jobs),active=list.filter(isActiveJob),ready=list.filter(j=>j.state==='ready');
 if(!list.length)return null;
 const label=active.length?`作成中 ${active.length}`:ready.length?`完了 ${ready.length}`:`依頼 ${list.length}`;
 return <Popover><PopoverTrigger className="status-chip"><i className={`dot ${active.length?'dot-candidate':ready.length?'dot-approved':'dot-warning'}`}/>{label}</PopoverTrigger>
  <PopoverContent align="end" className="jobs-popover"><strong className="jobs-popover-title">Codexへの作成依頼</strong>{list.slice(0,4).map(j=><JobCard key={j.id} job={j} compact/>)}
   <GuardedLink className="text-button" href={`/p/${list[0].request.projectId}/jobs`}>依頼をすべて見る</GuardedLink></PopoverContent></Popover>;
}

/** The bar on every screen: logo, where you are, Codex and job status, and the account. */
export function AppHeader({crumbs=[],center,actions}:{crumbs?:Crumb[];center?:React.ReactNode;actions?:React.ReactNode}){
 const studio=useStudio(),path=usePathname();
 return <header className="app-header">
  <GuardedLink className="brand" href={studio.signedIn?'/projects':'/'} aria-label="dotch dot pot トップへ"><PotMark/><span>dotch dot pot</span></GuardedLink>
  {crumbs.length>0&&<nav className="crumbs" aria-label="現在地">{crumbs.map((c,i)=><span className="crumb-wrap" key={i}>{i>0&&<i className="crumb-sep" aria-hidden="true">/</i>}<CrumbItem crumb={c} last={i===crumbs.length-1}/></span>)}</nav>}
  {center&&<div className="header-center">{center}</div>}
  <div className="header-actions">
   {actions}
   {studio.signedIn&&<GuardedLink className="status-chip" href="/settings/codex"><i className={`dot ${studio.codexReady?'dot-approved':''}`}/>{studio.codexReady?'Codex 接続済み':'Codex 未接続'}</GuardedLink>}
   {studio.signedIn&&<JobsChip/>}
   {studio.signedIn?<DropdownMenu><DropdownMenuTrigger className="avatar" aria-label="アカウント"><UserRound size={16}/></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem asChild><GuardedLink href="/settings/codex">Codex連携の設定</GuardedLink></DropdownMenuItem><DropdownMenuSeparator/><DropdownMenuItem asChild><a href={studio.signOutUrl}>ログアウト</a></DropdownMenuItem></DropdownMenuContent></DropdownMenu>
    :<a className="button primary small" href={studio.signInUrl(path||'/')} target="_top">ログイン</a>}
  </div>
 </header>;
}
