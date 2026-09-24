'use client';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useEffect,useMemo,useState} from 'react';
import {Check,Copy,Download,Loader2,Lock,Pause,Play} from 'lucide-react';
import {toast} from 'sonner';
import {DIRECTIONS,composite,rgba,type Direction} from '@/lib/pixel';
import {unpackFrame} from '@/lib/animation';
import {animationZip} from '@/lib/animation-export';
import {download,exportRevision,png,zip} from '@/lib/export';
import {api,post,errorMessage} from '@/lib/studio/api';
import {Choice,Pill,Sprite} from '@/components/studio/ui';
import {useWorkspace,type MotionDoc} from './workspace-provider';

const VISUAL_CHECKS=['左右の持ち物・印・背面の設計が一致している','重なり方が自然で、別の物体になっていない','足元・縮尺・光の向きがそろい、64×64で特徴が読み取れる'];
type Layer='composite'|'body'|'shadow';

function MotionReview({layer}:{layer:Layer}){
 const w=useWorkspace(),{asset,revision}=w;
 const [docId,setDocId]=useState(''),[loadedDoc,setLoadedDoc]=useState<{key:string;doc:MotionDoc|null;error:string}|null>(null);
 const [clipId,setClipId]=useState(''),[dir,setDir]=useState<Direction>('S'),[frame,setFrame]=useState(0),[playing,setPlaying]=useState(false),[confirmedFor,setConfirmedFor]=useState(''),[busy,setBusy]=useState(false);
 const sets=w.motionSets,chosen=docId&&sets.some(s=>s.id===docId)?docId:(w.motionInfo.currentId&&sets.some(s=>s.id===w.motionInfo.currentId)?w.motionInfo.currentId:sets[0]?.id||'');
 const chosenVersion=sets.find(s=>s.id===chosen)?.version;
 const docKey=chosen?`${chosen}@${chosenVersion}`:'';
 useEffect(()=>{if(!docKey)return;let dead=false;
  (async()=>w.isDemo?w.motionStore.demoHistory.get(chosen)||null:await api<MotionDoc>('/api/animations?id='+chosen))().then(d=>{if(!dead)setLoadedDoc({key:docKey,doc:d?structuredClone(d):null,error:''});},e=>{if(!dead)setLoadedDoc({key:docKey,doc:null,error:errorMessage(e,'動作を読み込めませんでした')});});
  return()=>{dead=true;};
 },[docKey,chosen,w.isDemo,w.motionStore]);
 const current=loadedDoc?.key===docKey?loadedDoc:null,doc=current?.doc||null,error=current?.error||'',loading=!!docKey&&!current;
 const confirmed=!!doc&&confirmedFor===`${doc.id}@${doc.version}`,setConfirmed=(v:boolean)=>setConfirmedFor(v&&doc?`${doc.id}@${doc.version}`:'');
 const clip=doc?.config.clips.find(c=>c.id===clipId)||doc?.config.clips[0],baked=doc?.baked.find(b=>b.id===clip?.id);
 useEffect(()=>{if(!playing||!clip)return;const t=setInterval(()=>setFrame(f=>f+1>=clip.frames?(clip.loop?0:(setPlaying(false),clip.frames-1)):f+1),1000/clip.fps);return()=>clearInterval(t);},[playing,clip]);
 if(!asset||!revision||!w.motionAvailable)return null;
 const complete=!!doc&&doc.baked.length===doc.config.clips.length&&doc.baked.every(b=>b.frames.length===doc.config.clips.find(c=>c.id===b.id)?.frames);
 const issues=doc?doc.baked.flatMap(b=>b.issues):[],editing=w.motionInfo.dirty&&w.motionInfo.currentId===doc?.id;
 const packed=baked?.frames[Math.min(frame,(baked?.frames.length||1)-1)]?.find(f=>f.direction===dir);
 async function adopt(){
  if(!doc)return;setBusy(true);
  try{const next={...structuredClone(doc),reviewed:true};const result=w.isDemo?{...next,version:next.version+1,updatedAt:new Date().toISOString()}:await post<MotionDoc>('/api/animations',next);
   if(w.isDemo)w.motionStore.demoHistory.set(result.id,structuredClone(result));
   setLoadedDoc({key:`${result.id}@${result.version}`,doc:result,error:''});w.publishMotion(result);toast.success('アニメーションを採用しました');}
  catch(e){toast.error(errorMessage(e,'採用できませんでした'));}finally{setBusy(false);}
 }
 return <section className="review-block">
  <div className="section-heading"><h2>動作</h2>{sets.length>0&&<Choice label="確認する動作セット" value={chosen} onChange={setDocId} options={sets.map(s=>({value:s.id,label:`${s.name} · ${s.reviewed?'採用済み':'候補'}`}))}/>}</div>
  {!sets.length?<p className="help">この版の動作はまだ保存されていません。<Link href={`${w.base}/motion`}>モーション</Link>で全動作を生成して保存すると、ここで確認して採用できます。</p>
   :loading?<p className="help"><Loader2 size={14} className="spin"/>読み込んでいます</p>:error?<p className="notice">{error}</p>:doc&&clip?<div className="motion-review">
   <div className="motion-review-player">
    <div className="clip-tabs" role="group" aria-label="動作">{doc.config.clips.map(c=><button key={c.id} type="button" className={c.id===clip.id?'active':''} aria-pressed={c.id===clip.id} onClick={()=>{setClipId(c.id);setFrame(0);}}>{c.name}<small>{c.frames}コマ</small></button>)}</div>
    {packed?<Sprite pixels={composite(unpackFrame(packed),layer)} palette={doc.config.style.palette} size={192} label={`${clip.name} ${dir} ${frame+1}コマ`}/>:<div className="motion-empty">このコマはまだ生成されていません</div>}
    <div className="player-bar"><button type="button" className="button small" disabled={!baked} onClick={()=>setPlaying(!playing)}>{playing?<Pause size={14}/>:<Play size={14}/>}{playing?'停止':'再生'}</button><output>{Math.min(frame+1,clip.frames)} / {clip.frames}</output>
     {revision.mode==='eight'&&<Choice label="確認する方向" value={dir} onChange={v=>setDir(v as Direction)} options={DIRECTIONS.map(d=>({value:d,label:d}))}/>}</div>
   </div>
   <div className="form-stack">
    <div className="tag-row">{doc.reviewed?<Pill tone="approved" lock>採用済み</Pill>:<Pill tone="candidate">候補</Pill>}{complete?<Pill tone="neutral">全コマ生成済み</Pill>:<Pill tone="warning">未生成の動作あり</Pill>}{issues.length>0&&<Pill tone="warning">確認事項 {issues.length}件</Pill>}</div>
    {editing&&<p className="notice">モーションに未保存の変更があります。保存してから採用してください。</p>}
    {!complete&&<p className="help">モーションで「全動作・全方向を生成」して保存すると採用できます。</p>}
    {!doc.reviewed&&<><label className="check-line"><input type="checkbox" checked={confirmed} disabled={!complete||issues.length>0||editing} onChange={e=>setConfirmed(e.target.checked)}/>全動作・全方向の接地・重なり・装備を確認した</label>
     <button type="button" className="button primary" disabled={busy||!confirmed||!complete||issues.length>0||editing} onClick={()=>void adopt()}>{busy?<Loader2 size={15} className="spin"/>:<Check size={15}/>}このアニメーションを採用</button></>}
   </div>
  </div>:null}
  {doc&&<div className="export-row"><span><b>アニメーション</b> · 動作ごとのPNG・シート＋animation.json（横＝時間、縦＝方向）</span><button type="button" className="button small" disabled={!complete||issues.length>0} onClick={()=>{try{download(animationZip(doc,layer),`${asset.name}-animations${doc.reviewed?'':'-draft'}.zip`,'application/zip');}catch(e){toast.error(errorMessage(e,'出力に失敗しました'));}}}><Download size={14}/>ZIP</button></div>}
 </section>;
}

