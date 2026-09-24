'use client';
import Link from 'next/link';
import {DEMO_PROJECT_ID,FIRST_DEMO_ASSET} from '@/lib/studio/demo';
import {AppHeader} from '@/components/studio/app-header';
import {useStudio} from '@/components/studio/studio-provider';

export function Landing(){
 const studio=useStudio();
 return <div className="page">
  <AppHeader/>
  <main className="landing">
   <div className="eyebrow">64 × 64 · 8 DIRECTIONS</div>
   <h1>同じ物体を、同じ色と光で。</h1>
   <p>見下ろし型ゲーム向けのドット絵を、共通の3D形状から8方向そろえて作ります。描き込み、パーツの調整、基本動作、書き出しまでここで行えます。</p>
   <div className="landing-actions"><Link className="button primary" href={`/p/${DEMO_PROJECT_ID}/a/${FIRST_DEMO_ASSET}/pixel`}>サンプルで試す</Link><a className="button" href={studio.signInUrl('/projects')} target="_top">ログインして始める</a></div>
   <p className="help">サンプルでの変更は保存されません。保存にはChatGPTでのログインが必要です。</p>
  </main>
 </div>;
}
