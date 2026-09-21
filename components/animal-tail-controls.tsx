'use client';
import {RotateCcw,Copy} from 'lucide-react';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {Slider} from '@/components/ui/slider';
import {TAIL_DIRECTIONS,TAIL_PATTERNS,TAIL_DIRECTION_NAMES,TAIL_PATTERN_NAMES,tailSettings,tailCycleLimit,tailUndersampled,type TailSettings} from '@/lib/animal-tail';
import type {AnimalClip} from '@/lib/animal-animation';

export function AnimalTailControls({clip,clips,disabled,onChange,onCopy,onClearKeys}:{clip:AnimalClip;clips:AnimalClip[];disabled:boolean;onChange:(settings:TailSettings|undefined)=>void;onCopy:(settings:TailSettings)=>void;onClearKeys:()=>void}){
 const settings=tailSettings(clip),still=settings.pattern==='still',hasKeys=!!(clip.keys.tailBase?.length||clip.keys.tailTip?.length),canCopy=clips.every(c=>!tailUndersampled(settings,c.frames));
 const change=(patch:Partial<TailSettings>)=>onChange({...settings,...patch});
 return <section className="tail-controls" aria-label="尻尾の設定"><h3>尻尾の設定</h3><p className="help">{clip.name}の尻尾だけを変更します。左右は動物自身を基準にします。</p>
 <label className="field-label">向き</label><Select value={settings.direction} disabled={disabled} onValueChange={direction=>change({direction:direction as TailSettings['direction']})}><SelectTrigger aria-label="尻尾の向き"><SelectValue/></SelectTrigger><SelectContent>{TAIL_DIRECTIONS.map(value=><SelectItem key={value} value={value}>{TAIL_DIRECTION_NAMES[value]}</SelectItem>)}</SelectContent></Select>
 <label className="field-label">動きのパターン</label><Select value={settings.pattern} disabled={disabled} onValueChange={pattern=>change({pattern:pattern as TailSettings['pattern']})}><SelectTrigger aria-label="尻尾の動きのパターン"><SelectValue/></SelectTrigger><SelectContent>{TAIL_PATTERNS.map(value=><SelectItem key={value} value={value}>{TAIL_PATTERN_NAMES[value]}</SelectItem>)}</SelectContent></Select>
 {!clip.tail&&<p className="help">保存済みの尻尾の動きを使用中です。設定を選ぶと切り替わります。</p>}
 {!still&&<><div className="motion-range"><label>振れ幅<output>{settings.amplitude}°</output></label><Slider aria-label="尻尾の振れ幅" value={[settings.amplitude]} min={0} max={35} step={1} disabled={disabled} onValueChange={v=>change({amplitude:v[0]})}/></div>
 <label className="field-label">この動作中に振る回数</label><Select value={String(settings.cycles)} disabled={disabled} onValueChange={cycles=>change({cycles:Number(cycles)})}><SelectTrigger aria-label="尻尾を振る回数"><SelectValue/></SelectTrigger><SelectContent>{Array.from({length:tailCycleLimit(clip.frames)},(_,i)=><SelectItem key={i+1} value={String(i+1)}>{i+1}周期</SelectItem>)}</SelectContent></Select></>}
 {hasKeys&&<div className="tail-key-note"><p className="help">尻尾の関節キーも加わります。パターンだけで動かす場合は、尻尾のキーを解除してください。</p><button className="text-button" disabled={disabled} onClick={onClearKeys}>この動作の尻尾のキーを解除</button></div>}
 <button className="button full" disabled={disabled||!canCopy} onClick={()=>onCopy(settings)}><Copy size={14}/>全動作にこの尻尾設定を使う</button>
 {!canCopy&&<p className="help">全動作へ使うには周期数を減らしてください。1周期につき4コマ以上必要です。</p>}
 <button className="text-button full-text" disabled={disabled||!clip.tail} onClick={()=>onChange(undefined)}><RotateCcw size={14}/>この動作の尻尾設定を元に戻す</button>
 </section>;
}