function ReviewChecks({router}:{router:ReturnType<typeof useRouter>}){
 const w=useWorkspace(),revision=w.revision!;
 const [checks,setChecks]=useState<Set<string>>(new Set()),[issues,setIssues]=useState(revision.issues||'');
 const items=useMemo(()=>[...VISUAL_CHECKS,...revision.features.map(f=>`特徴：${f}`)],[revision]);
 const remaining=items.filter(i=>!checks.has(i)).length;
 const toggle=(i:string)=>setChecks(s=>{const n=new Set(s);if(n.has(i))n.delete(i);else n.add(i);return n;});
 return <div className="form-stack review-checks">
      {revision.approved?<><p className="state-line"><Lock size={15}/>この版は採用済みです</p><p className="help">採用済みの版は変更できません。直すときは複製した候補で編集します。</p><button type="button" className="button" disabled={w.busy||w.dirty} onClick={()=>void w.run(async()=>{await w.duplicate();router.push(`${w.base}/pixel`);})}><Copy size={15}/>複製して編集</button></>:<>
       <strong>見た目の確認</strong>
       {items.map(i=><label key={i} className="check-line"><input type="checkbox" checked={checks.has(i)} onChange={()=>toggle(i)}/>{i}</label>)}
       <label className="field-label" htmlFor="review-issues">未解決の指摘</label>
       <textarea id="review-issues" value={issues} placeholder="問題があれば記録し、修正してから採用します" onChange={e=>setIssues(e.target.value)}/>
       {w.errors.length>0&&<ul className="issue-list">{w.errors.map((e,i)=><li key={i}>{e}</li>)}</ul>}
       <button type="button" className="button primary" disabled={w.busy||w.isDemo||remaining>0||!!issues.trim()||w.errors.length>0} onClick={()=>void w.run(w.approve)}><Lock size={15}/>この版を採用</button>
       <p className="help">{w.isDemo?'サンプルルームでは採用できません。ログインしてプロジェクトに追加すると採用できます。':remaining?`残り${remaining}項目を確認すると採用できます`:issues.trim()?'指摘が残っている間は採用できません':w.dirty?'未保存の描き込みも一緒に保存して採用します':'採用すると、この版は変更できなくなります'}</p>
       <button type="button" className="button" disabled={w.busy||w.isDemo} onClick={()=>void w.run(async()=>{await w.saveIssues(issues);router.push(`${w.base}/pixel`);})}>指摘を保存して編集へ</button>
      </>}
 </div>;
}

