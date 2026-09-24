'use client';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useMemo,useState} from 'react';
import {Boxes,Check,ChevronLeft,ChevronRight,Loader2,Plus,Sparkles,Upload,X} from 'lucide-react';
import {toast} from 'sonner';
import {RENDERER_VERSION,clone,composite,renderSet,type Revision} from '@/lib/pixel';
import {SAMPLE_MODELS} from '@/lib/sample-models';
import {CREATION_SKILLS,type GenerationRequest} from '@/lib/generation';
import {newId,now,uploadFile} from '@/lib/studio/api';
import {cacheMesh} from '@/lib/studio/mesh';
import {sampleRevision} from '@/lib/studio/demo';
import {latestStyle} from '@/lib/studio/revisions';
import {AppHeader} from '@/components/studio/app-header';
import {useRunner,useStudio} from '@/components/studio/studio-provider';
import {EmptyState,Pill,Sprite} from '@/components/studio/ui';
import {ProjectTabs,useProjectCrumbs} from './project-chrome';
import {useProject} from './project-provider';

type SkillId=GenerationRequest['skillId'];
type Method=SkillId|'sample'|'glb';
type Side='front'|'left'|'back'|'right';
type Reference={id:string;name:string;side:Side};
const SIDES:{value:Side;label:string}[]=[{value:'front',label:'正面'},{value:'back',label:'背面'},{value:'left',label:'物体の左側面'},{value:'right',label:'物体の右側面'}];
const DRAFTS:Record<SkillId,{name:string;prompt:string;features:string[]}>={
 humanoid:{name:'新しいキャラクター',prompt:'緑のフードをかぶった森の斥候。左手に短剣、右肩に赤い印、背中に革の鞄。',features:['左手の短剣','右肩の赤い印','背面の鞄']},
 animal:{name:'森のキツネ',prompt:'赤茶色の毛、白い胸、ふさふさした白い先端の尾を持つキツネ。青い首輪と左耳の小さな切れ込み。',features:['白い尾の先端','青い首輪','左耳の小さな切れ込み']},
 prop:{name:'木の椅子',prompt:'背もたれと四本の脚がある木の椅子。厚みのある座面、左右の補強桟、青い座面クッション。見下ろし型ゲームの家具。',features:['四本の脚','青い座面クッション','木製の背もたれ']},
};
const SKILL_NOTES:Record<SkillId,{short:string;flow:string[];question:string}>={
 humanoid:{short:'16関節 · 344枚を検証',question:'どんな人型キャラクターを作りますか',flow:['16関節のモデルと全パーツを作成','静止8方向と4動作の344枚を技術検証','実際の画像を確認し、必要なら最大2回修正']},
 animal:{short:'19関節 · 376枚を検証',question:'どんな四足動物を作りますか',flow:['首・尾・四つの脚を持つモデルを作成','静止8方向と4動作の376枚を技術検証','実際の画像を確認し、必要なら最大2回修正']},
 prop:{short:'部品管理 · 静止8方向',question:'どんな物体・家具・小物を作りますか',flow:['天板・脚・蓋などを名前付きの部品で作成','静止8方向の寸法・色・地面貫通を検査','実際の画像を確認し、必要なら最大2回修正']},
};
const SKILL_SCOPE:Record<SkillId,string>={humanoid:'人型の骨格とパーツを管理します。',animal:'犬・猫・キツネなどの四足哺乳類向けです。鳥・魚・蛇は対象外です。',prop:'宝箱・机・椅子など生き物以外が対象です。開閉などの動作は対象外です。'};

function Stepper({step,steps}:{step:number;steps:string[]}){
 return <ol className="stepper">{steps.map((s,i)=><li key={s} className={i<step?'done':i===step?'current':''}><span>{i<step?<Check size={13}/>:i+1}</span>{s}</li>)}</ol>;
}

