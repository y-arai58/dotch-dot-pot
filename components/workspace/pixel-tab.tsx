'use client';
import Link from 'next/link';
import {useEffect,useMemo,useRef,useState} from 'react';
import {Check,Eraser,Grid2X2,Layers,Minus,MoreHorizontal,PaintBucket,Pause,Pencil,Pipette,Play,Plus,Settings2,Square} from 'lucide-react';
import {toast} from 'sonner';
import {DIRECTIONS,composite,drawLine,floodFill,validateFrames,type Direction} from '@/lib/pixel';
import {frameDifference} from '@/lib/shared-edit-proposal';
import {KIND_LABELS,revisionKind} from '@/lib/asset-summary';
import {SOURCE_TAGS} from '@/lib/studio/revisions';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {PixelCanvas} from '@/components/pixel-canvas';
import {Banner,Sprite} from '@/components/studio/ui';
import {useWorkspace,type Tool} from './workspace-provider';

const TOOLS:{id:Tool;label:string;key:string;Icon:typeof Pencil}[]=[{id:'pencil',label:'鉛筆',key:'B',Icon:Pencil},{id:'eraser',label:'消しゴム',key:'E',Icon:Eraser},{id:'fill',label:'塗りつぶし',key:'G',Icon:PaintBucket},{id:'picker',label:'スポイト',key:'I',Icon:Pipette},{id:'select',label:'矩形選択',key:'M',Icon:Square}];
const ZOOMS=[2,3,4,5,6,7,8,10];

