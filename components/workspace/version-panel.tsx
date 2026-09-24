'use client';
import Link from 'next/link';
import {Copy,History} from 'lucide-react';
import {MAX_REVISIONS,reasonLabel} from '@/lib/studio/revisions';
import {Pill} from '@/components/studio/ui';
import {useWorkspace} from './workspace-provider';

const when=(iso?:string)=>iso?new Date(iso).toLocaleString('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'';

/** Every version of the asset, newest first, with why it exists; plus this version's saved motion sets. */
export function VersionPanel({motionActive}:{motionActive:boolean}){
 const w=useWorkspace(),{asset,revision}=w;
 if(!asset||!revision)return null;
 const rows=asset.revisions.map((r,i)=>({r,i})).reverse();
 return <aside className="version-panel" aria-label="版">
  <div className="section-heading"><h3><History size={15}/>版</h3><button type="button" className="button small" disabled={w.busy||w.dirty||asset.revisions.length>=MAX_REVISIONS} onClick={()=>void w.run(w.duplicate)} title={w.dirty?'描き込みを保存してから複製できます':undefined}><Copy size={13}/>複製</button></div>
  <ol className="version-list">{rows.map(({r,i})=>{const current=i===w.revIndex;return <li key={r.id} className={`version-row${current?' current':''}`}>
   <span className={`version-dot ${r.approved?'approved':current?'current':''}`} aria-hidden="true"/>
   <button type="button" disabled={w.busy||(w.dirty&&!current)} aria-current={current?'true':undefined} onClick={()=>w.selectRevision(i)}>
    <span className="version-title"><b>版{i+1}</b>{r.approved?<Pill tone="approved" lock>採用済み</Pill>:<Pill tone="candidate">{current&&w.dirty?'候補 · 編集中':'候補'}</Pill>}</span>
    <small>{reasonLabel(r,asset.revisions)} · {when(r.createdAt)}</small>
   </button>
  </li>;})}</ol>
  <p className="help version-note">新しい候補を作る操作は、どこで行ってもここに1行増えます。{asset.revisions.length} / {MAX_REVISIONS}版</p>
  {w.motionAvailable&&<section className="motion-sets"><h3>この版の動作セット</h3>
   {w.motionSets.length?<ul>{w.motionSets.map(s=>{const current=w.motionInfo.currentId===s.id;return <li key={s.id}>{w.motionInfo.loaded?<button type="button" className={current?'current':''} disabled={w.motionInfo.busy||w.motionInfo.dirty||current} onClick={()=>w.requestMotion(s.id)}><span>{s.name}</span>{s.reviewed?<Pill tone="approved" lock>採用済み</Pill>:<Pill tone="candidate">候補</Pill>}</button>
    :<Link className="motion-set-link" href={`${w.base}/motion`}><span>{s.name}</span>{s.reviewed?<Pill tone="approved" lock>採用済み</Pill>:<Pill tone="candidate">候補</Pill>}</Link>}</li>;})}</ul>
    :<p className="help">まだ保存された動作はありません。{!motionActive&&<Link href={`${w.base}/motion`}>モーション</Link>}{!motionActive&&'で作れます。'}</p>}
   {w.motionInfo.dirty&&<p className="help">動作に未保存の変更があるため、切り替えられません。</p>}
  </section>}
 </aside>;
}
