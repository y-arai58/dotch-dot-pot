import {composite,RENDERER_VERSION,type Asset,type Revision} from './pixel';
import {packPixels,unpackPixels} from './animation';
import animalSamples from './animal-samples.json';

/** Sample ids whose revisions predate `rigKind` and must be classified by id. */
export const ANIMAL_SAMPLE_IDS=new Set((animalSamples as {id:string}[]).map(m=>m.id));
export const PROP_SAMPLE_IDS=new Set(['travel-chest','wooden-barrel']);

export type AssetKind='humanoid'|'quadruped'|'prop'|'import';
export type AssetSummary={kind:AssetKind;source:Revision['source'];mode:Revision['mode'];revisions:number;approved:boolean;latestIndex:number;styleId:string;rendererVersion?:string;palette:string[];thumb:string};
export const KIND_LABELS:Record<AssetKind,string>={humanoid:'人型',quadruped:'四足動物',prop:'物体',import:'持ち込み'};

export function revisionKind(r:Revision):AssetKind{
 if(r.rigKind)return r.rigKind;
 if(ANIMAL_SAMPLE_IDS.has(r.modelId))return 'quadruped';
 if(PROP_SAMPLE_IDS.has(r.modelId))return 'prop';
 return r.source==='import'?'import':'humanoid';
}
/** Whether the motion editor applies (props and prop samples are still images only). */
export function hasMotion(r:Revision){return revisionKind(r)!=='prop';}

/** Small, list-friendly description of an asset's newest version for grids and cards. */
export function summarizeAsset(a:Asset):AssetSummary{
 const latestIndex=a.revisions.length-1,r=a.revisions[latestIndex];
 const front=r.frames.find(f=>f.direction==='S')||r.frames[0];
 return {kind:revisionKind(r),source:r.source,mode:r.mode,revisions:a.revisions.length,approved:r.approved,latestIndex,styleId:r.style.id,rendererVersion:r.rendererVersion,palette:r.style.palette,thumb:packPixels(composite(front))};
}
export function summaryPixels(s:AssetSummary){return unpackPixels(s.thumb);}
export function summaryOutdated(s:AssetSummary){return s.rendererVersion!==RENDERER_VERSION;}
export function parseSummary(value:unknown):AssetSummary|null{if(typeof value!=='string'||!value)return null;try{return JSON.parse(value) as AssetSummary;}catch{return null;}}
