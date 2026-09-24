'use client';
import {Copy} from 'lucide-react';
import {toast} from 'sonner';
import {BRIDGE_ORIGIN} from '@/lib/bridge-client';
import {CREATION_SKILLS} from '@/lib/generation';
import {AppHeader} from '@/components/studio/app-header';
import {useRunner,useStudio} from '@/components/studio/studio-provider';

const STEPS=[
 {title:'作成skillを登録する',body:'人型・四足動物・物体のskillを、このリポジトリからCodexへ登録します。更新するときは末尾に --update を付けます。',commands:['npm run skill:install','npm run skill:install -- animal','npm run skill:install -- prop']},
 {title:'Codexにログインする',body:'作成にはこの端末のCodexのログインと利用枠を使います。',commands:['codex login']},
 {title:'連携サービスを登録する（macOS）',body:'ログイン時に自動で起動し、止まっても再起動します。macOS以外では npm run codex:bridge を起動し、そのターミナルを開いたままにします。',commands:['npm run codex:service -- install']},
 {title:'ブラウザのローカル接続を許可する',body:'初めて接続するとき、ブラウザがローカルネットワークへの接続を確認します。許可してください。',commands:[]},
];
async function copy(text:string){try{await navigator.clipboard.writeText(text);toast.success('コピーしました');}catch{toast.error('コピーできませんでした。選択してコピーしてください');}}

export function CodexSettings(){
 const studio=useStudio(),{busy,run}=useRunner();
 return <div className="page">
  <AppHeader crumbs={[{label:'設定'},{label:'Codex連携'}]}/>
  <main className="settings-layout">
   <nav className="settings-nav" aria-label="設定"><span className="active">Codex連携</span></nav>
   <div className="settings-main">
    <h1>Codex連携</h1>
    <section className={`connection-card${studio.codexReady?' ready':''}`}>
     <i className={`dot ${studio.codexReady?'dot-approved':''}`}/>
     <div><strong>{studio.codexReady?'この端末のCodexに接続しています':'この端末のCodexに接続していません'}</strong><p className="help">{BRIDGE_ORIGIN.replace('http://','')} の連携サービスを通じて、選んだ作成skillを実行します。認証情報はブラウザに渡しません。</p></div>
     <button type="button" className={studio.codexReady?'button':'button primary'} disabled={busy} onClick={()=>void run(studio.connectCodex)}>{studio.codexReady?'接続し直す':'この端末のCodexに接続'}</button>
    </section>
    <h2>はじめに行う設定</h2>
    <ol className="setup-steps">{STEPS.map((s,i)=><li key={s.title}><span className="step-no">{i+1}</span><div><strong>{s.title}</strong><p className="help">{s.body}</p>{s.commands.map(c=><div className="command" key={c}><code>{c}</code><button type="button" className="text-button" onClick={()=>void copy(c)}><Copy size={13}/>コピー</button></div>)}</div></li>)}</ol>
    <p className="help">Codexの利用枠を使います。画面を閉じても、この端末で作成は続きます。端末や連携サービスが止まった依頼は、自動では作り直しません。</p>
   </div>
   <aside className="settings-side"><h2>作成skill</h2><ul className="skill-list">{CREATION_SKILLS.map(s=><li key={s.id}><strong>{s.name}</strong><small>{s.skillName} · {s.version} · {s.validationFrames}枚を検証</small></li>)}</ul></aside>
  </main>
 </div>;
}
