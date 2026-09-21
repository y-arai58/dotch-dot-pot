'use client';
import {useEffect,useMemo,useState} from 'react';
import {Loader2,RotateCcw,Check,Layers} from 'lucide-react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {Slider} from '@/components/ui/slider';
import {PixelCanvas} from '@/components/pixel-canvas';
import {clone,composite,renderFrame,renderSet,validateFrames,type Mesh,type Revision,type Direction,type Frame} from '@/lib/pixel';
import {applySharedEdits,captureSurfacePaint,capturePartColors,emptySharedEdits,identityTransform,previewSharedRevision,type PartTransform} from '@/lib/shared-edits';
import {MAX_SURFACE_PAINTS,type SharedEdits} from '@/lib/shared-edit-types';

type Preview={frames:Frame[];baseFrames:Frame[]};
type Loaded={base:Mesh;current:Mesh;baseline:Frame[]};
type PartChoice={enabled?:boolean;color?:string};
function Axis({label,value,min,max,step,onChange,disabled}:{label:string;value:number;min:number;max:number;step:number;onChange:(n:number)=>void;disabled:boolean}){
 return <div className="motion-range"><label>{label}<output>{Math.round(value*100)/100}</output></label><Slider disabled={disabled} aria-label={label} value={[value]} min={min} max={max} step={step} onValueChange={v=>onChange(v[0])}/></div>;
}
function changedPixels(a:Frame,b:Frame){return a.body.reduce((n,color,i)=>n+Number(color!==b.body[i]),0);}
export function SharedEditDialog({open,onClose,revision,direction,loadBaseMesh,onApply}:{open:boolean;onClose:()=>void;revision:Revision;direction:Direction;loadBaseMesh:(r:Revision)=>Promise<Mesh>;onApply:(edits:SharedEdits,preview:Preview)=>Promise<void>}){
 const [loaded,setLoaded]=useState<Loaded|null>(null),[source,setSource]=useState(direction),[method,setMethod]=useState<'part'|'surface'>('part');
 const [transforms,setTransforms]=useState<SharedEdits['parts']>({}),[choices,setChoices]=useState<Record<string,PartChoice>>({});
 const [part,setPart]=useState(''),[isolated,setIsolated]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  if(!open)return;let dead=false;setLoaded(null);setError('');setBusy(true);setIsolated(false);setMethod('part');setChoices({});
  loadBaseMesh(revision).then(base=>{
   if(dead)return;
   const current=applySharedEdits(base,revision.sharedEdits),baseline=renderSet(current,revision.style,revision.mode,revision.size,revision.facing);
   const changed=revision.frames.filter(f=>changedPixels(f,baseline.find(b=>b.direction===f.direction)!)>0);
   setSource(changed.some(f=>f.direction===direction)?direction:changed[0]?.direction||direction);
   setTransforms(clone(revision.sharedEdits?.parts||{}));setPart(base.parts?.[0]?.id||'');setLoaded({base,current,baseline});
  }).catch(e=>{if(!dead)setError(e instanceof Error?e.message:'元モデルを読み込めませんでした');}).finally(()=>{if(!dead)setBusy(false);});
  return()=>{dead=true;};
 },[open,revision.id,direction]);
 const captures=useMemo(()=>{
  if(!open||!loaded)return null;
  return {surface:captureSurfacePaint(loaded.current,revision,source),parts:capturePartColors(loaded.current,revision,source)};
 },[open,loaded,revision,source]);
 const proposal=useMemo(()=>{
  if(!loaded||!captures)return null;
  const edits=clone(revision.sharedEdits||emptySharedEdits(loaded.base));edits.parts=transforms;
  let transferred:number[];
  if(method==='surface'){edits.paints.push(...captures.surface.paints);transferred=captures.surface.transferred;}
  else{
   const selected=captures.parts.proposals.filter(p=>choices[p.partId]?.enabled!==false),ids=new Set(selected.map(p=>p.partId));
   edits.partColors={...edits.partColors,...Object.fromEntries(selected.map(p=>[p.partId,{color:choices[p.partId]?.color||p.color,shade:p.shade}]))};
   edits.paints=edits.paints.filter(p=>!ids.has(loaded.base.triangles[p.triangle]?.partId||''));
   transferred=selected.flatMap(p=>p.indices);
  }
  return {edits,transferred};
 },[loaded,captures,revision.sharedEdits,transforms,method,choices]);
 const preview=useMemo(()=>{
  if(!open||!loaded||!proposal)return null;
  try{
   if(proposal.edits.paints.length>MAX_SURFACE_PAINTS)throw Error('表面の模様は累計2,048画素分までです。部位全体の色替えか、小さい修正範囲を選んでください');
   return {...previewSharedRevision(loaded.base,revision,source,proposal.edits,proposal.transferred),error:''};
  }catch(e){return {error:e instanceof Error?e.message:'修正を反映できません'};}
 },[open,loaded,proposal,revision,source]);
 const result=preview&&'frames' in preview?preview:null;
 const changes=result&&loaded?result.baseFrames.map(f=>({direction:f.direction,count:changedPixels(f,loaded.baseline.find(b=>b.direction===f.direction)!)})):[];
 const issues=result?[...new Set([...validateFrames(result.frames,revision.style,revision.mode),...validateFrames(result.baseFrames,revision.style,revision.mode)])]:[];
 const transform=Object.hasOwn(transforms,part)?transforms[part]:identityTransform();
 const shapeChanged=JSON.stringify(transforms)!==JSON.stringify(revision.sharedEdits?.parts||{});
 const selectedPreview=useMemo(()=>result&&part&&isolated?renderFrame({...result.mesh,triangles:result.mesh.triangles.filter(t=>t.partId===part)},revision.style,source,revision.size,revision.facing):null,[result,part,isolated,revision,source]);
 function changePart(field:keyof PartTransform,axis:number,value:number){if(busy)return;setTransforms(old=>{const t=clone(Object.hasOwn(old,part)?old[part]:identityTransform());t[field][axis]=value;return {...old,[part]:t};});}
 function choosePart(id:string,change:PartChoice){setChoices(old=>({...old,[id]:{...old[id],...change}}));}
 async function apply(){if(!result||!proposal)return;setBusy(true);setError('');try{await onApply(proposal.edits,result);onClose();}catch(e){setError(e instanceof Error?e.message:'保存に失敗しました。編集内容は保持しています');}finally{setBusy(false);}}
 return <Dialog open={open} onOpenChange={v=>{if(!v&&!busy)onClose();}}><DialogContent className="shared-edit-dialog" onPointerDownOutside={e=>e.preventDefault()} onEscapeKeyDown={e=>{if(busy)e.preventDefault();}}><DialogHeader><DialogTitle><Layers size={20}/>手修正を全方向へ反映</DialogTitle><DialogDescription>色替えは部位の裏側まで、模様は描いた表面へ反映します。8方向の変化を確認して新候補を保存します。</DialogDescription></DialogHeader>
 {(error||preview?.error)&&<p className="motion-error" role="alert">{error||preview?.error}</p>}
 {!loaded?<p className="motion-loading">{busy?<><Loader2 className="spin"/>修正箇所とパーツを調べています</>:'元の画素編集は保持されています。'}</p>:<div className="shared-edit-layout"><section className="shared-edit-controls">
 <h3>修正元の方向</h3><Select disabled={busy} value={source} onValueChange={v=>{setSource(v as Direction);setChoices({});}}><SelectTrigger aria-label="修正元の方向"><SelectValue/></SelectTrigger><SelectContent>{revision.frames.map(f=><SelectItem key={f.direction} value={f.direction}>{f.direction} · 手修正{changedPixels(f,loaded.baseline.find(b=>b.direction===f.direction)!)}画素</SelectItem>)}</SelectContent></Select>
 <fieldset className="shared-method"><legend>反映方法</legend><label><input type="radio" name="shared-method" value="part" checked={method==='part'} disabled={busy} onChange={()=>setMethod('part')}/>部位全体の色替え</label><p className="help">塗った先の部位を、裏側も含めて同じ色へ変更します。その部位の以前の手描き模様は置き換わります。</p><label><input type="radio" name="shared-method" value="surface" checked={method==='surface'} disabled={busy} onChange={()=>setMethod('surface')}/>表面に模様を描く</label><p className="help">印・線・模様の位置を保持します。小さな模様は別の角度で見えない場合があります。</p></fieldset>
 {method==='part'&&captures&&<div className="shared-color-parts"><h3>色替えする部位</h3>{captures.parts.proposals.length?captures.parts.proposals.map(p=><div className="shared-color-part" key={p.partId}><label><input type="checkbox" disabled={busy} checked={choices[p.partId]?.enabled!==false} onChange={e=>choosePart(p.partId,{enabled:e.target.checked})}/>{loaded.base.parts?.find(part=>part.id===p.partId)?.name||p.partId}<small>{p.pixels}画素から検出</small></label><select aria-label={`${p.partId}の変更色`} disabled={busy||choices[p.partId]?.enabled===false} value={choices[p.partId]?.color||p.color} onChange={e=>choosePart(p.partId,{color:e.target.value})}>{revision.style.palette.map((color,i)=><option key={i} value={color}>{i+1} · {color}</option>)}</select>{p.hasMultipleColors&&<p className="help">複数の変更色があります。最も多く塗った色を提案しています。模様を残したい場合は「表面に模様を描く」を選んでください。</p>}</div>):<p className="help">この方向に、部位の色替えに使える手修正がありません。</p>}</div>}
 <p className="help">{proposal?.transferred.length||0}画素をもとに反映します。陰影はプロジェクトの光源に合わせます。</p>
 {result&&result.localOnly>0&&<p className="notice" role="status">輪郭・消しゴム・影・他方向の手描きなど、今回共有しない修正が{result.localOnly}画素あります。新候補でも元の方向に保持します。</p>}
 <h3>パーツの形を調整</h3><Select disabled={busy} value={part||'_none'} onValueChange={setPart}><SelectTrigger aria-label="修正するパーツ"><SelectValue/></SelectTrigger><SelectContent>{loaded.base.parts?.map(p=><SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select>
 {part&&<><label className="shared-isolate"><input type="checkbox" disabled={busy} checked={isolated} onChange={e=>setIsolated(e.target.checked)}/>選んだパーツだけを確認</label>{isolated&&selectedPreview&&<PixelCanvas pixels={selectedPreview.body} palette={revision.style.palette} scale={3} label="選択パーツの形状"/>}<p className="help">大きさは元パーツに対する倍率です。形を変えた後は接地と関節のつながりも確認してください。</p>
 {['横の大きさ','奥行きの大きさ','高さ'].map((label,i)=><Axis key={label} disabled={busy} label={label} value={transform.scale[i]} min={.1} max={3} step={.05} onChange={v=>changePart('scale',i,v)}/>)}
 {['左右の位置','前後の位置','上下の位置'].map((label,i)=><Axis key={label} disabled={busy} label={label} value={transform.offset[i]} min={-1} max={1} step={.025} onChange={v=>changePart('offset',i,v)}/>)}
 <button className="text-button" disabled={busy||!Object.hasOwn(transforms,part)} onClick={()=>setTransforms(old=>{const next={...old};delete next[part];return next;})}><RotateCcw size={14}/>このパーツを元の形に戻す</button></>}
 </section><section className="shared-edit-preview"><div className="panel-heading"><span>反映後の候補</span><small>各64 × 64 px</small></div><div className="shared-direction-grid">{result?.frames.map(f=>{const count=changes.find(c=>c.direction===f.direction)?.count||0;return <figure key={f.direction}><PixelCanvas pixels={composite(f)} palette={revision.style.palette} scale={3} label={`共通修正後 ${f.direction}`}/><figcaption>{f.direction}{f.direction===source?' · 修正元':''}<strong>{count?`${count}画素変更`:'変化なし'}</strong></figcaption></figure>;})}</div>
 {proposal&&proposal.transferred.length>0&&!changes.some(c=>c.direction!==source&&c.count>0)&&<p className="notice" role="status">他の方向では変化が見えていません。{method==='surface'?'部位の色を変える場合は「部位全体の色替え」を選んでください。':'変更する部位が小さいか、他の方向で隠れている可能性があります。'}</p>}
 {!!issues.length&&<div className="notice" role="status">候補の確認事項：{issues.slice(0,4).join(' / ')}</div>}
 <p className="help">元の版は最後に保存した状態で残ります。未保存の描き込みは新候補だけに引き継ぎます。新候補の「アニメーション」で「全動作・全方向を生成」すると、色替え・模様も動作へ引き継がれます。</p>
 </section></div>}
 <footer className="shared-edit-footer"><button className="button" disabled={busy} onClick={onClose}>戻る</button><button className="button primary" disabled={busy||!result||(!proposal?.transferred.length&&!shapeChanged)} onClick={()=>void apply()}>{busy?<Loader2 size={16} className="spin"/>:<Check size={16}/>}全方向の新候補を保存</button></footer>
 </DialogContent></Dialog>;
}
