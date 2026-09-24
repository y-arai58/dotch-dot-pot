import {buildMesh,type Mesh,type Revision} from '@/lib/pixel';
import {sampleModel} from '@/lib/sample-models';
import {parseCreationModel,type CreationArtifact} from '@/lib/generation';
import {applySharedEdits} from '@/lib/shared-edits';
import {api} from './api';

/** One cache for the whole session so the style page, jobs and every workspace tab reuse loaded models. */
const cache=new Map<string,Mesh>();

export function cacheMesh(key:string,mesh:Mesh){cache.set(key,mesh);}
/** The revision's source geometry without shared edits (part designs, propagated paint). */
export async function baseMeshFor(r:Revision):Promise<Mesh>{
 const key=r.modelKey||r.modelId;
 let mesh=cache.get(key);
 if(mesh)return mesh;
 if(r.source==='sample'){
  const model=sampleModel(r.modelId);
  if(!model)throw Error('元のモデルが見つかりません');
  mesh=buildMesh(model);
 }else if(r.source==='skill'){
  if(!r.modelKey)throw Error('元のモデルがありません');
  mesh=buildMesh(parseCreationModel(await api<CreationArtifact>('/api/files?id='+r.modelKey)));
 }else{
  if(!r.modelKey)throw Error('元のモデルがありません');
  const {loadGLB}=await import('@/lib/glb');
  mesh=await loadGLB('/api/files?id='+r.modelKey);
 }
 cache.set(key,mesh);
 return mesh;
}
export async function meshFor(r:Revision){return applySharedEdits(await baseMeshFor(r),r.sharedEdits);}
