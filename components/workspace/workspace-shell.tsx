'use client';
import Link from 'next/link';
import {useRouter,useSelectedLayoutSegments} from 'next/navigation';
import {useCallback,useState} from 'react';
import {AlertTriangle,Copy,Layers,Lock,MoreHorizontal,RefreshCw,Save,Settings2,Sun} from 'lucide-react';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {baseMeshFor,meshFor} from '@/lib/studio/mesh';
import {styleNumber} from '@/lib/studio/revisions';
import {AppHeader} from '@/components/studio/app-header';
import {NavigationGuard} from '@/components/studio/navigation-guard';
import {Banner,LoadError} from '@/components/studio/ui';
import {DemoBanner,useProjectCrumbs} from '@/components/project/project-chrome';
import {useProject} from '@/components/project/project-provider';
import {WorkspaceProvider,useWorkspace,type MotionInfo,type MotionSet} from './workspace-provider';
import {PixelTab} from './pixel-tab';
import {VersionPanel} from './version-panel';
import {AssetSettings} from './asset-settings';
import {ReviewTab} from './review-tab';
import {PartsEditor} from './parts-editor';
import {PropagateEditor} from './propagate-editor';
import {MotionEditor} from './motion-editor';
import {AnimalMotionEditor} from './animal-motion-editor';

type TabKey='pixel'|'propagate'|'parts'|'motion'|'review';

function Unavailable({children}:{children:React.ReactNode}){return <div className="tab-unavailable"><AlertTriangle size={18}/><p>{children}</p></div>;}

function Panels({active}:{active:TabKey}){
 const w=useWorkspace(),router=useRouter(),{registerEditor,reportMotionSets,reportMotionInfo,setMotionController}=w,{revision,asset}=w;
 const [visited,setVisited]=useState<Set<TabKey>>(()=>new Set([active]));
 if(!visited.has(active))setVisited(new Set(visited).add(active));
 const revisionId=revision?.id||'';
 const motionSets=useCallback((sets:MotionSet[])=>reportMotionSets(revisionId,sets),[reportMotionSets,revisionId]);
 const motionInfo=useCallback((info:MotionInfo)=>reportMotionInfo(revisionId,info),[reportMotionInfo,revisionId]);
 const partsDirty=useCallback((dirty:boolean,discard:()=>void)=>registerEditor('parts',{dirty,label:'パーツ修正',discard}),[registerEditor]);
 const motionDirty=useCallback((dirty:boolean,discard:()=>void)=>registerEditor('motion',{dirty,label:'動作の設定',discard}),[registerEditor]);
 if(!asset||!revision)return null;
 const shared=!w.legacyHumanoid&&w.canReuse,blocked=w.legacyHumanoid?'旧版のサンプルです。上の帯から「動作用モデルの新候補」を作ると、全方向・パーツの共通編集が使えます。':!w.canReuse?'描画方式・サイズ・正面補正が今の版と変わっています。「アセット設定」から全方向の新候補を作ってから使ってください。':'';
 const show=(k:TabKey)=>visited.has(k)||active===k;
 return <>
  <div className="tab-panel" hidden={active!=='pixel'}><PixelTab active={active==='pixel'}/></div>
  {show('propagate')&&<div className="tab-panel scroll" hidden={active!=='propagate'}>{shared?<PropagateEditor open={active==='propagate'} locked={w.locked} onDone={()=>router.push(`${w.base}/pixel`)} revision={revision} direction={w.direction} loadBaseMesh={baseMeshFor} onApply={(e,p)=>w.applySharedChanges(e,p,'shared-edit')}/>:<Unavailable>{blocked}</Unavailable>}</div>}
  {show('parts')&&<div className="tab-panel scroll" hidden={active!=='parts'}>{shared?<PartsEditor open={active==='parts'} locked={w.locked} onDirtyChange={partsDirty} revision={revision} direction={w.direction} loadBaseMesh={baseMeshFor} onApply={(e,p)=>w.applySharedChanges(e,p,'part-edit')}/>:<Unavailable>{blocked}</Unavailable>}</div>}
  {show('motion')&&<div className="tab-panel scroll" hidden={active!=='motion'}>{!w.motionAvailable?<Unavailable>物体・家具・小物は静止画専用のため、動作はありません。</Unavailable>
   :revision.rigKind==='quadruped'?<AnimalMotionEditor open={active==='motion'} asset={asset} revision={revision} loadMesh={meshFor} store={w.motionStore} reviewHref={`${w.base}/review`} onController={setMotionController} onSets={motionSets} onInfo={motionInfo} onDirtyChange={motionDirty}/>
   :<MotionEditor open={active==='motion'} asset={asset} revision={revision} loadMesh={meshFor} store={w.motionStore} reviewHref={`${w.base}/review`} onController={setMotionController} onSets={motionSets} onInfo={motionInfo} onDirtyChange={motionDirty}/>}</div>}
  {show('review')&&<div className="tab-panel scroll" hidden={active!=='review'}><ReviewTab/></div>}
 </>;
}

