'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {Box,Check,Loader2,Undo2,Redo2,Pencil,MousePointer2,LocateFixed,RotateCcw} from 'lucide-react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {PixelCanvas} from '@/components/pixel-canvas';
import {clone,renderFrame,renderSet,projectToScreen,validateFrames,type Mesh,type Revision,type Direction,type Frame,type SurfaceHit,type V3} from '@/lib/pixel';
import {emptySharedEdits,identityTransform,partCenters,type SharedEdits,type PartTransform} from '@/lib/shared-edits';
import {partPivot,movePartPivot,dragPivotOnView,validatePartTransform} from '@/lib/part-transform';
import {paintPartStroke,recolorPart,clearPartPattern,previewPartDesign} from '@/lib/part-design';
import {partLabel} from '@/lib/part-labels';

type Mode='select'|'paint'|'pivot';
type Props={open:boolean;onClose:()=>void;revision:Revision;direction:Direction;loadBaseMesh:(r:Revision)=>Promise<Mesh>;onApply:(edits:SharedEdits,preview:{frames:Frame[];baseFrames:Frame[]})=>Promise<void>};
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
function NumberControl({label,value,min,max,step=.025,onChange,disabled=false}:{label:string;value:number;min:number;max:number;step?:number;onChange:(n:number)=>void;disabled?:boolean}){
 return <label className="part-number"><span>{label}</span><input type="number" aria-label={label} value={Number(value.toFixed(4))} min={min} max={max} step={step} disabled={disabled} onChange={e=>{if(e.target.value!==''&&Number.isFinite(e.target.valueAsNumber))onChange(clamp(e.target.valueAsNumber,min,max));}}/></label>;
}
export function PartEditorDialog({open,onClose,revision,direction,loadBaseMesh,onApply}:Props){
 const [base,setBase]=useState<Mesh|null>(null),[edits,setEdits]=useState<SharedEdits>(emptySharedEdits()),[part,setPart]=useState(''),[view,setView]=useState(direction);
 const [mode,setMode]=useState<Mode>('select'),[isolated,setIsolated]=useState(false),[color,setColor]=useState(1),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [undo,setUndo]=useState<SharedEdits[]>([]),[redo,setRedo]=useState<SharedEdits[]>([]),[strokePixels,setStrokePixels]=useState<number[]|null>(null);
 const canvasArea=useRef<HTMLDivElement>(null),draft=useRef(edits),drag=useRef<{before:SharedEdits;points:[number,number][];pivot:V3;start:[number,number];pointer:number}|null>(null);draft.current=edits;
 useEffect(()=>{if(!open)return;let dead=false;setBusy(true);setBase(null);setError('');setUndo([]);setRedo([]);setMode('select');setIsolated(false);setView(direction);setStrokePixels(null);drag.current=null;
  loadBaseMesh(revision).then(mesh=>{if(dead)return;setBase(mesh);setPart(mesh.parts?.[0]?.id||'');setEdits(clone(revision.sharedEdits||emptySharedEdits(mesh)));}).catch(e=>{if(!dead)setError(e instanceof Error?e.message:'パーツを読み込めません');}).finally(()=>{if(!dead)setBusy(false);});return()=>{dead=true;};
 },[open,revision.id]);
 const centers=useMemo(()=>base?partCenters(base):new Map<string,V3>(),[base]);
 const preview=useMemo(()=>{if(!base)return null;try{return {...previewPartDesign(base,revision,edits),error:''};}catch(e){return {error:e instanceof Error?e.message:'パーツを表示できません'};}},[base,revision,edits]);
 const result=preview&&'mesh' in preview?preview:null;
 const rendered=useMemo(()=>{if(!result)return null;const mesh=isolated?{...result.mesh,triangles:result.mesh.triangles.filter(t=>t.partId===part)}:result.mesh;const hits:(SurfaceHit|undefined)[]=[],frame=renderFrame(mesh,{...revision.style,shadow:false},view,revision.size,revision.facing,hits);if(!isolated)frame.body=result.frames.find(f=>f.direction===view)?.body||frame.body;return {mesh,hits,frame};},[result,revision,part,view,isolated]);
 const views=useMemo(()=>result?renderSet(result.mesh,revision.style,'eight',revision.size,revision.facing).map(f=>result.frames.find(saved=>saved.direction===f.direction)||f):[],[result,revision]);
 const transform=Object.hasOwn(edits.parts,part)?edits.parts[part]:identityTransform(),center=centers.get(part)||[0,0,0] as V3,pivot=partPivot(center,transform),screen=projectToScreen(pivot,revision.style,view,revision.size,revision.facing);
 const name=base?.parts?.map((p,i)=>({id:p.id,name:partLabel(p,revision,i)})).find(p=>p.id===part)?.name||'パーツ';
 const changed=!!base&&JSON.stringify(edits)!==JSON.stringify(revision.sharedEdits||emptySharedEdits(base));
 const issues=result?[...new Set([...validateFrames(result.frames,revision.style,revision.mode),...validateFrames(result.baseFrames,revision.style,revision.mode),...(result.mesh.triangles.some(t=>t.vertices.some(v=>v[2]<-.015))?['パーツが地面より下にあります。位置と向きを確認してください。']:[])])]:[];
 function replace(next:SharedEdits,remember=true){if(busy)return;if(JSON.stringify(next)===JSON.stringify(draft.current))return;if(remember){const previous=clone(draft.current);setUndo(h=>[...h.slice(-19),previous]);setRedo([]);}draft.current=next;setEdits(next);setError('');}
 function editTransform(next:PartTransform,remember=true){try{validatePartTransform(next);replace({...clone(draft.current),parts:{...draft.current.parts,[part]:next}},remember);}catch(e){setError(e instanceof Error?e.message:'設定範囲を確認してください');}}
 function axis(field:'offset'|'scale'|'rotation',i:number,value:number){const t=clone(Object.hasOwn(draft.current.parts,part)?draft.current.parts[part]:identityTransform());t[field]??=[0,0,0];t[field]![i]=value;editTransform(t);}
 function relocate(world:V3,remember=true){try{const t=Object.hasOwn(draft.current.parts,part)?draft.current.parts[part]:identityTransform();editTransform(movePartPivot(center,t,world),remember);}catch(e){setError(e instanceof Error?e.message:'支点を移動できません');}}
 function history(back:boolean){const list=back?undo:redo;if(!list.length||busy)return;const previous=list.at(-1)!;if(back){setUndo(list.slice(0,-1));setRedo(h=>[...h,clone(edits)]);}else{setRedo(list.slice(0,-1));setUndo(h=>[...h,clone(edits)]);}replace(clone(previous),false);}
 function point(e:React.PointerEvent){const r=canvasArea.current!.getBoundingClientRect();return [(e.clientX-r.left)/r.width*64,(e.clientY-r.top)/r.height*64] as [number,number];}
 function pixel(p:[number,number]):[number,number]{return [clamp(Math.floor(p[0]),0,63),clamp(Math.floor(p[1]),0,63)];}
 function down(e:React.PointerEvent<HTMLElement>,forcePivot=false){if(busy||!rendered||!part||e.button!==0)return;const p=point(e),at=pixel(p),hit=rendered.hits[at[1]*64+at[0]];
  if(mode==='select'&&!forcePivot){const id=hit&&rendered.mesh.triangles[hit.triangle].partId;if(id)setPart(id);return;}
  e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);drag.current={before:clone(edits),points:[at],pivot,start:p,pointer:e.pointerId};
  if(mode==='pivot'||forcePivot){setMode('pivot');}else if(mode==='paint')showStroke([at]);
 }
 function showStroke(points:[number,number][]){if(!base||!rendered)return;try{const next=paintPartStroke(base,revision,drag.current!.before,view,part,points,color,isolated);const preview=previewPartDesign(base,revision,next),mesh=isolated?{...preview.mesh,triangles:preview.mesh.triangles.filter(t=>t.partId===part)}:preview.mesh;setStrokePixels((!isolated&&preview.frames.find(f=>f.direction===view)?.body)||renderFrame(mesh,{...revision.style,shadow:false},view,revision.size,revision.facing).body);}catch(e){setError(e instanceof Error?e.message:'模様を描けません');}}
 function move(e:React.PointerEvent<HTMLElement>){const state=drag.current;if(!state||state.pointer!==e.pointerId)return;const p=point(e);
  if(mode==='pivot'){const start=projectToScreen(state.pivot,revision.style,view,revision.size,revision.facing);relocate(dragPivotOnView(state.pivot,[start[0]+p[0]-state.start[0],start[1]+p[1]-state.start[1]],revision.style,view,revision.size,revision.facing),false);}
  else if(mode==='paint'){const at=pixel(p);if(state.points.at(-1)?.some((n,i)=>n!==at[i])){state.points.push(at);showStroke(state.points);}}
 }
 function up(e:React.PointerEvent<HTMLElement>){const state=drag.current;if(!state||state.pointer!==e.pointerId)return;
  if(e.type==='pointercancel'){replace(state.before,false);}else if(mode==='paint'&&base){try{replace(paintPartStroke(base,revision,state.before,view,part,state.points,color,isolated));}catch(e){setError(e instanceof Error?e.message:'模様を描けません');}}
  else if(JSON.stringify(state.before)!==JSON.stringify(draft.current)){setUndo(h=>[...h.slice(-19),state.before]);setRedo([]);}
  drag.current=null;setStrokePixels(null);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
 }
 function key(e:React.KeyboardEvent){if(mode!=='pivot'||busy||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const step=e.shiftKey?1:.25,dx=e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0,dy=e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0;relocate(dragPivotOnView(pivot,[screen[0]+dx,screen[1]+dy],revision.style,view,revision.size,revision.facing));}
 async function save(){if(!result||!changed)return;setBusy(true);setError('');try{await onApply(clone(edits),result);onClose();}catch(e){setError(e instanceof Error?e.message:'保存できませんでした。編集内容は残っています');}finally{setBusy(false);}}
 return <Dialog open={open} onOpenChange={v=>{if(!v&&!busy)onClose();}}><DialogContent className="part-editor-dialog" onPointerDownOutside={e=>e.preventDefault()} onEscapeKeyDown={e=>{if(busy)e.preventDefault();}}><DialogHeader><DialogTitle><Box size={20}/>パーツを編集</DialogTitle><DialogDescription>パーツの色・模様・形と向きを調整し、元の版を残して新しい候補に保存します。</DialogDescription></DialogHeader>
 {(error||preview?.error)&&<p className="motion-error" role="alert">{error||preview?.error}</p>}
 {!base?<p className="motion-loading">{busy?<><Loader2 className="spin"/>パーツを読み込んでいます</>:'元の版はそのまま残っています。'}</p>:<div className="part-editor-layout"><section className="part-editor-controls">
 <label className="field-label">編集するパーツ</label><Select value={part||'_none'} disabled={busy} onValueChange={setPart}><SelectTrigger aria-label="編集するパーツ"><SelectValue/></SelectTrigger><SelectContent>{base.parts?.map((p,i)=><SelectItem key={p.id} value={p.id}>{partLabel(p,revision,i)}</SelectItem>)}</SelectContent></Select>
 {!part&&<p className="notice">この素材には選択できるパーツがありません。</p>}
 <label className="shared-isolate"><input type="checkbox" checked={isolated} disabled={busy} onChange={e=>setIsolated(e.target.checked)}/>選択パーツだけ表示</label>
 <h3>色と模様</h3><p className="help">色を選び、地色を変更するか「模様を描く」で選んだパーツに描きます。</p>
 <div className="palette-grid">{revision.style.palette.map((c,i)=><button type="button" key={i} disabled={busy} className={color===i+1?'picked':''} style={{background:c}} aria-label={`パーツ編集の色 ${i+1} ${c}`} aria-pressed={color===i+1} onClick={()=>setColor(i+1)}/>)}</div>
 <button className="button full" disabled={busy||!part} onClick={()=>{try{replace(recolorPart(base,edits,part,revision.style.palette[color-1]));}catch(e){setError(e instanceof Error?e.message:'色を変更できません');}}}>選んだ色をパーツの地色にする</button>
 <button className="text-button" disabled={busy||!part||!edits.paints.some(p=>base.triangles[p.triangle]?.partId===part)} onClick={()=>replace(clearPartPattern(base,edits,part))}>このパーツの手描き模様を消す</button>
 <h3>向き</h3><div className="part-numbers">{['前後に傾ける','左右に傾ける','地面に沿って回す'].map((label,i)=><NumberControl key={label} label={`${label}（度）`} value={transform.rotation?.[i]||0} min={-180} max={180} step={5} disabled={busy||!part} onChange={v=>axis('rotation',i,v)}/>)}</div>
 <h3>回転の支点</h3><p className="help">十字をドラッグして支点を置き直します。別の方向からも調整できます。支点だけを動かしてもパーツの位置は変わりません。</p>
 <button className={`button full ${mode==='pivot'?'active':''}`} disabled={busy||!part} onClick={()=>setMode('pivot')}><LocateFixed size={16}/>支点を動かす</button>
 <div className="part-numbers">{['支点の左右','支点の奥行き','支点の高さ'].map((label,i)=><NumberControl key={label} label={label} value={pivot[i]} min={-5} max={5} disabled={busy||!part} onChange={v=>{const world=[...pivot] as V3;world[i]=v;relocate(world);}}/>)}</div>
 <button className="text-button" disabled={busy||!part} onClick={()=>{const middle=result&&partCenters(result.mesh).get(part);if(middle)relocate(middle);}}>支点をパーツの中央へ</button>
 <details><summary>大きさと位置</summary><div className="part-numbers">{['横の倍率','奥行きの倍率','高さの倍率'].map((label,i)=><NumberControl key={label} label={label} value={transform.scale[i]} min={.1} max={3} step={.05} disabled={busy||!part} onChange={v=>axis('scale',i,v)}/>)}{['左右へ移動','前後へ移動','上下へ移動'].map((label,i)=><NumberControl key={label} label={label} value={transform.offset[i]} min={-3} max={3} disabled={busy||!part} onChange={v=>axis('offset',i,v)}/>)}</div></details>
 <button className="text-button" disabled={busy||!Object.hasOwn(edits.parts,part)} onClick={()=>{const next=clone(edits);delete next.parts[part];replace(next);}}><RotateCcw size={14}/>このパーツの形・向き・支点を戻す</button>
 {revision.rigKind!=='prop'&&<p className="help">ここでの支点は見た目を回す基準です。歩行などの関節は「アニメーション」で調整します。</p>}
 </section><section className="part-editor-preview"><div className="panel-heading"><strong>{name} · {view}</strong><div className="part-history"><button className="tool" aria-label="パーツ編集を元に戻す" disabled={busy||!undo.length} onClick={()=>history(true)}><Undo2 size={18}/></button><button className="tool" aria-label="パーツ編集をやり直す" disabled={busy||!redo.length} onClick={()=>history(false)}><Redo2 size={18}/></button></div></div>
 <div className="part-editor-tools">{[{id:'select' as const,name:'パーツを選ぶ',Icon:MousePointer2},{id:'paint' as const,name:'模様を描く',Icon:Pencil},{id:'pivot' as const,name:'支点を動かす',Icon:LocateFixed}].map(t=><button key={t.id} type="button" className={`button ${mode===t.id?'active':''}`} aria-pressed={mode===t.id} disabled={busy||!part} onClick={()=>setMode(t.id)}><t.Icon size={16}/>{t.name}</button>)}</div>
 <div className="part-canvas-wrap"><div ref={canvasArea} className={`part-canvas mode-${mode}`}>
 {rendered&&<PixelCanvas pixels={strokePixels||rendered.frame.body} palette={revision.style.palette} scale={6} label={`パーツ編集キャンバス ${view}`} onPointerDown={e=>down(e)} onPointerMove={e=>move(e)} onPointerUp={e=>up(e)}/>}
 {mode==='pivot'&&part&&<button type="button" className="part-pivot" aria-label="回転の支点をドラッグ（矢印キーでも移動）" style={{left:`${clamp(screen[0],0,64)/64*100}%`,top:`${clamp(screen[1],0,64)/64*100}%`}} disabled={busy} onKeyDown={key} onPointerDown={e=>down(e,true)} onPointerMove={move} onPointerUp={up} onPointerCancel={up}><LocateFixed size={30}/></button>}
 </div></div><p className="help">{mode==='pivot'?'十字をドラッグ／矢印キーで微調整。Shift＋矢印で大きく移動。':mode==='paint'?'選択パーツの見えている面だけに描きます。輪郭や背景は変更しません。':'キャンバスのパーツをクリックして選べます。隠れたパーツは一覧か別方向から選んでください。'}</p>
 {mode==='pivot'&&(screen[0]<0||screen[0]>64||screen[1]<0||screen[1]>64)&&<p className="notice">支点が画面の外にあります。「パーツの中央へ」で戻せます。</p>}
 <div className="shared-direction-grid part-directions">{views.map(f=><button key={f.direction} type="button" aria-label={`パーツ編集 ${f.direction}方向`} aria-pressed={view===f.direction} className={view===f.direction?'selected':''} disabled={busy} onClick={()=>setView(f.direction)}><PixelCanvas pixels={f.body} palette={revision.style.palette} scale={2} label={`パーツ編集後 ${f.direction}`}/><span>{f.direction}</span></button>)}</div>
 {revision.mode==='front'&&<p className="help">確認用に8方向を表示しています。保存する画像は正面のみです。</p>}
 {!!result?.localOnly&&<p className="notice">表面に共有されていない手描きの画素は、元の方向・位置に残ります。一緒に回す模様は、先に「手修正を全方向へ反映」で共有してください。</p>}
 </section></div>}
 {!!issues.length&&<p className="notice" role="status">保存する前に確認してください：{issues.slice(0,4).join(' / ')}</p>}
 <footer className="shared-edit-footer"><button className="button" disabled={busy} onClick={onClose}>キャンセル</button><button className="button primary" disabled={busy||!result||!changed||issues.length>0} onClick={()=>void save()}>{busy?<Loader2 className="spin" size={16}/>:<Check size={16}/>}パーツ修正を新候補に保存</button></footer>
 </DialogContent></Dialog>;
}
