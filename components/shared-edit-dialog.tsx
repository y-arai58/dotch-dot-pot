'use client';
import {useEffect,useMemo,useState} from 'react';
import {Loader2,RotateCcw,Check,Layers} from 'lucide-react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {Slider} from '@/components/ui/slider';
import {PixelCanvas} from '@/components/pixel-canvas';
import {clone,composite,renderFrame,validateFrames,type Mesh,type Revision,type Direction,type Frame} from '@/lib/pixel';
import {applySharedEdits,captureSurfacePaint,emptySharedEdits,identityTransform,previewSharedRevision,type SharedEdits,type PartTransform} from '@/lib/shared-edits';
import {MAX_SURFACE_PAINTS} from '@/lib/shared-edit-types';

function Axis({label,value,min,max,step,onChange,disabled}:{label:string;value:number;min:number;max:number;step:number;onChange:(n:number)=>void;disabled:boolean}){
 return <div className="motion-range"><label>{label}<output>{Math.round(value*100)/100}</output></label><Slider disabled={disabled} aria-label={label} value={[value]} min={min} max={max} step={step} onValueChange={v=>onChange(v[0])}/></div>;
}
type Preview={frames:Frame[];baseFrames:Frame[]};
export function SharedEditDialog({open,onClose,revision,direction,loadBaseMesh,onApply}:{open:boolean;onClose:()=>void;revision:Revision;direction:Direction;loadBaseMesh:(r:Revision)=>Promise<Mesh>;onApply:(edits:SharedEdits,preview:Preview)=>Promise<void>}){
 const [base,setBase]=useState<Mesh|null>(null),[draft,setDraft]=useState<SharedEdits>(emptySharedEdits),[transferred,setTransferred]=useState<number[]>([]),[part,setPart]=useState(''),[isolated,setIsolated]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(!open)return;let dead=false;setBase(null);setError('');setBusy(true);setIsolated(false);
  loadBaseMesh(revision).then(mesh=>{
   if(dead)return;const current=applySharedEdits(mesh,revision.sharedEdits),captured=captureSurfacePaint(current,revision,direction),edits=clone(revision.sharedEdits||emptySharedEdits(mesh));
   edits.paints.push(...captured.paints);if(edits.paints.length>MAX_SURFACE_PAINTS)throw Error('共通修正は2,048画素分までです。修正範囲を小さくしてください');
   setDraft(edits);setTransferred(captured.transferred);setBase(mesh);setPart(mesh.parts?.[0]?.id||'');
  }).catch(e=>{if(!dead)setError(e instanceof Error?e.message:'元モデルを読み込めませんでした');}).finally(()=>{if(!dead)setBusy(false);});
  return()=>{dead=true;};
 },[open,revision.id,direction]);
 const preview=useMemo(()=>{if(!open||!base)return null;try{return {...previewSharedRevision(base,revision,direction,draft,transferred),error:''};}catch(e){return {error:e instanceof Error?e.message:'修正を反映できません'};}},[open,base,draft,revision,direction,transferred]);
 const result=preview&&'frames' in preview?preview:null;
 const issues=result?[...new Set([...validateFrames(result.frames,revision.style,revision.mode),...validateFrames(result.baseFrames,revision.style,revision.mode)])]:[];
 const transform=Object.hasOwn(draft.parts,part)?draft.parts[part]:identityTransform();
 const shapeChanged=JSON.stringify(draft.parts)!==JSON.stringify(revision.sharedEdits?.parts||{});
 const selectedPreview=useMemo(()=>result&&part?renderFrame({...result.mesh,triangles:result.mesh.triangles.filter(t=>t.partId===part)},revision.style,direction,revision.size,revision.facing):null,[result,part,revision,direction]);
 function changePart(field:keyof PartTransform,axis:number,value:number){if(busy)return;setDraft(old=>{const t=clone(Object.hasOwn(old.parts,part)?old.parts[part]:identityTransform());t[field][axis]=value;return {...old,parts:{...old.parts,[part]:t}};});}
 async function apply(){if(!result)return;setBusy(true);setError('');try{await onApply(draft,result);onClose();}catch(e){setError(e instanceof Error?e.message:'保存に失敗しました。編集内容は保持しています');}finally{setBusy(false);}}
 return <Dialog open={open} onOpenChange={v=>{if(!v&&!busy)onClose();}}><DialogContent className="shared-edit-dialog" onPointerDownOutside={e=>e.preventDefault()} onEscapeKeyDown={e=>{if(busy)e.preventDefault();}}><DialogHeader><DialogTitle><Layers size={20}/> 手修正を全方向へ反映</DialogTitle><DialogDescription>{direction}で描いた色・模様を同じ表面に固定します。パーツの形も調整でき、アニメーションへ引き継がれます。</DialogDescription></DialogHeader>
 {(error||preview?.error)&&<p className="motion-error" role="alert">{error||preview?.error}</p>}
 {!base?<p className="motion-loading">{busy?<><Loader2 className="spin"/>修正箇所とパーツを調べています</>:'元の画素編集は保持されています。'}</p>:<div className="shared-edit-layout"><section className="shared-edit-controls"><h3>表面の色・模様</h3><p><strong>{transferred.length}画素</strong>を全方向へ反映</p><p className="help">色はこの方向の見た目を基準に、向きとプロジェクトの光に合わせて陰影が付きます。</p>
 {result&&result.localOnly>0&&<p className="notice" role="status">輪郭・消しゴム・影・他方向の手描きなど、表面へ移せない修正が{result.localOnly}画素あります。新候補でもその方向だけに保持します。形を変える場合は下のパーツ調整を使ってください。</p>}
 <h3>パーツの形を調整</h3><Select disabled={busy} value={part||'_none'} onValueChange={setPart}><SelectTrigger aria-label="修正するパーツ"><SelectValue/></SelectTrigger><SelectContent>{base.parts?.map(p=><SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select>
 {part&&<><label className="shared-isolate"><input type="checkbox" disabled={busy} checked={isolated} onChange={e=>setIsolated(e.target.checked)}/>選んだパーツだけを確認</label>{isolated&&selectedPreview&&<PixelCanvas pixels={selectedPreview.body} palette={revision.style.palette} scale={3} label="選択パーツの形状"/>}<p className="help">横・奥行きはキャラクター自身の向きを基準にしています。大きさは元パーツに対する倍率です。</p>
 {['横の大きさ','奥行きの大きさ','高さ'].map((label,i)=><Axis key={label} disabled={busy} label={label} value={transform.scale[i]} min={.1} max={3} step={.05} onChange={v=>changePart('scale',i,v)}/>)}
 {['左右の位置','前後の位置','上下の位置'].map((label,i)=><Axis key={label} disabled={busy} label={label} value={transform.offset[i]} min={-1} max={1} step={.025} onChange={v=>changePart('offset',i,v)}/>)}
 <button className="text-button" disabled={busy||!Object.hasOwn(draft.parts,part)} onClick={()=>setDraft(old=>{const next=clone(old);delete next.parts[part];return next;})}><RotateCcw size={14}/>このパーツを元の形に戻す</button></>}
 </section><section className="shared-edit-preview"><div className="panel-heading"><span>反映後の候補</span><small>各64 × 64 px</small></div><div className="shared-direction-grid">{result?.frames.map(f=><figure key={f.direction}><PixelCanvas pixels={composite(f)} palette={revision.style.palette} scale={3} label={`共通修正後 ${f.direction}`}/><figcaption>{f.direction}{f.direction===direction?' · 修正元':''}</figcaption></figure>)}</div>
 <p className="help">見えない側へ模様を写したり、左右を反転したりせず、同じ表面が見える方向に反映します。形を変えた後は接地と関節のつながりも確認してください。</p>
 {!!issues.length&&<div className="notice" role="status">候補の確認事項：{issues.slice(0,4).join(' / ')}</div>}
 <p className="help">元の版を残して新候補を保存します。この候補の「アニメーション」で元の動作設定を引き継ぎ、「全動作・全方向を生成」すると動いている表面にも反映されます。</p>
 </section></div>}
 <footer className="shared-edit-footer"><button className="button" disabled={busy} onClick={onClose}>戻る</button><button className="button primary" disabled={busy||!result||(!transferred.length&&!shapeChanged)} onClick={()=>void apply()}>{busy?<Loader2 size={16} className="spin"/>:<Check size={16}/>}全方向の新候補を保存</button></footer>
 </DialogContent></Dialog>;
}