function Shell({children}:{children:React.ReactNode}){
 const w=useWorkspace(),project=useProject(),crumbs=useProjectCrumbs(),segments=useSelectedLayoutSegments();
 const active:TabKey=segments[0]==='pixel'&&segments[1]==='propagate'?'propagate':(['parts','motion','review'].includes(segments[0])?segments[0] as TabKey:'pixel');
 const {asset,revision}=w;
 const rev=asset&&revision&&w.revIndex!==asset.revisions.length-1?`?rev=${revision.id}`:'';
 const tabs=[{key:'pixel',label:'ドット'},{key:'parts',label:'パーツ'},...(w.motionAvailable?[{key:'motion',label:'モーション'}]:[]),{key:'review',label:'確認・書き出し'}];
 const dirtyEditors=[...(w.dirty?[{key:'pixel',label:'描き込み',discard:w.discardPixels}]:[]),...Object.entries(w.editors).filter(([,e])=>e?.dirty).map(([key,e])=>({key,label:e!.label,discard:e!.discard}))];
 const assetCrumb={label:asset?.name||'アセット',menuLabel:'アセットを切り替え',menu:project.assets.map(a=>({label:a.name,href:`/p/${w.projectId}/a/${a.id}/pixel`,current:a.id===w.assetId})),extra:project.isDemo?undefined:{label:'新しいアセット',href:`/p/${w.projectId}/new`}};
 const header=<AppHeader crumbs={[...crumbs,assetCrumb]}
  center={asset&&<nav className="workspace-tabs" aria-label="作業">{tabs.map(t=><Link key={t.key} href={`${w.base}/${t.key}${rev}`} className={active===t.key||(t.key==='pixel'&&active==='propagate')?'active':''} aria-current={active===t.key?'page':undefined}>{t.label}</Link>)}</nav>}
  actions={asset&&<>
   <button type="button" className="tool" aria-label="アセット設定" title="アセット設定" onClick={()=>w.setSettingsOpen(true)}><Settings2 size={17}/></button>
   {dirtyEditors.length>0&&<span className="status-chip dirty" title={dirtyEditors.map(e=>e.label).join('・')}><i className="dot dot-gold"/>未保存{dirtyEditors.length===1&&w.dirty&&w.changedPixels?` · ${w.changedPixels}画素`:dirtyEditors.length>1?` · ${dirtyEditors.length}件`:''}</span>}
   {w.dirty&&<button type="button" className="button primary small" disabled={w.busy} onClick={()=>void w.run(w.save)}><Save size={14}/>{w.isDemo?'変更を確定':'保存'}</button>}
   {dirtyEditors.length>0&&<DropdownMenu><DropdownMenuTrigger className="tool" aria-label="未保存の変更のメニュー"><MoreHorizontal size={17}/></DropdownMenuTrigger><DropdownMenuContent align="end">{dirtyEditors.map(e=><DropdownMenuItem key={e.key} onSelect={()=>e.discard()}>{e.label}の変更を破棄</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>}
  </>}/>;
 if(w.loadError)return <div className="page">{header}<main className="narrow-page"><LoadError message={w.loadError} onRetry={w.reload}/></main></div>;
 if(!asset||!revision)return <div className="page">{header}<main className="narrow-page"><p className="help">アセットを読み込んでいます…</p></main></div>;
 const editTab=active==='pixel'||active==='parts'||active==='propagate';
 const latest=w.latestProjectStyle;
 return <NavigationGuard dirty={w.anyDirty} scope={w.base}><div className="page workspace-page">
  {header}
  <div className="banner-stack">
   {w.isDemo&&<DemoBanner/>}
   {w.locked&&editTab&&<Banner tone="lock" icon={<Lock size={16}/>} actions={<button type="button" className="button small primary" disabled={w.busy||w.dirty} onClick={()=>void w.run(w.duplicate)}><Copy size={14}/>複製して編集</button>}><b>版{w.revIndex+1}は採用済みのため変更できません。</b>直すときは複製した候補で編集します。</Banner>}
   {w.legacyHumanoid&&<Banner tone="warning" icon={<Layers size={16}/>} actions={<button type="button" className="button small primary" disabled={w.busy||w.dirty} onClick={()=>void w.run(w.createArticulatedCandidate)}>動作用モデルの新候補を作成</button>}>旧版のサンプルです。全方向・パーツ・動作の共通編集には、関節分割済みの新しい候補を使います。手描きは元の版に残ります。</Banner>}
   {w.styleOutdated&&latest?<Banner icon={<Sun size={16}/>} actions={<button type="button" className="button small" disabled={w.busy||w.dirty} onClick={()=>void w.run(()=>w.redraw('all',{style:latest}))}>新しいスタイルで候補を作る</button>}>プロジェクトのスタイルが v{styleNumber(project.project,latest)} に更新されています。この版は v{styleNumber(project.project,revision.style)} で描かれています。</Banner>
    :w.rendererOutdated&&<Banner icon={<RefreshCw size={16}/>} actions={<button type="button" className="button small" disabled={w.busy||w.dirty} onClick={()=>void w.run(()=>w.redraw('all'))}>全方向の新候補を作る</button>}>見下ろしカメラの描画方式が更新されています。新しい候補を作ると、今の描画方式で全方向を描き直します。</Banner>}
  </div>
  <div className="workspace-body">
   <div className="workspace-main"><Panels active={active}/>{children}</div>
   <VersionPanel motionActive={active==='motion'}/>
  </div>
  <AssetSettings/>
 </div></NavigationGuard>;
}

export function AssetWorkspace({assetId,children}:{assetId:string;children:React.ReactNode}){
 return <WorkspaceProvider assetId={assetId}><Shell>{children}</Shell></WorkspaceProvider>;
}
