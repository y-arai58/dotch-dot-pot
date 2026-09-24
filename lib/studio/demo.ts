import {DEFAULT_STYLE,RENDERER_VERSION,buildMesh,clone,renderSet,type Asset,type Model,type Project,type Revision,type Style} from '@/lib/pixel';
import {SAMPLE_MODELS} from '@/lib/sample-models';
import {ANIMAL_SAMPLE_IDS,PROP_SAMPLE_IDS} from '@/lib/asset-summary';

/** The sample room: a project that lives only in this tab and resets on reload. */
export const DEMO_PROJECT_ID='demo';
export const isDemoProject=(id:string|undefined|null)=>id===DEMO_PROJECT_ID;

export function sampleRevision(model:Model,style:Style,id:string,createdAt='2026-09-12T00:00:00.000Z'):Revision{
 const frames=renderSet(buildMesh(model),style);
 return {id,rendererVersion:RENDERER_VERSION,createdAt,style:clone(style),frames,baseFrames:clone(frames),approved:false,reviewed:false,issues:'',mode:'eight',source:'sample',
  rigKind:ANIMAL_SAMPLE_IDS.has(model.id)?'quadruped':PROP_SAMPLE_IDS.has(model.id)?'prop':undefined,
  modelId:model.id,features:model.features,name:model.name,prompt:model.prompt,facing:0,size:1,reason:'sample'};
}

let project:Project|null=null;
let assets:Map<string,Asset>|null=null;

export function demoProject():Project{
 project??={id:DEMO_PROJECT_ID,name:'サンプルルーム',styles:[clone(DEFAULT_STYLE)],version:0,updatedAt:''};
 return clone(project);
}
export function saveDemoProject(next:Project){project=clone(next);}
function store(){
 assets??=new Map(SAMPLE_MODELS.map((m,i)=>[`demo-${i}`,{id:`demo-${i}`,projectId:DEMO_PROJECT_ID,name:m.name,version:0,updatedAt:'',revisions:[sampleRevision(m,DEFAULT_STYLE,`demo-rev-${i}`)]}]));
 return assets;
}
export function demoAssets():Asset[]{return [...store().values()].map(a=>clone(a));}
export function demoAsset(id:string):Asset|undefined{const a=store().get(id);return a&&clone(a);}
export function saveDemoAsset(a:Asset){store().set(a.id,clone(a));}
export const FIRST_DEMO_ASSET='demo-0';
