'use client';
import {RefreshCw} from 'lucide-react';
import {DIRECTIONS} from '@/lib/pixel';
import {KIND_LABELS,revisionKind} from '@/lib/asset-summary';
import {SOURCE_TAGS,reasonLabel} from '@/lib/studio/revisions';
import {Sheet,SheetContent,SheetDescription,SheetHeader,SheetTitle} from '@/components/ui/sheet';
import {Choice,Pill,Range} from '@/components/studio/ui';
import {useWorkspace} from './workspace-provider';

/** Settings that belong to the asset as a whole and apply to every tab. */
export function AssetSettings(){
 const w=useWorkspace(),{asset,revision}=w;
 if(!asset||!revision)return null;
 const changed=revision.size!==w.size||revision.facing!==w.facing,disabled=w.busy||w.dirty;
 return <Sheet open={w.settingsOpen} onOpenChange={w.setSettingsOpen}><SheetContent side="right" className="settings-sheet">
  <SheetHeader><SheetTitle>アセット設定</SheetTitle><SheetDescription>{asset.name} · 版{w.revIndex+1}</SheetDescription></SheetHeader>
  <div className="sheet-body">
   <section className="panel-section"><h3>この素材について</h3><dl className="meta-list">
    <div><dt>出どころ</dt><dd>{SOURCE_TAGS[revision.source]}</dd></div><div><dt>種類</dt><dd>{KIND_LABELS[revisionKind(revision)]}</dd></div>
    <div><dt>出力する方向</dt><dd>{revision.mode==='eight'?'8方向':'正面のみ'}</dd></div><div><dt>この版</dt><dd>{reasonLabel(revision,asset.revisions)}</dd></div></dl></section>
   <section className="panel-section"><h3>保持する特徴</h3>{revision.features.length?<div className="tag-row">{revision.features.map((f,i)=><Pill key={i} tone="neutral">{f}</Pill>)}</div>:<p className="help">指定されていません</p>}
    {revision.referenceKeys?.length?<><h4>作成に使った参照画像</h4><div className="reference-mini">{revision.referenceKeys.map(id=><a key={id} href={'/api/files?id='+id} target="_blank" rel="noreferrer"><img src={'/api/files?id='+id} alt="生成に使った参照画像"/></a>)}</div></>:null}</section>
   <section className="panel-section"><h3>方向と収まり</h3>
    {w.rendererOutdated&&<p className="notice">見下ろしカメラの描画方式が更新されています。「全方向の新候補を作る」で新しい描画方式にできます。</p>}
    <label className="field-label">モデルの正面補正</label>
    <Choice label="モデルの正面補正" value={String(w.facing)} onChange={v=>w.setFacing(Number(v))} options={DIRECTIONS.map((_,i)=>({value:String(i*45),label:`正面を ${i*45}° 補正`}))}/>
    <Range label="アセットの相対サイズ" value={w.size} min={.25} max={2} step={.05} onChange={w.setSize}/>
    <button type="button" className="button full primary" disabled={disabled} onClick={()=>void w.run(async()=>{await w.redraw('all');w.setSettingsOpen(false);})}><RefreshCw size={15}/>全方向の新候補を作る</button>
    <p className="help">{changed?'補正とサイズを変えた内容で、全方向を描き直した新しい候補を作ります。':'今の設定で全方向を描き直した新しい候補を作ります。'}今の版はそのまま残ります。</p>
    {revision.mode==='front'&&<button type="button" className="button full" disabled={disabled||!w.canReuse} onClick={()=>void w.run(async()=>{await w.redraw('extend');w.setSettingsOpen(false);})}>正面を残して8方向へ拡張</button>}
    {w.dirty&&<p className="notice">描き込みを保存してから新しい候補を作れます。</p>}
   </section>
  </div>
 </SheetContent></Sheet>;
}
