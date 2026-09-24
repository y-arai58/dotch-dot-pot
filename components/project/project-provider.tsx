'use client';
import {createContext,useCallback,useContext,useEffect,useState} from 'react';
import type {Asset,Project} from '@/lib/pixel';
import {summarizeAsset,type AssetSummary} from '@/lib/asset-summary';
import {api,post,errorMessage} from '@/lib/studio/api';
import {demoAssets,demoProject,isDemoProject,saveDemoAsset,saveDemoProject} from '@/lib/studio/demo';
import {useStudio,type Job} from '@/components/studio/studio-provider';

export type AssetRow={id:string;name:string;version:number;updatedAt:string;summary:AssetSummary|null};
type ProjectContext={
 projectId:string;isDemo:boolean;project:Project|null;projects:{id:string;name:string}[];assets:AssetRow[];
 loading:boolean;error:string;reload:()=>Promise<void>;
 saveProject:(p:Project)=>Promise<Project>;saveAsset:(a:Asset)=>Promise<Asset>;noteAsset:(a:Asset)=>void;
};
const Context=createContext<ProjectContext|null>(null);
export function useProject(){const value=useContext(Context);if(!value)throw Error('ProjectProvider is missing');return value;}
const row=(a:Asset):AssetRow=>({id:a.id,name:a.name,version:a.version,updatedAt:a.updatedAt,summary:summarizeAsset(a)});

/** One project's settings and asset list, shared by its pages and the asset workspace. */
export function ProjectProvider({projectId,children}:{projectId:string;children:React.ReactNode}){
 const studio=useStudio(),isDemo=isDemoProject(projectId);
 const [project,setProject]=useState<Project|null>(null),[projects,setProjects]=useState<{id:string;name:string}[]>([]),[assets,setAssets]=useState<AssetRow[]>([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState('');
 const {upsertJob}=studio;
 const fetchProject=useCallback(async()=>{
  if(isDemo){const p=demoProject();return {project:p,projects:[{id:p.id,name:p.name}],assets:demoAssets().map(row),jobs:[] as Job[]};}
  const data=await api<{projects:Project[];assets:AssetRow[];jobs:Job[]}>('/api/studio?projectId='+encodeURIComponent(projectId));
  const p=data.projects.find(x=>x.id===projectId);
  if(!p)throw Error('プロジェクトが見つかりません。一覧から選び直してください');
  return {project:p,projects:data.projects.map(x=>({id:x.id,name:x.name})),assets:data.assets,jobs:data.jobs};
 },[projectId,isDemo]);
 const apply=useCallback((d:Awaited<ReturnType<typeof fetchProject>>)=>{setProject(d.project);setProjects(d.projects);setAssets(d.assets);d.jobs.forEach(upsertJob);setError('');setLoading(false);},[upsertJob]);
 const fail=useCallback((e:unknown)=>{setError(errorMessage(e,'プロジェクトを読み込めませんでした'));setLoading(false);},[]);
 const reload=useCallback(async()=>{setLoading(true);await fetchProject().then(apply,fail);},[fetchProject,apply,fail]);
 useEffect(()=>{let dead=false;fetchProject().then(d=>{if(!dead)apply(d);},e=>{if(!dead)fail(e);});return()=>{dead=true;};},[fetchProject,apply,fail]);
 const noteAsset=useCallback((a:Asset)=>setAssets(list=>[row(a),...list.filter(x=>x.id!==a.id)]),[]);
 async function saveProject(p:Project){
  if(isDemo){const next={...p,version:p.version+1,updatedAt:new Date().toISOString()};saveDemoProject(next);setProject(next);return next;}
  const saved=await post<Project>('/api/studio',{action:'project',project:p});setProject(saved);void studio.refreshOverview();return saved;
 }
 async function saveAsset(a:Asset){
  if(isDemo){const next={...a,version:a.version+1};saveDemoAsset(next);noteAsset(next);return next;}
  const saved=await post<Asset>('/api/studio',{action:'asset',asset:a});noteAsset(saved);void studio.refreshOverview();return saved;
 }
 return <Context.Provider value={{projectId,isDemo,project,projects,assets,loading,error,reload,saveProject,saveAsset,noteAsset}}>{children}</Context.Provider>;
}