export function PixelTab({active}:{active:boolean}){
 const w=useWorkspace(),{revision,frame,asset}=w;
 const stroke=useRef<{from:[number,number]}|null>(null);
 const [kept,setKept]=useState<Set<string>>(new Set());
 const edits=useMemo(()=>revision?revision.frames.map(f=>{const b=revision.baseFrames.find(x=>x.direction===f.direction);return {direction:f.direction,count:b?frameDifference(b,f).count:0};}):[],[revision]);
 const edited=edits.filter(e=>e.count>0),editedTotal=edited.reduce((n,e)=>n+e.count,0);
 const others=edits.length-edited.length;
 // keyboard: tools, undo/redo, save — only while this tab is shown and focus is not in a field
 useEffect(()=>{if(!active)return;const onKey=(e:KeyboardEvent)=>{const t=e.target as HTMLElement;if(t.closest('input,textarea,select,[contenteditable="true"],[role="dialog"]'))return;const mod=e.metaKey||e.ctrlKey,k=e.key.toLowerCase();
  if(mod&&k==='z'){e.preventDefault();w.history(e.shiftKey?'redo':'undo');return;}
  if(mod&&k==='s'){e.preventDefault();if(w.dirty)void w.run(w.save);return;}
  if(mod||e.altKey)return;const tool=TOOLS.find(x=>x.key.toLowerCase()===k);if(tool){w.setTool(tool.id);e.preventDefault();}};
  window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);},[active,w]);
 // WebMCP: expose read-only inspection and direction selection to supporting browsers
 const live=useRef(w);useEffect(()=>{live.current=w;});
 useEffect(()=>{const context=(document as Document&{modelContext?:{registerTool:(tool:unknown,options:{signal:AbortSignal})=>Promise<void>|void}}).modelContext;if(!context?.registerTool)return;const lifecycle=new AbortController();const register=(tool:unknown)=>{try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}};
  register({name:'inspect_sprite',description:'Read the current 64 by 64 sprite, directions and validation results.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:()=>{const r=live.current.revision;if(!r)return {};return {asset:r.name,directions:r.frames.map(f=>f.direction),styleVersion:r.style.id,approved:r.approved,issues:validateFrames(r.frames,r.style,r.mode)};}});
  register({name:'select_sprite_direction',description:'Show an existing direction in the pixel editor. Does not generate or save.',inputSchema:{type:'object',properties:{direction:{type:'string',enum:[...DIRECTIONS]}},required:['direction'],additionalProperties:false},annotations:{readOnlyHint:false},execute:(input:unknown)=>{const d=(input as {direction?:Direction}).direction,r=live.current.revision;if(!d||!r||!r.frames.some(f=>f.direction===d))throw Error('This direction is unavailable');live.current.setDirection(d);return {direction:d};}});
  return()=>lifecycle.abort();},[]);
 if(!revision||!frame||!asset)return null;
 const palette=revision.style.palette,display=composite(frame,w.layer),canEdit=!w.locked&&!w.busy;
 function point(e:React.PointerEvent<HTMLCanvasElement>):[number,number]{const r=e.currentTarget.getBoundingClientRect();return [Math.max(0,Math.min(63,Math.floor((e.clientX-r.left)*64/r.width))),Math.max(0,Math.min(63,Math.floor((e.clientY-r.top)*64/r.height)))];}
 function down(e:React.PointerEvent<HTMLCanvasElement>){
  if(!frame)return;if(w.tool==='picker'){const p=point(e);w.setColor(composite(frame,w.layer)[p[1]*64+p[0]]);return;}
  if(!canEdit){if(w.locked)toast.info('採用済みの版は変更できません。「複製して編集」から新しい候補を作ってください');return;}
  w.setPlaying(false);const p=point(e),pixels=w.layer==='shadow'?frame.shadow:frame.body;
  if(w.layer==='composite'){toast.info('「物体」か「地面の影」のレイヤーを選んでから描いてください');return;}
  e.currentTarget.setPointerCapture(e.pointerId);stroke.current={from:p};
  if(w.tool==='select'){w.setSelection({start:p,end:p});return;}
  w.beginStroke();w.editPixels(w.tool==='fill'?floodFill(pixels,p[1]*64+p[0],w.color):drawLine(pixels,p,p,w.tool==='eraser'?0:w.color));
 }
 function move(e:React.PointerEvent<HTMLCanvasElement>){
  if(!stroke.current||!frame)return;const p=point(e);
  if(w.tool==='select'){w.setSelection(w.selection?{...w.selection,end:p}:null);return;}
  if(w.tool==='fill')return;w.editPixels(drawLine(w.layer==='shadow'?frame.shadow:frame.body,stroke.current.from,p,w.tool==='eraser'?0:w.color));stroke.current.from=p;
 }
 function fillSelection(){if(!w.selection||!frame||w.layer==='composite')return;const s=w.selection,next=[...(w.layer==='shadow'?frame.shadow:frame.body)],x0=Math.min(s.start[0],s.end[0]),x1=Math.max(s.start[0],s.end[0]),y0=Math.min(s.start[1],s.end[1]),y1=Math.max(s.start[1],s.end[1]);
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)next[y*64+x]=w.color;w.putFrames(revision!.frames.map(f=>f.direction===frame.direction?{...f,[w.layer==='shadow'?'shadow':'body']:next}:f));w.setSelection(null);}
 const sel=w.selection&&{w:Math.abs(w.selection.end[0]-w.selection.start[0])+1,h:Math.abs(w.selection.end[1]-w.selection.start[1])+1};
 const showEditBanner=edited.length>0&&others>0&&!w.legacyHumanoid&&!w.locked&&!kept.has(revision.id);
 const zoomIndex=Math.max(0,ZOOMS.indexOf(w.zoom));
 return <div className="pixel-tab">
  <div className="tool-rail" role="toolbar" aria-label="描画ツール" aria-orientation="vertical">
   {TOOLS.map(t=><button key={t.id} type="button" className={`tool${w.tool===t.id?' active':''}`} aria-pressed={w.tool===t.id} aria-label={`${t.label}（${t.key}）`} title={`${t.label}（${t.key}）`} onClick={()=>w.setTool(t.id)}><t.Icon size={18}/></button>)}
   <span className="rail-divider"/>
   <button type="button" className={`tool${w.grid?' active':''}`} aria-pressed={w.grid} aria-label="グリッド" title="グリッド" onClick={()=>w.setGrid(!w.grid)}><Grid2X2 size={18}/></button>
  </div>
  <div className="pixel-stage">
   {showEditBanner&&<Banner icon={<Layers size={16}/>} actions={<><Link className="button small primary" href={`${w.base}/pixel/propagate`}>全方向へ反映</Link><button type="button" className="button small ghost" onClick={()=>setKept(s=>new Set(s).add(revision.id))}>この方向だけに残す</button></>}>
    <b>{edited.map(e=>e.direction).join('・')}方向だけに手修正が{editedTotal}画素あります。</b>他の{others}方向と動作には、まだ反映されていません。
   </Banner>}
   <div className="canvas-area">
    <span className="canvas-chip">{frame.direction} · {w.layer==='body'?'物体':w.layer==='shadow'?'地面の影':'合成'} · 64×64</span>
    <div className={`canvas-frame tool-${w.tool}`}><PixelCanvas pixels={display} palette={palette} scale={w.zoom} label={`${asset.name} ${frame.direction} 64×64 編集キャンバス`} grid={w.grid} onPointerDown={down} onPointerMove={move} onPointerUp={()=>{stroke.current=null;}}/></div>
    <div className="zoom-control"><button type="button" className="tool" aria-label="縮小" disabled={zoomIndex===0} onClick={()=>w.setZoom(ZOOMS[zoomIndex-1])}><Minus size={15}/></button><output>{w.zoom}×</output><button type="button" className="tool" aria-label="拡大" disabled={zoomIndex===ZOOMS.length-1} onClick={()=>w.setZoom(ZOOMS[zoomIndex+1])}><Plus size={15}/></button></div>
   </div>
   {sel&&<div className="selection-bar"><span>選択範囲 {sel.w}×{sel.h}</span><button type="button" className="button small" disabled={!canEdit||w.layer==='composite'} onClick={fillSelection}>描画色で塗る</button><button type="button" className="text-button" onClick={()=>w.setSelection(null)}>選択を解除</button></div>}
   <div className="direction-strip">
    <div className="direction-list" role="group" aria-label="方向">{revision.frames.map(f=>{const e=edits.find(x=>x.direction===f.direction);return <div key={f.direction} className={`direction-item${f.direction===frame.direction?' selected':''}`}>
     <button type="button" className="direction-thumb" aria-label={`${f.direction}方向を表示`} aria-pressed={f.direction===frame.direction} onClick={()=>{w.setDirection(f.direction);w.setSelection(null);}}><Sprite pixels={composite(f)} palette={palette} size={56} label={`${f.direction}方向`}/>{e&&e.count>0&&<i className="edit-mark" title={`手修正 ${e.count}画素`}/>}<span>{f.direction}</span></button>
     <DropdownMenu><DropdownMenuTrigger className="direction-more" aria-label={`${f.direction}方向のメニュー`}><MoreHorizontal size={14}/></DropdownMenuTrigger><DropdownMenuContent align="center">
      <DropdownMenuItem onSelect={()=>w.setDirection(f.direction)}>この方向を表示</DropdownMenuItem>
      <DropdownMenuItem disabled={w.busy||w.dirty||!w.canReuse} onSelect={()=>void w.run(()=>w.redraw('direction',{direction:f.direction}))}>この方向だけ描き直す（新しい候補）</DropdownMenuItem>
     </DropdownMenuContent></DropdownMenu>
    </div>;})}</div>
    <button type="button" className="button small ghost" disabled={revision.frames.length===1} onClick={()=>w.setPlaying(!w.playing)}>{w.playing?<Pause size={14}/>:<Play size={14}/>}連続表示</button>
   </div>
  </div>
  <aside className="inspector">
   <section className="panel-section"><div className="section-heading"><h3>描画色</h3><span className="current-color"><i style={{background:w.color?palette[w.color-1]:'transparent'}}/>{w.color?`${w.color} · ${palette[w.color-1]}`:'透明'}</span></div>
    <div className="palette-grid">{palette.map((c,i)=><button key={i} type="button" className={w.color===i+1?'picked':''} style={{background:c}} aria-label={`色 ${i+1} ${c}`} aria-pressed={w.color===i+1} onClick={()=>w.setColor(i+1)}/>)}</div>
    <p className="help">パレットはプロジェクト共通です。色を変えるときは<Link href={`/p/${w.projectId}/style`}>スタイル</Link>を開きます。</p></section>
   <section className="panel-section"><h3>レイヤー</h3><div className="radio-list" role="radiogroup" aria-label="レイヤー">{[{v:'body',l:'物体'},{v:'shadow',l:'地面の影'},{v:'composite',l:'合成プレビュー（編集不可）'}].map(o=><label key={o.v}><input type="radio" name="pixel-layer" checked={w.layer===o.v} onChange={()=>w.setLayer(o.v as typeof w.layer)}/>{o.l}</label>)}</div></section>
   <section className="panel-section"><h3>画素の検証</h3>{w.errors.length?<ul className="issue-list">{w.errors.map((e,i)=><li key={i}>{e}</li>)}</ul>:<p className="ok-line"><Check size={14}/>64×64 · パレット内 · 半透明なし</p>}</section>
   <section className="panel-section"><h3>この素材</h3><p className="help">{SOURCE_TAGS[revision.source]} · {KIND_LABELS[revisionKind(revision)]} · {revision.mode==='eight'?'8方向':'正面のみ'}</p>
    <button type="button" className="button full" onClick={()=>w.setSettingsOpen(true)}><Settings2 size={15}/>アセット設定</button><p className="help">正面補正・相対サイズ・全方向の新候補・保持する特徴</p></section>
  </aside>
 </div>;
}
