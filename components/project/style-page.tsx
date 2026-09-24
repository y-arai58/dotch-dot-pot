'use client';
import Link from 'next/link';
import {useSearchParams} from 'next/navigation';
import {useEffect,useMemo,useState} from 'react';
import {ArrowRight,Loader2,Sun} from 'lucide-react';
import {toast} from 'sonner';
import {Switch} from '@/components/ui/switch';
import {PALETTE,clone,composite,renderFrame,type Asset,type Direction,type Frame,type Style} from '@/lib/pixel';
import {api,newId,errorMessage} from '@/lib/studio/api';
import {demoAsset} from '@/lib/studio/demo';
import {meshFor} from '@/lib/studio/mesh';
import {MAX_REVISIONS,latestStyle,redrawCandidate,styleNumber} from '@/lib/studio/revisions';
import {AppHeader} from '@/components/studio/app-header';
import {useRunner} from '@/components/studio/studio-provider';
import {Banner,Choice,EmptyState,Pill,Range,Sprite} from '@/components/studio/ui';
import {DemoBanner,ProjectTabs,useProjectCrumbs} from './project-chrome';
import {useProject} from './project-provider';

const COMPASS=[{d:225,s:'↖'},{d:180,s:'↑'},{d:135,s:'↗'},{d:270,s:'←'},{d:-1,s:''},{d:90,s:'→'},{d:315,s:'↙'},{d:0,s:'↓'},{d:45,s:'↘'}];
const TONES=[{name:'暖かく',r:10,g:0,b:-8},{name:'冷たく',r:-8,g:0,b:10},{name:'明るく',r:8,g:8,b:8}];
const PREVIEW_DIRECTIONS:Direction[]=['S','SE'];
type Preview={asset:Asset;before:Frame[];after:number[][]};
const shift=(hex:string,t:typeof TONES[number])=>'#'+[1,3,5].map((p,i)=>Math.max(0,Math.min(255,parseInt(hex.slice(p,p+2),16)+[t.r,t.g,t.b][i])).toString(16).padStart(2,'0')).join('');

function describe(a:Style,b:Style){const out:string[]=[];if(JSON.stringify(a.palette)!==JSON.stringify(b.palette))out.push('パレット');if(a.light!==b.light||a.lightHeight!==b.lightHeight)out.push('光');if(a.elevation!==b.elevation)out.push('俯角');if(a.scale!==b.scale)out.push('縮尺');if(a.shadow!==b.shadow)out.push('影');if(a.outline!==b.outline)out.push('輪郭');return out;}

