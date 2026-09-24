'use client';
import {createContext,useCallback,useContext,useEffect,useMemo,useState} from 'react';
import {toast} from 'sonner';
import {RENDERER_VERSION,buildMesh,canReuseFrames,clone,renderSet,validateFrames,type Asset,type Direction,type Frame,type Revision,type RevisionReason,type Style} from '@/lib/pixel';
import {articulatedReplacement} from '@/lib/sample-models';
import {sharedCandidateAsset} from '@/lib/revision-candidates';
import type {SharedEdits} from '@/lib/shared-edits';
import type {AnimationDocument} from '@/lib/animation';
import type {AnimalDocument} from '@/lib/animal-animation';
import {hasMotion} from '@/lib/asset-summary';
import {api,errorMessage} from '@/lib/studio/api';
import {demoAsset,isDemoProject} from '@/lib/studio/demo';
import {meshFor} from '@/lib/studio/mesh';
import {MAX_REVISIONS,candidateFrom,latestStyle,redrawCandidate,type RedrawTarget} from '@/lib/studio/revisions';
import {useProject} from '@/components/project/project-provider';

export type Tool='pencil'|'eraser'|'fill'|'picker'|'select';
export type Layer='body'|'shadow'|'composite';
export type EditorKey='pixel'|'parts'|'motion';
export type EditorState={dirty:boolean;label:string;discard:()=>void};
export type MotionDoc=AnimationDocument|AnimalDocument;
export type MotionSet={id:string;name:string;sourceRevisionId:string;version:number;reviewed:number;updatedAt?:string};
export type MotionInfo={loaded:boolean;currentId:string|null;dirty:boolean;busy:boolean};
/** Lets the version panel and the review tab drive a mounted motion editor. */
export type MotionController={select:(id:string)=>void;adopt:(doc:MotionDoc)=>void};
const IDLE_MOTION:MotionInfo={loaded:false,currentId:null,dirty:false,busy:false};
type Selection={start:[number,number];end:[number,number]}|null;

type Workspace={
 projectId:string;assetId:string;base:string;isDemo:boolean;
 asset:Asset|null;loadError:string;reload:()=>void;
 revIndex:number;revision:Revision|null;frame:Frame|null;selectRevision:(i:number)=>void;
 direction:Direction;setDirection:(d:Direction)=>void;
 tool:Tool;setTool:(t:Tool)=>void;color:number;setColor:(c:number)=>void;layer:Layer;setLayer:(l:Layer)=>void;
 zoom:number;setZoom:(z:number)=>void;grid:boolean;setGrid:(g:boolean)=>void;playing:boolean;setPlaying:(p:boolean)=>void;
 selection:Selection;setSelection:(s:Selection)=>void;
 dirty:boolean;changedPixels:number;canUndo:boolean;canRedo:boolean;
 beginStroke:()=>void;editPixels:(pixels:number[])=>void;putFrames:(frames:Frame[])=>void;history:(which:'undo'|'redo')=>void;
 save:()=>Promise<void>;discardPixels:()=>void;
 busy:boolean;run:(fn:()=>Promise<unknown>)=>Promise<boolean>;
 facing:number;setFacing:(n:number)=>void;size:number;setSize:(n:number)=>void;
 errors:string[];canReuse:boolean;locked:boolean;
 duplicate:()=>Promise<void>;redraw:(target:RedrawTarget,options?:{style?:Style;direction?:Direction})=>Promise<void>;createArticulatedCandidate:()=>Promise<void>;
 applySharedChanges:(edits:SharedEdits,preview:{frames:Frame[];baseFrames:Frame[]},reason:RevisionReason)=>Promise<void>;
 approve:()=>Promise<void>;saveIssues:(issues:string)=>Promise<void>;
 latestProjectStyle:Style|null;styleOutdated:boolean;rendererOutdated:boolean;legacyHumanoid:boolean;motionAvailable:boolean;
 editors:Partial<Record<EditorKey,EditorState>>;registerEditor:(key:EditorKey,state:EditorState|null)=>void;anyDirty:boolean;
 motionStore:{cache:Map<string,MotionDoc>;demoHistory:Map<string,MotionDoc>};
 motionSets:MotionSet[];reportMotionSets:(revisionId:string,sets:MotionSet[])=>void;motionInfo:MotionInfo;reportMotionInfo:(revisionId:string,info:MotionInfo)=>void;
 setMotionController:(c:MotionController|null)=>void;requestMotion:(id:string)=>void;publishMotion:(doc:MotionDoc)=>void;
 settingsOpen:boolean;setSettingsOpen:(open:boolean)=>void;
};
const Context=createContext<Workspace|null>(null);
export function useWorkspace(){const value=useContext(Context);if(!value)throw Error('WorkspaceProvider is missing');return value;}
const countChanges=(a:Frame[],b:Frame[])=>a.reduce((n,f)=>{const o=b.find(x=>x.direction===f.direction);if(!o)return n;for(let i=0;i<4096;i++)if(f.body[i]!==o.body[i]||f.shadow[i]!==o.shadow[i])n++;return n;},0);