export function NewAssetWizard(){
 const studio=useStudio(),router=useRouter(),{project,projectId,isDemo,saveAsset}=useProject(),crumbs=useProjectCrumbs(),{busy,run}=useRunner();
 const [method,setMethod]=useState<Method>('humanoid'),[step,setStep]=useState(0);
 const [drafts,setDrafts]=useState(clone(DRAFTS));
 const [mode,setMode]=useState<'eight'|'front'>('eight'),[references,setReferences]=useState<Reference[]>([]),[featureInput,setFeatureInput]=useState('');
 const [sampleId,setSampleId]=useState(SAMPLE_MODELS[0].id),[glb,setGlb]=useState<File|null>(null),[glbFeatures,setGlbFeatures]=useState('');
 const style=project?latestStyle(project):null;
 const samples=useMemo(()=>style?SAMPLE_MODELS.map(m=>({model:m,pixels:composite(sampleRevision(m,style,'preview').frames[0])})):[],[style]);
 const isSkill=method==='humanoid'||method==='animal'||method==='prop',draft=isSkill?drafts[method]:null;
 const steps=isSkill?['作り方','内容','確認して依頼']:['作り方','内容'];
 const updateDraft=(patch:Partial<typeof DRAFTS.humanoid>)=>{if(isSkill)setDrafts(d=>({...d,[method]:{...d[method],...patch}}));};
 if(isDemo)return <div className="page"><AppHeader crumbs={[...crumbs,{label:'新しいアセット'}]}/><main className="narrow-page"><EmptyState title="サンプルルームではアセットを追加できません" action={<a className="button primary" href={studio.signInUrl('/projects')} target="_top">ログインしてプロジェクトを作る</a>}>ログインするとプロジェクトを作成し、Codexへの依頼・サンプル・3Dモデルから素材を追加できます。</EmptyState></main></div>;
 async function addReference(file:File){const r=await uploadFile(file);setReferences(list=>{const used=new Set(list.map(x=>x.side));return [...list,{...r,side:SIDES.find(s=>!used.has(s.value))?.value||'left'}];});}
 async function submit(){
  if(!project||!style||!draft||!isSkill)return;
  await studio.submitGeneration({id:newId(),projectId,skillId:method,name:draft.name.trim(),prompt:draft.prompt.trim(),features:draft.features,mode,style,referenceKeys:references.map(r=>r.id),referenceSides:references.map(r=>r.side)});
  router.push(`/p/${projectId}`);
 }
 async function addSample(){
  if(!style)return;const m=SAMPLE_MODELS.find(x=>x.id===sampleId)!;const r=sampleRevision(m,style,newId(),now());
  const saved=await saveAsset({id:newId(),projectId,name:m.name,version:0,updatedAt:now(),revisions:[r]});
  toast.success(`${m.name}を追加しました`);router.push(`/p/${projectId}/a/${saved.id}/pixel`);
 }
 async function importGlb(){
  if(!style||!glb)return;const uploaded=await uploadFile(glb,true),{loadGLB}=await import('@/lib/glb'),mesh=await loadGLB('/api/files?id='+uploaded.id);cacheMesh(uploaded.id,mesh);
  const frames=renderSet(mesh,style,mode),name=glb.name.replace(/\.glb$/i,'').slice(0,100)||'持ち込みモデル';
  const r:Revision={id:newId(),rendererVersion:RENDERER_VERSION,createdAt:now(),style:clone(style),frames,baseFrames:clone(frames),approved:false,reviewed:false,issues:'',mode,source:'import',modelId:uploaded.id,modelKey:uploaded.id,name,prompt:'持ち込みモデル',features:glbFeatures.split('\n').map(s=>s.trim()).filter(Boolean).slice(0,20),facing:0,size:1,reason:'import'};
  const saved=await saveAsset({id:newId(),projectId,name,revisions:[r],updatedAt:now(),version:0});
  toast.success('3Dモデルからドット絵を作成しました。正面と大きさは「アセット設定」で調整できます');router.push(`/p/${projectId}/a/${saved.id}/pixel`);
 }
 const methods:{id:Method;name:string;note:string;icon:React.ReactNode}[]=[...CREATION_SKILLS.map(s=>({id:s.id as Method,name:s.name,note:`Codex · ${SKILL_NOTES[s.id].short}`,icon:<Sparkles size={17}/>})),{id:'sample',name:'サンプルから',note:'接続なしですぐに試せる · 6種',icon:<Boxes size={17}/>},{id:'glb',name:'3Dモデルを持ち込む',note:'GLB v2 · 25MB · 6万面まで',icon:<Upload size={17}/>}];
 const canContinue=isSkill?!!draft?.name.trim()&&!!draft?.prompt.trim():method==='glb'?!!glb:true;
 return <div className="page">
  <AppHeader crumbs={[...crumbs,{label:'新しいアセット'}]}/>
  <ProjectTabs/>
  <main className="wizard">
   <Stepper step={step} steps={steps}/>
   {step===0&&<section className="wizard-section"><h1>どうやって作りますか</h1><div className="method-grid">{methods.map(m=><button key={m.id} type="button" className={`method-card${method===m.id?' selected':''}`} aria-pressed={method===m.id} onClick={()=>setMethod(m.id)}>
    <span className="method-name">{m.icon}{m.name}</span><small>{m.note}</small>{(m.id==='humanoid'||m.id==='animal'||m.id==='prop')&&<span className={`method-status${studio.codexReady?' ok':''}`}>{studio.codexReady?'Codex 接続済み':'接続が必要'}</span>}</button>)}</div>
    {isSkill&&<p className="help">{SKILL_SCOPE[method]}</p>}
   </section>}
   {step===1&&isSkill&&draft&&<section className="wizard-columns">
    <div className="form-stack">
     <label className="field-label" htmlFor="asset-name">名前</label><input id="asset-name" value={draft.name} maxLength={100} onChange={e=>updateDraft({name:e.target.value})}/>
     <label className="field-label" htmlFor="asset-prompt">{SKILL_NOTES[method].question}<span>{draft.prompt.length} / 800</span></label><textarea id="asset-prompt" value={draft.prompt} maxLength={800} onChange={e=>updateDraft({prompt:e.target.value})}/>
     <span className="field-label">保持する特徴<span>8方向すべてで確認する特徴（最大10）</span></span>
     <div className="chip-input">{draft.features.map((f,i)=><span key={i} className="chip">{f}<button type="button" aria-label={`${f}を外す`} onClick={()=>updateDraft({features:draft.features.filter((_,j)=>j!==i)})}><X size={12}/></button></span>)}
      <input aria-label="保持する特徴を追加" value={featureInput} maxLength={150} placeholder={draft.features.length<10?'特徴を入力してEnter':'上限に達しました'} disabled={draft.features.length>=10} onChange={e=>setFeatureInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&featureInput.trim()){e.preventDefault();updateDraft({features:[...draft.features,featureInput.trim()]});setFeatureInput('');}}}/></div>
     <span className="field-label">出力する方向</span>
     <div className="segmented" role="group" aria-label="出力する方向">{[{v:'eight',l:'8方向'},{v:'front',l:'正面のみ'}].map(o=><button key={o.v} type="button" aria-pressed={mode===o.v} className={mode===o.v?'active':''} onClick={()=>setMode(o.v as typeof mode)}>{o.l}</button>)}</div>
     <p className="help">正面のみでも、品質確認は8方向で行います。</p>
    </div>
    <div className="form-stack">
     <span className="field-label">参照画像<span>任意 · 最大3枚</span></span>
     <div className="reference-slots">{references.map(r=><div key={r.id} className="reference-slot"><img src={'/api/files?id='+r.id} alt={r.name}/><select aria-label={`${r.name}の方向`} value={r.side} onChange={e=>setReferences(list=>list.map(x=>x.id===r.id?{...x,side:e.target.value as Side}:x))}>{SIDES.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}</select><button type="button" className="tool" aria-label="参照を外す" onClick={()=>setReferences(list=>list.filter(x=>x.id!==r.id))}><X size={14}/></button></div>)}
      {references.length<3&&<label className="reference-add"><Plus size={18}/>画像を追加<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void run(()=>addReference(f));e.target.value='';}}/></label>}</div>
     <p className="help">説明・特徴・参照画像をこの端末のCodexへ送ります。見せていない面は、形がつながるように補って作ります。</p>
    </div>
   </section>}
   {step===1&&method==='sample'&&<section className="wizard-section"><h1>サンプルを選ぶ</h1><p className="help">プロジェクトのスタイルで描いた状態で追加します。Codexへの接続は不要です。</p>
    <div className="sample-grid">{samples.map(({model,pixels})=><button key={model.id} type="button" className={`sample-card${sampleId===model.id?' selected':''}`} aria-pressed={sampleId===model.id} onClick={()=>setSampleId(model.id)}><Sprite pixels={pixels} palette={style!.palette} size={96} label={model.name}/><span>{model.name}</span></button>)}</div></section>}
   {step===1&&method==='glb'&&<section className="wizard-columns"><div className="form-stack">
    <span className="field-label">GLBファイル</span>
    <label className="drop-zone"><Upload size={20}/>{glb?<><strong>{glb.name}</strong><small>{(glb.size/1024/1024).toFixed(1)} MB</small></>:<><strong>GLBを選ぶ</strong><small>外部ファイルを含まないGLB v2、25MB・60,000面以下</small></>}<input type="file" accept=".glb,model/gltf-binary" onChange={e=>setGlb(e.target.files?.[0]||null)}/></label>
    <span className="field-label">出力する方向</span>
    <div className="segmented" role="group" aria-label="出力する方向">{[{v:'eight',l:'8方向'},{v:'front',l:'正面のみ'}].map(o=><button key={o.v} type="button" aria-pressed={mode===o.v} className={mode===o.v?'active':''} onClick={()=>setMode(o.v as typeof mode)}>{o.l}</button>)}</div>
   </div><div className="form-stack">
    <label className="field-label" htmlFor="glb-features">保持する特徴<span>任意 · 1行に1つ</span></label><textarea id="glb-features" className="small-textarea" value={glbFeatures} onChange={e=>setGlbFeatures(e.target.value)} placeholder={'背もたれの模様\n脚の本数'}/>
    <p className="help">机・椅子などの家具や小物に向いています。正面の向きと大きさは、読み込み後に「アセット設定」で調整できます。骨格付きの人型なら動作も作れます。</p>
   </div></section>}
   {step===2&&isSkill&&draft&&<section className="wizard-columns">
    <dl className="summary-list">
     <div><dt>作り方</dt><dd>Codex · {CREATION_SKILLS.find(s=>s.id===method)?.name}<button type="button" className="text-button" onClick={()=>setStep(0)}>変更</button></dd></div>
     <div><dt>名前</dt><dd>{draft.name}<button type="button" className="text-button" onClick={()=>setStep(1)}>変更</button></dd></div>
     <div><dt>説明</dt><dd>{draft.prompt}</dd></div>
     <div><dt>保持する特徴</dt><dd className="tag-row">{draft.features.length?draft.features.map(f=><Pill key={f} tone="neutral">{f}</Pill>):'なし'}</dd></div>
     <div><dt>出力する方向</dt><dd>{mode==='eight'?'8方向':'正面のみ'}</dd></div>
     <div><dt>参照画像</dt><dd>{references.length?references.map(r=>SIDES.find(s=>s.value===r.side)?.label).join('・'):'なし'}</dd></div>
     <div><dt>スタイル</dt><dd>{style?.name} · {style?.palette.length}色</dd></div>
    </dl>
    <div className="form-stack">
     <div className="info-card"><strong>依頼したあとの流れ</strong><ol>{SKILL_NOTES[method].flow.map(f=><li key={f}>{f}</li>)}<li>完了したら「候補として開く」で作業場へ</li></ol></div>
     <div className={`info-card${studio.codexReady?' ok':''}`}><strong>{studio.codexReady?'この端末のCodexに接続済み':'この端末のCodexに接続してください'}</strong><p className="help">Codexのログインと利用枠を使います。作成中は端末を起動したままにしてください。画面は閉じても構いません。</p>{!studio.codexReady&&<div className="button-row"><button type="button" className="button" disabled={busy} onClick={()=>void run(studio.connectCodex)}>Codexに接続</button><Link className="text-button" href="/settings/codex">初回の設定</Link></div>}</div>
    </div>
   </section>}
   <footer className="wizard-footer">
    {step>0?<button type="button" className="button" onClick={()=>setStep(step-1)}><ChevronLeft size={16}/>{step===1?'作り方を選び直す':'内容に戻る'}</button>:<Link className="button" href={`/p/${projectId}`}>キャンセル</Link>}
    {step<steps.length-1&&<button type="button" className="button primary" disabled={step===1&&!canContinue} onClick={()=>setStep(step+1)}>次へ：{steps[step+1]}<ChevronRight size={16}/></button>}
    {step===steps.length-1&&isSkill&&<button type="button" className="button primary" disabled={busy||!studio.codexReady||!canContinue} onClick={()=>void run(submit)}>{busy&&<Loader2 size={16} className="spin"/>}{CREATION_SKILLS.find(s=>s.id===method)?.name}を依頼する</button>}
    {step===1&&method==='sample'&&<button type="button" className="button primary" disabled={busy||!style} onClick={()=>void run(addSample)}>{busy&&<Loader2 size={16} className="spin"/>}サンプルを追加して開く</button>}
    {step===1&&method==='glb'&&<button type="button" className="button primary" disabled={busy||!glb} onClick={()=>void run(importGlb)}>{busy&&<Loader2 size={16} className="spin"/>}読み込んで開く</button>}
   </footer>
  </main>
 </div>;
}
