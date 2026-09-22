'use client';
import {useEffect,useMemo,useState} from 'react';
import {Loader2,RotateCcw,Check,Layers} from 'lucide-react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {Slider} from '@/components/ui/slider';
import {PixelCanvas} from '@/components/pixel-canvas';
import {clone,composite,renderFrame,renderSet,validateFrames,type Mesh,type Revision,type Direction,type Frame} from '@/lib/pixel';
import {applySharedEdits,captureSurfacePaint,capturePartColors,identityTransform,type PartTransform} from '@/lib/shared-edits';
import {type SharedEdits} from '@/lib/shared-edit-types';
import {DIFF_PALETTE,frameDifference,sharedEditProposal,type PartChoice,type SharedMethod} from '@/lib/shared-edit-proposal';
import {partLabel} from '@/lib/part-labels';

type Preview={frames:Frame[];baseFrames:Frame[]};
type Loaded={base:Mesh;current:Mesh;baseline:Frame[]};
function Axis({label,value,min,max,step,onChange,disabled}:{label:string;value:number;min:number;max:number;step:number;onChange:(n:number)=>void;disabled:boolean}){
 return <div className="motion-range"><label>{label}<output>{Math.round(value*100)/100}</output></label><Slider disabled={disabled} aria-label={label} value={[value]} min={min} max={max} step={step} onValueChange={v=>onChange(v[0])}/></div>;
}
export function SharedEditDialog({open,onClose,revision,direction,loadBaseMesh,onApply}:{open:boolean;onClose:()=>void;revision:Revision;direction:Direction;loadBaseMesh:(r:Revision)=>Promise<Mesh>;onApply:(edits:SharedEdits,preview:Preview)=>Promise<void>}){
 const staticProp=revision.rigKind==='prop'||['travel-chest','wooden-barrel'].includes(revision.modelId);
 const [loaded,setLoaded]=useState<Loaded|null>(null),[source,setSource]=useState(direction),[method,setMethod]=useState<SharedMethod>('surface');
 const [transforms,setTransforms]=useState<SharedEdits['parts']>({}),[choices,setChoices]=useState<Record<string,PartChoice>>({});
 const [comparison,setComparison]=useState(direction),[preserveSource,setPreserveSource]=useState(true);
 const [part,setPart]=useState(''),[isolated,setIsolated]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  if(!open)return;let dead=false;setLoaded(null);setError('');setBusy(true);setIsolated(false);setMethod('surface');setChoices({});setPreserveSource(true);
  loadBaseMesh(revision).then(base=>{
   if(dead)return;
   const current=applySharedEdits(base,revision.sharedEdits),baseline=renderSet(current,revision.style,revision.mode,revision.size,revision.facing);
   const changed=revision.frames.filter(f=>frameDifference(f,baseline.find(b=>b.direction===f.direction)!).count>0);
   const initial=changed.some(f=>f.direction===direction)?direction:changed[0]?.direction||direction;
   setSource(initial);setComparison(initial);setTransforms(clone(revision.sharedEdits?.parts||{}));setPart(base.parts?.[0]?.id||'');setLoaded({base,current,baseline});
  }).catch(e=>{if(!dead)setError(e instanceof Error?e.message:'元モデルを読み込めませんでした');}).finally(()=>{if(!dead)setBusy(false);});
  return()=>{dead=true;};
 },[open,revision.id,direction]);
 const captures=useMemo(()=>{
  if(!open||!loaded)return null;
  return {surface:captureSurfacePaint(loaded.current,revision,source),parts:capturePartColors(loaded.current,revision,source)};
 },[open,loaded,revision,source]);
 const preview=useMemo(()=>{
  if(!open||!loaded)return null;
  try{return {...sharedEditProposal(loaded.base,revision,source,{method,parts:transforms,choices,preserveSource},captures||undefined),error:''};}
  catch(e){return {error:e instanceof Error?e.message:'修正を反映できません'};}
 },[open,loaded,revision,source,method,transforms,choices,preserveSource,captures]);
 const result=preview&&'frames' in preview?preview:null;
 const changes=result?result.frames.map(f=>({direction:f.direction,...frameDifference(revision.frames.find(b=>b.direction===f.direction)!,f)})):[];
 const before=revision.frames.find(f=>f.direction===comparison),after=result?.frames.find(f=>f.direction===comparison),difference=changes.find(c=>c.direction===comparison);
 const issues=result?[...new Set([...validateFrames(result.frames,revision.style,revision.mode),...validateFrames(result.baseFrames,revision.style,revision.mode)])]:[];
 const transform=Object.hasOwn(transforms,part)?transforms[part]:identityTransform();
 const shapeChanged=JSON.stringify(transforms)!==JSON.stringify(revision.sharedEdits?.parts||{});
 const labels=new Map(loaded?.base.parts?.map((p,i)=>[p.id,partLabel(p,revision,i)]));
 const selectedPreview=useMemo(()=>result&&part&&isolated?renderFrame({...result.mesh,triangles:result.mesh.triangles.filter(t=>t.partId===part)},revision.style,source,revision.size,revision.facing):null,[result,part,isolated,revision,source]);
 function changePart(field:keyof PartTransform,axis:number,value:number){if(busy)return;setTransforms(old=>{const t=clone(Object.hasOwn(old,part)?old[part]:identityTransform());t[field][axis]=value;return {...old,[part]:t};});}
 function choosePart(id:string,change:PartChoice){setChoices(old=>({...old,[id]:{...old[id],...change}}));}
 async function apply(){if(!result)return;setBusy(true);setError('');try{await onApply(result.edits,result);onClose();}catch(e){setError(e instanceof Error?e.message:'保存に失敗しました。編集内容は保持しています');}finally{setBusy(false);}}
 return <Dialog open={open} onOpenChange={v=>{if(!v&&!busy)onClose();}}><DialogContent className="shared-edit-dialog" onPointerDownOutside={e=>e.preventDefault()} onEscapeKeyDown={e=>{if(busy)e.preventDefault();}}><DialogHeader><DialogTitle><Layers size={20}/>手修正を全方向へ反映</DialogTitle><DialogDescription>描いた模様や色を同じ部位へ反映します。変更前後を比べて、新しい候補として保存します。</DialogDescription></DialogHeader>
 {(error||preview?.error)&&<p className="motion-error" role="alert">{error||preview?.error}</p>}
 {!loaded?<p className="motion-loading">{busy?<><Loader2 className="spin"/>修正箇所とパーツを調べています</>:'元の画素編集は保持されています。'}</p>:<div className="shared-edit-layout"><section className="shared-edit-controls">
 <h3>修正元の方向</h3><Select disabled={busy} value={source} onValueChange={v=>{setSource(v as Direction);setComparison(v as Direction);setChoices({});}}><SelectTrigger aria-label="修正元の方向"><SelectValue/></SelectTrigger><SelectContent>{revision.frames.map(f=><SelectItem key={f.direction} value={f.direction}>{f.direction} · 手修正{frameDifference(f,loaded.baseline.find(b=>b.direction===f.direction)!).count}画素</SelectItem>)}</SelectContent></Select>
 <fieldset className="shared-method"><legend>反映方法</legend>
 <label><input type="radio" name="shared-method" value="surface" checked={method==='surface'} disabled={busy} onChange={()=>setMethod('surface')}/>描いた模様をそのまま反映</label><p className="help">描いた表面に模様を付けます。裏側や隠れた面には写りません。</p>
 <label><input type="radio" name="shared-method" value="color" checked={method==='color'} disabled={busy} onChange={()=>setMethod('color')}/>指定した色だけ変更</label><p className="help">同じ部位の地色を裏側まで変更します。別の地色と、保存済みの手描き模様を残します。</p>
 <label><input type="radio" name="shared-method" value="part" checked={method==='part'} disabled={busy} onChange={()=>setMethod('part')}/>部位全体を塗り替える</label><p className="help">部位全体を一色にします。その部位の既存の模様も塗り替えます。</p></fieldset>
 <label className="shared-isolate"><input type="checkbox" disabled={busy||shapeChanged} checked={preserveSource&&!shapeChanged} onChange={e=>setPreserveSource(e.target.checked)}/>修正元の見た目を保持</label>
 <p className="help">{shapeChanged?'形を調整している間は、修正元にも形の変更を表示します。':preserveSource?'修正元は手描き後の画素を保ち、そこから見える色・模様を表面にも残します。色替えは他の面へ反映します。':'修正元にも選んだ色替えを適用します。変更前後の模様を確認してください。'}</p>
 {method!=='surface'&&captures&&<div className="shared-color-parts"><h3>色替えする部位</h3><p className="help">左右はキャラクター自身を基準にしています。</p>{captures.parts.proposals.length?captures.parts.proposals.map(p=>{const name=labels.get(p.partId)||'パーツ',unavailable=method==='color'&&!p.materials.length,disabled=busy||unavailable||choices[p.partId]?.enabled===false;return <div className="shared-color-part" key={p.partId}>
 <label><input type="checkbox" disabled={busy||unavailable} checked={!unavailable&&choices[p.partId]?.enabled!==false} onChange={e=>choosePart(p.partId,{enabled:e.target.checked})}/>{name}<small>{p.pixels}画素から検出</small></label>
 {unavailable?<p className="help">手描き模様の上の修正です。「描いた模様をそのまま反映」を選んでください。</p>:<>
 {method==='color'&&<label className="shared-color-select">変更する地色<select aria-label={`${name}の変更する地色`} disabled={disabled} value={choices[p.partId]?.from||p.materials[0]?.color} onChange={e=>choosePart(p.partId,{from:e.target.value})}>{p.materials.map(m=><option key={m.color} value={m.color}>{m.color} · {m.pixels}画素から検出</option>)}</select></label>}
 <label className="shared-color-select">変更後の色<select aria-label={`${name}の変更後の色`} disabled={disabled} value={choices[p.partId]?.color||p.color} onChange={e=>choosePart(p.partId,{color:e.target.value})}>{revision.style.palette.map((color,i)=><option key={i} value={color}>{i+1} · {color}</option>)}</select></label>
 {p.hasMultipleColors&&<p className="help">複数の変更色から、最も多く塗った色を提案しています。描いた色をすべて反映する場合は「描いた模様をそのまま反映」を選んでください。</p>}</>}
 </div>;}):<p className="help">この方向に、色替えに使える手修正がありません。</p>}</div>}
 <p className="help">{result?.transferred.length||0}画素をもとに反映します。陰影はプロジェクトの光源に合わせます。</p>
 {result&&result.sourceOnly>0&&<p className="notice" role="status">輪郭・消しゴム・影など{result.sourceOnly}画素は修正元の静止画に保持します。{!staticProp&&'この部分は動作には引き継がれません。'}</p>}
 {result&&result.localOnly>0&&<p className="notice" role="status">今回共有しない手修正は、描いた方向の静止画に保持します。{!staticProp&&'動作への反映には、その表面での修正が必要です。'}</p>}
 <h3>パーツの形を調整</h3><Select disabled={busy} value={part||'_none'} onValueChange={setPart}><SelectTrigger aria-label="修正するパーツ"><SelectValue/></SelectTrigger><SelectContent>{loaded.base.parts?.map(p=><SelectItem key={p.id} value={p.id}>{labels.get(p.id)}</SelectItem>)}</SelectContent></Select>
 {part&&<><label className="shared-isolate"><input type="checkbox" disabled={busy} checked={isolated} onChange={e=>setIsolated(e.target.checked)}/>選んだパーツだけを確認</label>{isolated&&selectedPreview&&<PixelCanvas pixels={selectedPreview.body} palette={revision.style.palette} scale={3} label="選択パーツの形状"/>}<p className="help">大きさは元パーツに対する倍率です。形を変えた後は接地とパーツのつながりも確認してください。</p>
 {['横の大きさ','奥行きの大きさ','高さ'].map((label,i)=><Axis key={label} disabled={busy} label={label} value={transform.scale[i]} min={.1} max={3} step={.05} onChange={v=>changePart('scale',i,v)}/>)}
 {['左右の位置','前後の位置','上下の位置'].map((label,i)=><Axis key={label} disabled={busy} label={label} value={transform.offset[i]} min={-1} max={1} step={.025} onChange={v=>changePart('offset',i,v)}/>)}
 <button className="text-button" disabled={busy||!Object.hasOwn(transforms,part)} onClick={()=>setTransforms(old=>{const next={...old};delete next[part];return next;})}><RotateCcw size={14}/>このパーツを元の形に戻す</button></>}
 </section><section className="shared-edit-preview">
 <div className="panel-heading"><span>{comparison}方向の変更を比較</span><small>各64 × 64 px</small></div>
 {before&&after&&difference&&<><div className="shared-comparison">
 <figure><figcaption>変更前（手描き後）</figcaption><PixelCanvas pixels={composite(before)} palette={revision.style.palette} scale={3} label={`変更前 ${comparison}`}/></figure>
 <figure><figcaption>反映後</figcaption><PixelCanvas pixels={composite(after)} palette={revision.style.palette} scale={3} label={`反映後 ${comparison}`}/></figure>
 <figure><figcaption>差分 · {difference.count}画素</figcaption><PixelCanvas pixels={difference.pixels} palette={DIFF_PALETTE} scale={3} label={`差分 ${comparison} ${difference.count}画素`}/></figure>
 </div><p className="shared-diff-legend">{['追加','削除','色・レイヤーの変更'].map((name,i)=><span key={name}><i style={{background:DIFF_PALETTE[i]}}/>{name}</span>)}</p></>}
 <div className="panel-heading"><span>確認する方向を選択</span><small>反映後の{revision.frames.length}方向</small></div><div className="shared-direction-grid">{result?.frames.map(f=>{const count=changes.find(c=>c.direction===f.direction)?.count||0;return <button type="button" key={f.direction} className={comparison===f.direction?'selected':''} aria-pressed={comparison===f.direction} aria-label={`${f.direction}方向を比較`} onClick={()=>setComparison(f.direction)}><PixelCanvas pixels={composite(f)} palette={revision.style.palette} scale={2} label={`共通修正後 ${f.direction}`}/><span>{f.direction}{f.direction===source?' · 修正元':''}<strong>{count?`${count}画素変更`:f.direction===source&&result.preserveSource?'手描きと一致':'変化なし'}</strong></span></button>;})}</div>
 {result&&result.transferred.length>0&&!changes.some(c=>c.direction!==source&&c.count>0)&&<p className="notice" role="status">他の方向では変化が見えていません。{method==='surface'?'描いた面が隠れている場合や、模様が1画素より小さく映る場合があります。裏側の地色も変える場合は「指定した色だけ変更」を選んでください。':'選んだ部位や色が他の方向で見えるか、差分で確認してください。'}</p>}
 {!!issues.length&&<div className="notice" role="status">候補の確認事項：{issues.slice(0,4).join(' / ')}</div>}
 <p className="help">元の版は最後に保存した状態で残ります。未保存の描き込みは新候補だけに引き継ぎます。{!staticProp&&'表面に反映された模様・色は、新候補の「アニメーション」で「全動作・全方向を生成」すると動作へ引き継がれます。'}</p>
 </section></div>}
 <footer className="shared-edit-footer"><button className="button" disabled={busy} onClick={onClose}>戻る</button><button className="button primary" disabled={busy||!result||(!result.transferred.length&&!shapeChanged)} onClick={()=>void apply()}>{busy?<Loader2 size={16} className="spin"/>:<Check size={16}/>}全方向の新候補を保存</button></footer>
 </DialogContent></Dialog>;
}