/** Everything the asset workspace tabs share: the asset, the selected version, drawing state and version actions. */
export function WorkspaceProvider({assetId,children}:{assetId:string;children:React.ReactNode}){
 const project=useProject(),{projectId,saveAsset,noteAsset}=project,isDemo=isDemoProject(projectId),base=`/p/${projectId}/a/${assetId}`;
 const [asset,setAsset]=useState<Asset|null>(null),[loadError,setLoadError]=useState(''),[reloadKey,setReloadKey]=useState(0);
 const [revIndex,setRevIndex]=useState(0),[direction,setDirection]=useState<Direction>('S');
 const [tool,setTool]=useState<Tool>('pencil'),[color,setColor]=useState(10),[layer,setLayer]=useState<Layer>('body'),[zoom,setZoom]=useState(7),[grid,setGrid]=useState(true),[playing,setPlaying]=useState(false);
 const [selection,setSelection]=useState<Selection>(null),[dirty,setDirty]=useState(false),[undo,setUndo]=useState<Frame[][]>([]),[redo,setRedo]=useState<Frame[][]>([]);
 const [busy,setBusy]=useState(false),[facing,setFacing]=useState(0),[size,setSize]=useState(1),[settingsOpen,setSettingsOpen]=useState(false);
 const [editors,setEditors]=useState<Partial<Record<EditorKey,EditorState>>>({});
 const [reported,setReported]=useState<{revisionId:string;sets?:MotionSet[];info?:MotionInfo}|null>(null),[fetchedSets,setFetchedSets]=useState<{revisionId:string;sets:MotionSet[]}|null>(null);
 const [motionController,setMotionController]=useState<MotionController|null>(null);
 const [saved,setSaved]=useState<Asset|null>(null),[motionStore]=useState(()=>({cache:new Map<string,MotionDoc>(),demoHistory:new Map<string,MotionDoc>()}));
 const reset=useCallback((a:Asset,index:number)=>{const r=a.revisions[index];setRevIndex(index);setFacing(r.facing);setSize(r.size);setDirection('S');setUndo([]);setRedo([]);setSelection(null);setPlaying(false);},[]);
 useEffect(()=>{let dead=false;
  (async()=>{setLoadError('');const a=isDemo?demoAsset(assetId):await api<Asset>('/api/studio?assetId='+encodeURIComponent(assetId));if(!a)throw Error('サンプルが見つかりません');if(a.projectId!==projectId)throw Error('このアセットは別のプロジェクトにあります');
   if(dead)return;const wanted=new URL(location.href).searchParams.get('rev'),index=Math.max(0,a.revisions.findIndex(r=>r.id===wanted));
   setSaved(clone(a));setAsset(a);setDirty(false);reset(a,wanted&&index>=0&&a.revisions[index]?.id===wanted?index:a.revisions.length-1);
  })().catch(e=>{if(!dead)setLoadError(errorMessage(e,'アセットを読み込めませんでした'));});
  return()=>{dead=true;};
 },[assetId,projectId,isDemo,reloadKey,reset]);
 const revision=asset?.revisions[revIndex]||asset?.revisions[0]||null;
 const frame=revision?(revision.frames.find(f=>f.direction===direction)||revision.frames[0]):null;
 const errors=useMemo(()=>revision?validateFrames(revision.frames,revision.style,revision.mode):[],[revision]);
 const changedPixels=useMemo(()=>{if(!dirty||!revision)return 0;const old=saved?.revisions.find(r=>r.id===revision.id);return old?countChanges(revision.frames,old.frames):0;},[dirty,revision,saved]);
 useEffect(()=>{const url=new URL(location.href);if(!asset||!revision)return;const latest=revIndex===asset.revisions.length-1;if(latest)url.searchParams.delete('rev');else url.searchParams.set('rev',revision.id);history.replaceState(history.state,'',url);},[asset,revision,revIndex]);
 useEffect(()=>{if(!playing||!revision)return;const timer=setInterval(()=>setDirection(d=>{const i=revision.frames.findIndex(f=>f.direction===d);return revision.frames[(i+1)%revision.frames.length].direction;}),280);return()=>clearInterval(timer);},[playing,revision]);
 const anyDirty=dirty||Object.values(editors).some(e=>e?.dirty);
 useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{if(anyDirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[anyDirty]);
 // Saved motion sets for the version panel: what the mounted editor reports for this version, else a fetch (or the demo store).
 const revisionId=revision?.id||'',fresh=reported?.revisionId===revisionId;
 useEffect(()=>{if(!revisionId||isDemo||!asset||!revision||!hasMotion(revision))return;let dead=false;
  api<{items:MotionSet[]}>('/api/animations?assetId='+asset.id).then(d=>{if(!dead)setFetchedSets({revisionId,sets:d.items.filter(x=>x.sourceRevisionId===revisionId)});}).catch(()=>{if(!dead)setFetchedSets({revisionId,sets:[]});});
  return()=>{dead=true;};
 },[asset,revision,revisionId,isDemo]);
 const demoSets=isDemo?[...motionStore.demoHistory.values()].filter(d=>d.sourceRevisionId===revisionId).map(d=>({id:d.id,name:d.name,sourceRevisionId:d.sourceRevisionId,version:d.version,reviewed:d.reviewed?1:0,updatedAt:d.updatedAt})):[];
 const motionSets=fresh&&reported?.sets?reported.sets:isDemo?demoSets:fetchedSets?.revisionId===revisionId?fetchedSets.sets:[];
 const motionInfo=fresh&&reported?.info?reported.info:IDLE_MOTION;
 const reportMotionSets=useCallback((id:string,sets:MotionSet[])=>setReported(r=>({...(r?.revisionId===id?r:{}),revisionId:id,sets})),[]);
 const reportMotionInfo=useCallback((id:string,info:MotionInfo)=>setReported(r=>({...(r?.revisionId===id?r:{}),revisionId:id,info})),[]);
 function publishMotion(doc:MotionDoc){
  if(asset&&revision){const key=asset.id+':'+revision.id;if(motionStore.cache.get(key)?.id===doc.id)motionStore.cache.set(key,clone(doc));}
  if(fresh&&reported?.sets)setReported({...reported,sets:reported.sets.map(x=>x.id===doc.id?{...x,reviewed:doc.reviewed?1:0,version:doc.version}:x)});
  if(fetchedSets)setFetchedSets({...fetchedSets,sets:fetchedSets.sets.map(x=>x.id===doc.id?{...x,reviewed:doc.reviewed?1:0,version:doc.version}:x)});
  motionController?.adopt(doc);
 }
 const run=useCallback(async(fn:()=>Promise<unknown>)=>{setBusy(true);try{await fn();return true;}catch(e){toast.error(errorMessage(e));return false;}finally{setBusy(false);}},[]);
 async function persist(a:Asset){const result=await saveAsset(a);setSaved(clone(result));setAsset(result);setDirty(false);noteAsset(result);return result;}
 function updateRevision(update:(r:Revision)=>Revision){
  if(!revision)return;if(revision.approved){toast.info('採用済みの版は変更できません。「複製して編集」から新しい候補を作ってください');return;}
  setAsset(a=>a&&({...a,revisions:a.revisions.map((r,i)=>i===revIndex?update(r):r)}));setDirty(true);
 }
 function beginStroke(){if(!revision)return;setUndo(u=>[...u.slice(-39),clone(revision.frames)]);setRedo([]);}
 function editPixels(pixels:number[]){if(!frame)return;const key=layer==='shadow'?'shadow':'body';updateRevision(r=>({...r,frames:r.frames.map(f=>f.direction===frame.direction?{...f,[key]:pixels}:f),reviewed:false}));}
 function putFrames(frames:Frame[]){beginStroke();updateRevision(r=>({...r,frames,reviewed:false}));}
 function historyStep(which:'undo'|'redo'){
  const list=which==='undo'?undo:redo;if(!list.length||!revision||revision.approved)return;const prev=list[list.length-1];
  if(which==='undo'){setUndo(list.slice(0,-1));setRedo(r=>[...r,clone(revision.frames)]);}else{setRedo(list.slice(0,-1));setUndo(u=>[...u,clone(revision.frames)]);}
  updateRevision(r=>({...r,frames:prev,reviewed:false}));
 }
 function discardPixels(){if(!saved)return;const a=clone(saved);setAsset(a);setDirty(false);setUndo([]);setRedo([]);setSelection(null);toast.success('描き込みを保存した状態に戻しました');}
 async function save(){if(!asset)return;await persist(asset);toast.success(isDemo?'この画面内で保持しました':'保存しました');}
 async function appendRevision(r:Revision,preserveSource=false){
  if(!asset||!saved)return;if(asset.revisions.length>=MAX_REVISIONS)throw Error(`このアセットは${MAX_REVISIONS}版の上限に達しました`);
  const next=preserveSource?sharedCandidateAsset(saved,asset,r):{...asset,revisions:[...asset.revisions,r]};
  const result=await persist(next);reset(result,result.revisions.length-1);
 }
 function selectRevision(i:number){if(!asset||i===revIndex)return;if(dirty){toast.info('描き込みを保存するか破棄してから、版を切り替えてください');return;}reset(asset,i);}
 async function duplicate(){if(!revision)return;if(dirty)throw Error('先に描き込みを保存してください');await appendRevision(candidateFrom(revision,'duplicate'));toast.success('複製した候補を作りました。こちらで編集できます');}
 async function redraw(target:RedrawTarget,options:{style?:Style;direction?:Direction}={}){
  if(!revision||!frame)return;if(dirty)throw Error('先に描き込みを保存してください');
  if(target!=='all'&&!canReuseFrames(revision,size,facing))throw Error('描画方式・サイズ・正面補正が変わっています。全方向の新候補を作ってください');
  const at=options.direction||frame.direction;
  await appendRevision(redrawCandidate(revision,await meshFor(revision),target,{style:options.style||revision.style,size,facing,direction:at}));
  toast.success(target==='direction'?`${at}方向を描き直した候補を作りました`:'新しい候補を作りました');
 }
 async function createArticulatedCandidate(){
  if(!revision)return;const model=revision.source==='sample'?articulatedReplacement(revision.modelId):undefined;if(!model)return;
  const frames=renderSet(buildMesh(model),revision.style,revision.mode,revision.size,revision.facing);
  await appendRevision(candidateFrom(revision,'articulated',{modelId:model.id,rigKind:'humanoid',rendererVersion:RENDERER_VERSION,sharedEdits:undefined,frames,baseFrames:clone(frames)}));
  toast.success('動作用モデルの新候補を作りました。元の版と手修正も残っています');
 }
 async function applySharedChanges(edits:SharedEdits,preview:{frames:Frame[];baseFrames:Frame[]},reason:RevisionReason){
  if(!revision)return;await appendRevision(candidateFrom(revision,reason,{sharedEdits:clone(edits),frames:preview.frames,baseFrames:preview.baseFrames}),true);
  toast.success('元の版を残して、修正した新候補を保存しました');
 }
 async function approve(){if(!asset)return;await persist({...asset,revisions:asset.revisions.map((r,i)=>i===revIndex?{...r,approved:true,reviewed:true,issues:''}:r)});toast.success('採用版として保存しました');}
 async function saveIssues(issues:string){if(!asset)return;await persist({...asset,revisions:asset.revisions.map((r,i)=>i===revIndex?{...r,reviewed:false,issues}:r)});toast.success('指摘を保存しました');}
 const registerEditor=useCallback((key:EditorKey,state:EditorState|null)=>setEditors(e=>{if(!state){if(!e[key])return e;const next={...e};delete next[key];return next;}const old=e[key];if(old&&old.dirty===state.dirty&&old.label===state.label&&old.discard===state.discard)return e;return {...e,[key]:state};}),[]);
 const latestProjectStyle=project.project?latestStyle(project.project):null;
 const value:Workspace={projectId,assetId,base,isDemo,asset,loadError,reload:()=>setReloadKey(k=>k+1),
  revIndex,revision,frame,selectRevision,direction,setDirection,tool,setTool,color,setColor,layer,setLayer,zoom,setZoom,grid,setGrid,playing,setPlaying,selection,setSelection,
  dirty,changedPixels,canUndo:undo.length>0,canRedo:redo.length>0,beginStroke,editPixels,putFrames,history:historyStep,save,discardPixels,busy,run,
  facing,setFacing,size,setSize,errors,canReuse:!!revision&&canReuseFrames(revision,size,facing),locked:!!revision?.approved,
  duplicate,redraw,createArticulatedCandidate,applySharedChanges,approve,saveIssues,
  latestProjectStyle,styleOutdated:!!revision&&!!latestProjectStyle&&revision.style.id!==latestProjectStyle.id,rendererOutdated:!!revision&&revision.rendererVersion!==RENDERER_VERSION,
  legacyHumanoid:!!revision&&revision.source==='sample'&&!!articulatedReplacement(revision.modelId),motionAvailable:!!revision&&hasMotion(revision),
  editors,registerEditor,anyDirty,motionStore,motionSets,reportMotionSets,motionInfo,reportMotionInfo,
  setMotionController,requestMotion:id=>motionController?.select(id),publishMotion,
  settingsOpen,setSettingsOpen};
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
