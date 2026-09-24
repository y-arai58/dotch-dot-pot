import {DIRECTIONS,RENDERER_VERSION,clone,renderFrame,renderSet,type Direction,type Mesh,type Project,type Revision,type RevisionReason,type Style} from '@/lib/pixel';
import {newId,now} from './api';

export const MAX_REVISIONS=20;
const REASON_LABELS:Record<RevisionReason,string>={
 sample:'サンプルから作成',skill:'Codexで作成',import:'3Dモデルを持ち込み',duplicate:'複製',restyle:'新しいスタイルで再描画',regenerate:'全方向を描き直し',
 'redraw-direction':'1方向を描き直し','extend-eight':'正面から8方向へ拡張','shared-edit':'手修正を全方向へ反映','part-edit':'パーツを編集','articulated':'動作用モデルへ置き換え',
};
const SOURCE_LABELS:Record<Revision['source'],string>={sample:'サンプルから作成',skill:'Codexで作成',import:'3Dモデルを持ち込み',tripo:'旧生成サービスで作成'};
export const SOURCE_TAGS:Record<Revision['source'],string>={sample:'サンプル',skill:'Codex',import:'持ち込み',tripo:'旧生成'};

export const versionLabel=(revisions:Revision[],id:string|undefined)=>{const i=revisions.findIndex(r=>r.id===id);return i<0?'':`版${i+1}`;};
/** Why a version exists. Older revisions have no `reason`, so it is inferred from the parent. */
export function reasonLabel(r:Revision,revisions:Revision[]):string{
 const parent=revisions.find(p=>p.id===r.parentRevisionId),from=parent?`${versionLabel(revisions,parent.id)}から`:'';
 if(r.reason)return r.reason==='duplicate'?`${versionLabel(revisions,parent?.id)||'元の版'}を複製`:`${from}${REASON_LABELS[r.reason]}`;
 if(!parent)return SOURCE_LABELS[r.source];
 if(JSON.stringify(parent.sharedEdits)!==JSON.stringify(r.sharedEdits))return `${from}共通の修正`;
 if(parent.style.id!==r.style.id)return `${from}${REASON_LABELS.restyle}`;
 if(parent.mode!==r.mode)return `${from}${REASON_LABELS['extend-eight']}`;
 return `${from}作成`;
}
export function styleNumber(project:Pick<Project,'styles'>|null|undefined,style:Style){const i=project?.styles.findIndex(s=>s.id===style.id)??-1;return i<0?1:i+1;}
export function latestStyle(project:Pick<Project,'styles'>){return project.styles[project.styles.length-1];}

/** A new unapproved candidate derived from `r`. */
export function candidateFrom(r:Revision,reason:RevisionReason,patch:Partial<Revision>={}):Revision{
 return {...clone(r),id:newId(),createdAt:now(),parentRevisionId:r.id,approved:false,reviewed:false,issues:'',reason,...patch};
}
export type RedrawTarget='all'|'direction'|'extend';
/** Re-render a revision from its geometry: every direction, one direction, or front → eight. */
export function redrawCandidate(r:Revision,mesh:Mesh,target:RedrawTarget,options:{style:Style;size:number;facing:number;direction:Direction}):Revision{
 const {style,size,facing,direction}=options,mode=target==='extend'?'eight':r.mode;
 let frames=renderSet(mesh,style,mode,size,facing);
 if(target==='direction')frames=r.frames.map(f=>f.direction===direction?renderFrame(mesh,style,direction,size,facing):clone(f));
 if(target==='extend')frames=frames.map(f=>f.direction==='S'?clone(r.frames[0]):f);
 const reason:RevisionReason=target==='direction'?'redraw-direction':target==='extend'?'extend-eight':style.id!==r.style.id?'restyle':'regenerate';
 return candidateFrom(r,reason,{rendererVersion:RENDERER_VERSION,style:clone(style),mode,frames,baseFrames:clone(frames),facing,size});
}
export {DIRECTIONS};