export function ReviewTab(){
 const w=useWorkspace(),router=useRouter(),{asset,revision}=w;
 const [layer,setLayer]=useState<Layer>('composite'),[exportDir,setExportDir]=useState<Direction>('S');
 if(!asset||!revision)return null;
 const draft=revision.approved?'':'-draft';
 const exportFrame=revision.frames.find(f=>f.direction===exportDir)||revision.frames[0];
 return <div className="review-tab">
  <main className="review-main">
   <section className="review-block">
    <div className="section-heading"><h2>版{w.revIndex+1}の{revision.mode==='eight'?'8方向':'正面'}</h2>{w.errors.length?<Pill tone="warning">画素の確認事項 {w.errors.length}件</Pill>:<span className="ok-line"><Check size={14}/>寸法・色は機械検証済み</span>}</div>
    <div className="review-grid">
     <div className="review-directions">{revision.frames.map(f=><figure key={f.direction}><Sprite pixels={composite(f)} palette={revision.style.palette} size={128} label={`${f.direction}方向`}/><figcaption>{f.direction}</figcaption></figure>)}</div>
     <ReviewChecks key={`${revision.id}:${revision.issues}`} router={router}/>
    </div>
   </section>
   <MotionReview layer={layer}/>
  </main>
  <aside className="export-panel">
   <h2>書き出し</h2>
   {!revision.approved&&<p className="notice">未採用の候補です。ファイル名に <b>-draft</b> が付きます。</p>}
   {w.errors.length>0&&<p className="notice">画素の確認事項を直してから書き出してください。</p>}
   <span className="field-label">レイヤー</span>
   <div className="segmented" role="group" aria-label="出力レイヤー">{[{v:'composite',l:'物体＋影'},{v:'body',l:'物体のみ'},{v:'shadow',l:'影のみ'}].map(o=><button key={o.v} type="button" aria-pressed={layer===o.v} className={layer===o.v?'active':''} onClick={()=>setLayer(o.v as Layer)}>{o.l}</button>)}</div>
   <h3>静止画</h3>
   <div className="export-row"><span><b>PNG全方向＋シート＋JSON</b><small>ZIP · shared-edits.json を含む</small></span><button type="button" className="button small primary" disabled={w.errors.length>0} onClick={()=>{download(zip(exportRevision(revision,layer)),`${asset.name}${draft}-${layer}.zip`,'application/zip');toast.success('ZIPを書き出しました');}}><Download size={14}/>ZIP</button></div>
   <div className="export-row"><span><b>1方向のPNG</b><small>64×64</small></span><span className="export-inline">{revision.frames.length>1&&<Choice label="書き出す方向" value={exportDir} onChange={v=>setExportDir(v as Direction)} options={revision.frames.map(f=>({value:f.direction,label:f.direction}))}/>}<button type="button" className="button small" disabled={w.errors.length>0} onClick={()=>download(png(64,64,rgba(composite(exportFrame,layer),revision.style.palette)),`${asset.name}-${exportFrame.direction}${draft}.png`,'image/png')}>PNG</button></span></div>
   <div className="export-row"><span><b>スプライトシート</b><small>PNG {revision.frames.length*64}×64（{revision.frames.map(f=>f.direction).join(', ')}）</small></span><button type="button" className="button small" disabled={w.errors.length>0} onClick={()=>download(exportRevision(revision,layer)['spritesheet.png'],`${asset.name}${draft}-sheet.png`,'image/png')}>PNG</button></div>
   <p className="help">各方向64×64。拡大表示やグリッドは画像に含まれません。</p>
  </aside>
 </div>;
}
