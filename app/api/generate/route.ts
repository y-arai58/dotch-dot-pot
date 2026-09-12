import {bindings,owner,readJSON,fail,HttpError,projectOwned} from '@/lib/server';
import {CREATION_SKILLS,generationRequestSchema,parseHumanoid,staticModelIssues,motionModelIssues,animalMotionModelIssues} from '@/lib/generation';
import {idSchema} from '@/lib/contracts';
import {RENDERER_VERSION} from '@/lib/pixel';
import {MOTION_VERSION,type RiggedModel} from '@/lib/animation';
import {ANIMAL_MOTION_VERSION,type AnimalModel} from '@/lib/animal-animation';
import {parseAnimal} from '@/lib/animal-contracts';
export const dynamic='force-dynamic';
type Job={id:string;owner:string;project_id:string;request:string;state:string;model_file:string|null;progress:number;error:string|null;created_at:string};
const publicJob=(j:Job)=>({id:j.id,state:j.state,modelFile:j.model_file,progress:j.progress,error:j.error,request:JSON.parse(j.request),createdAt:j.created_at});
export async function GET(request:Request){try{const user=await owner(),{db}=bindings(),id=idSchema.parse(new URL(request.url).searchParams.get('id'));const job=await db.prepare('SELECT * FROM jobs WHERE id=? AND owner=?').bind(id,user).first<Job>();if(!job)throw new HttpError(404,'依頼が見つかりません');return Response.json(publicJob(job),{headers:{'Cache-Control':'no-store'}});}catch(e){return fail(e);}}
export async function POST(request:Request){try{
 const user=await owner(request),{db,bucket}=bindings(),input=await readJSON(request,500000),now=new Date().toISOString();
 if(input.action){
  const id=idSchema.parse(input.id),job=await db.prepare('SELECT * FROM jobs WHERE id=? AND owner=?').bind(id,user).first<Job>();if(!job)throw new HttpError(404,'依頼が見つかりません');
  if(input.action==='complete'){
   if(['ready','consumed'].includes(job.state))return Response.json(publicJob(job));
   if(!['queued','running'].includes(job.state))throw new HttpError(409,'この依頼は終了しています');
   const req=generationRequestSchema.parse(JSON.parse(job.request)),entry=CREATION_SKILLS.find(s=>s.id===req.skillId)!,motionVersion=req.skillId==='animal'?ANIMAL_MOTION_VERSION:MOTION_VERSION;let model:RiggedModel|AnimalModel;try{model=req.skillId==='animal'?parseAnimal(input.artifact?.model):parseHumanoid(input.artifact?.model);}catch{throw new HttpError(400,'選択したskillの骨格・パーツを確認してください');}const issues=staticModelIssues(model,req.style),validation=input.artifact?.validation;
   if(issues.length||input.artifact?.kind!==entry.artifactKind||input.artifact.skillVersion!=='1.0.0'||!validation||validation.renderer!==RENDERER_VERSION||validation.motion!==motionVersion||validation.frames!==entry.validationFrames||!Array.isArray(validation.issues)||validation.issues.length||typeof input.artifact.visualReview!=='string'||!input.artifact.visualReview.trim())throw new HttpError(400,'選択したskillで検証済みのモデルが必要です');
   const motionIssues=req.skillId==='animal'?await animalMotionModelIssues(model as AnimalModel,req.style):await motionModelIssues(model as RiggedModel,req.style);if(motionIssues.length)throw new HttpError(400,'基本動作の検証に失敗しました。'+motionIssues[0]);
   const artifact={kind:entry.artifactKind,skillVersion:entry.version,model,validation:{renderer:RENDERER_VERSION,motion:motionVersion,frames:entry.validationFrames,issues:[]},visualReview:input.artifact.visualReview.slice(0,3000)};
   const fileId=crypto.randomUUID(),key=`${user}/files/${fileId}`,bytes=JSON.stringify(artifact);
   await bucket.put(key,bytes,{httpMetadata:{contentType:'application/json'}});
   try{await db.batch([
    db.prepare("INSERT INTO files (id,owner,name,kind,object_key,size,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM jobs WHERE id=? AND owner=? AND state IN ('queued','running'))").bind(fileId,user,req.name+'.'+req.skillId+'.json','application/json',key,new TextEncoder().encode(bytes).length,now,id,user),
    db.prepare("UPDATE jobs SET state='ready',model_file=?,progress=100,error=NULL,updated_at=? WHERE id=? AND owner=? AND state IN ('queued','running')").bind(fileId,now,id,user)
   ]);const current=await db.prepare('SELECT * FROM jobs WHERE id=? AND owner=?').bind(id,user).first<Job>();if(current?.model_file!==fileId)await bucket.delete(key);return Response.json(publicJob(current!));}catch(e){await bucket.delete(key);throw e;}
  }
  if(input.action==='cancel'||input.action==='failed'){
   const state=input.action==='cancel'?'cancelled':'failed',error=input.action==='cancel'?'生成を停止しました':String(input.error||'作成に失敗しました').slice(0,1500);
   await db.prepare("UPDATE jobs SET state=?,error=?,updated_at=? WHERE id=? AND owner=? AND state NOT IN ('ready','consumed','cancelled','failed')").bind(state,error,now,id,user).run();
  }else if(input.action==='consumed')await db.prepare("UPDATE jobs SET state='consumed',updated_at=? WHERE id=? AND owner=? AND state='ready'").bind(now,id,user).run();
  else throw new HttpError(400,'この操作には対応していません');
  return Response.json(publicJob((await db.prepare('SELECT * FROM jobs WHERE id=? AND owner=?').bind(id,user).first<Job>())!));
 }
 const body=generationRequestSchema.parse(input),project=await projectOwned(body.projectId,user);
 if(!(JSON.parse(project.styles as string) as unknown[]).some(s=>JSON.stringify(s)===JSON.stringify(body.style)))throw new HttpError(400,'保存済みのプロジェクトスタイルを選択してください');
 if(body.referenceKeys.length!==body.referenceSides.length||new Set(body.referenceSides).size!==body.referenceSides.length)throw new HttpError(400,'参照画像の方向を重複なく指定してください');
 for(const id of body.referenceKeys){const file=await db.prepare('SELECT kind FROM files WHERE id=? AND owner=?').bind(id,user).first<{kind:string}>();if(!file||!file.kind.startsWith('image/'))throw new HttpError(400,'参照画像を確認してください');}
 const old=await db.prepare('SELECT * FROM jobs WHERE id=? AND owner=?').bind(body.id,user).first<Job>();if(old){if(old.request!==JSON.stringify(body))throw new HttpError(409,'同じ依頼IDの内容が一致しません');return Response.json(publicJob(old));}
 const running=await db.prepare("SELECT id FROM jobs WHERE owner=? AND state IN ('submitting','queued','running','downloading','paused','uncertain','download_error') LIMIT 1").bind(user).first();if(running)throw new HttpError(409,'作成中の依頼があります。完了を待つか停止してください');
 await db.prepare("INSERT INTO jobs (id,owner,project_id,request,state,progress,created_at,updated_at) VALUES (?,?,?,?,'queued',0,?,?)").bind(body.id,user,body.projectId,JSON.stringify(body),now,now).run();
 return Response.json({id:body.id,state:'queued',progress:0,request:body,createdAt:now});
 }catch(e){return fail(e);}}