export function StylePage(){
 const {project,assets,isDemo,projectId,saveProject,saveAsset}=useProject(),crumbs=useProjectCrumbs(),params=useSearchParams(),{busy,run}=useRunner();
 const current=project?latestStyle(project):null;
 const [draft,setStyle]=useState<Style|null>(null),[color,setColor]=useState(19),[regenerateAll,setRegenerateAll]=useState(false),[progress,setProgress]=useState('');
 const [loaded,setLoaded]=useState<{asset:Asset;mesh:Awaited<ReturnType<typeof meshFor>>}[]>([]),[previewError,setPreviewError]=useState('');
 const style=useMemo(()=>draft||(current?clone(current):null),[draft,current]);
 const previewIds=assets.slice(0,3).map(a=>a.id).join(',');
 useEffect(()=>{let dead=false;(async()=>{try{const list=[];for(const id of previewIds.split(',').filter(Boolean)){const asset=isDemo?demoAsset(id):await api<Asset>('/api/studio?assetId='+id);if(!asset)continue;const r=asset.revisions[asset.revisions.length-1];list.push({asset,mesh:await meshFor(r)});}if(!dead){setLoaded(list);setPreviewError('');}}catch(e){if(!dead)setPreviewError(errorMessage(e,'プレビューを作れませんでした'));}})();return()=>{dead=true;};},[previewIds,isDemo]);
 const previews=useMemo<Preview[]>(()=>style?loaded.map(({asset,mesh})=>{const r=asset.revisions[asset.revisions.length-1];return {asset,before:PREVIEW_DIRECTIONS.map(d=>r.frames.find(f=>f.direction===d)||r.frames[0]),after:PREVIEW_DIRECTIONS.map(d=>composite(renderFrame(mesh,style,d,r.size,r.facing)))};}):[],[loaded,style]);
 if(!project||!current||!style)return <div className="page"><AppHeader crumbs={[...crumbs,{label:'スタイル'}]}/><ProjectTabs/><main className="narrow-page"><p className="help">読み込んでいます…</p></main></div>;
 const changes=describe(current,style),changed=changes.length>0,picked=Math.min(color,style.palette.length);
 const set=(patch:Partial<Style>)=>setStyle({...style,...patch});
 async function save(){
  if(!project||!style)return;
  const next={...clone(style),id:newId()},saved=await saveProject({...project,styles:[...project.styles,next]});
  toast.success(`スタイル v${saved.styles.length} を保存しました。既存の版はそのまま残っています`);
  if(regenerateAll){
   const failed:string[]=[];let done=0;
   for(const row of assets){
    setProgress(`${++done} / ${assets.length}`);
    try{const asset=isDemo?demoAsset(row.id):await api<Asset>('/api/studio?assetId='+row.id);if(!asset)continue;if(asset.revisions.length>=MAX_REVISIONS){failed.push(`${asset.name}（版の上限）`);continue;}
     const r=asset.revisions[asset.revisions.length-1],candidate=redrawCandidate(r,await meshFor(r),'all',{style:next,size:r.size,facing:r.facing,direction:'S'});
     await saveAsset({...asset,revisions:[...asset.revisions,candidate]});}
    catch(e){failed.push(`${row.name}（${errorMessage(e)}）`);}
   }
   setProgress('');
   if(failed.length)toast.error(`新しい候補を作れなかったアセット：${failed.join('、')}`);else toast.success(`${assets.length}アセットに新しいスタイルの候補を作りました`);
  }
  setStyle(null);
 }
 return <div className="page">
  <AppHeader crumbs={[...crumbs,{label:'スタイル'}]}/>
  <ProjectTabs/>
  {isDemo&&<DemoBanner/>}
  {params.get('welcome')&&!isDemo&&<Banner icon={<Sun size={16}/>} actions={<Link className="button small" href={`/p/${projectId}/new`}>このままアセットを追加<ArrowRight size={14}/></Link>}>最初に、このプロジェクトの色と光を決めます。あとで変えても、作った版はそのまま残ります。</Banner>}
  <div className="style-layout">
   <aside className="style-controls">
    <section className="panel-section"><div className="section-heading"><h2>パレット</h2><Choice label="パレットの色数" value={String(style.palette.length)} onChange={v=>set({palette:Array.from({length:Number(v)},(_,i)=>style.palette[i]||PALETTE[i%32])})} options={[16,32,64].map(n=>({value:String(n),label:`${n}色`}))}/></div>
     <div className="palette-grid">{style.palette.map((c,i)=><button key={i} type="button" className={picked===i+1?'picked':''} style={{background:c}} aria-label={`色 ${i+1} ${c}`} aria-pressed={picked===i+1} onClick={()=>setColor(i+1)}/>)}</div>
     <div className="color-edit"><input type="color" aria-label="選んだ色を変更" value={style.palette[picked-1]} onChange={e=>set({palette:style.palette.map((c,i)=>i===picked-1?e.target.value:c)})}/><code>{picked} · {style.palette[picked-1]}</code></div>
     <div className="button-row">{TONES.map(t=><button key={t.name} type="button" className="button small" onClick={()=>set({palette:style.palette.map(h=>shift(h,t))})}>{t.name}</button>)}</div>
    </section>
    <section className="panel-section"><h2>光</h2>
     <div className="light-row"><div className="compass-grid" role="group" aria-label="光が来る方向">{COMPASS.map(c=>c.d<0?<span key="sun" className="compass-center"><Sun size={18}/></span>:<button key={c.d} type="button" className={style.light===c.d?'selected':''} aria-pressed={style.light===c.d} aria-label={`光源 ${c.d}度`} onClick={()=>set({light:c.d})}>{c.s}</button>)}</div>
      <p className="help">地面上の8方位。物体が回転しても光源は固定されます。</p></div>
     <Range label="光源の高さ" value={style.lightHeight} min={20} max={80} step={5} suffix="°" onChange={v=>set({lightHeight:v})}/>
    </section>
    <section className="panel-section"><h2>カメラと仕上げ</h2>
     <Range label="カメラの俯角" value={style.elevation} min={15} max={60} step={5} suffix="°" onChange={v=>set({elevation:v})}/>
     <Range label="プロジェクトの縮尺" value={style.scale} min={5} max={30} onChange={v=>set({scale:v})}/>
     <div className="toggle-row"><label htmlFor="style-shadow">地面の影</label><Switch id="style-shadow" checked={style.shadow} onCheckedChange={v=>set({shadow:v})}/></div>
     <div className="toggle-row"><label htmlFor="style-outline">1ピクセルの輪郭</label><Switch id="style-outline" checked={style.outline} onCheckedChange={v=>set({outline:v})}/></div>
    </section>
   </aside>
   <main className="style-main">
    <div className="section-heading"><h1>変更前後の比較</h1><span className="tag-row"><Pill tone="neutral">v{styleNumber(project,current)}（現在）</Pill>{changed&&<Pill tone="new">v{project.styles.length+1}（編集中）</Pill>}</span><span className="help">{changed?`変更：${changes.join('・')}`:'まだ変更はありません'}</span></div>
    {previewError&&<p className="notice">{previewError}</p>}
    {!assets.length?<EmptyState title="比べるアセットがありません">アセットを追加すると、ここで実際の絵を使って変更前後を比べられます。</EmptyState>
     :<div className="style-previews">{previews.map(p=><div key={p.asset.id} className="style-preview-row"><strong>{p.asset.name}</strong>
      <div className="style-pair"><small>現在</small>{p.before.map(f=><Sprite key={f.direction} pixels={composite(f)} palette={p.asset.revisions[p.asset.revisions.length-1].style.palette} size={112} label={`${p.asset.name} ${f.direction} 現在`}/>)}</div>
      <div className="style-pair"><small>変更後</small>{p.after.map((px,i)=><Sprite key={i} pixels={px} palette={style.palette} size={112} label={`${p.asset.name} ${PREVIEW_DIRECTIONS[i]} 変更後`}/>)}</div></div>)}
      {previews.length<Math.min(3,assets.length)&&!previewError&&<p className="help"><Loader2 size={14} className="spin"/>プレビューを作っています</p>}</div>}
    <footer className="style-footer">
     <div><p>保存しても既存の版は変わりません。{assets.length}アセットに「新スタイルあり」が付き、各作業場で新しい候補を作れます。</p>
      <label className="check-line"><input type="checkbox" checked={regenerateAll} disabled={!assets.length} onChange={e=>setRegenerateAll(e.target.checked)}/>保存と同時に、{assets.length}アセットすべてに新しい候補を作る</label></div>
     <button type="button" className="button" disabled={busy||!changed} onClick={()=>setStyle(null)}>変更を破棄</button>
     <button type="button" className="button primary" disabled={busy||!changed} onClick={()=>void run(save)}>{busy&&<Loader2 size={16} className="spin"/>}{progress?`候補を作成中 ${progress}`:`スタイル v${project.styles.length+1} として保存`}</button>
    </footer>
   </main>
  </div>
 </div>;
}
