'use client';
import {Lock} from 'lucide-react';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {Slider} from '@/components/ui/slider';
import {PixelCanvas} from '@/components/pixel-canvas';

export function Choice({value,onChange,options,label,disabled=false,className='choice'}:{value:string;onChange:(v:string)=>void;options:{value:string;label:string}[];label:string;disabled?:boolean;className?:string}){
 return <Select disabled={disabled} value={value} onValueChange={onChange}><SelectTrigger className={className} aria-label={label}><SelectValue/></SelectTrigger><SelectContent>{options.map(o=><SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select>;
}
export function Range({label,value,min,max,step=1,onChange,suffix='',disabled=false}:{label:string;value:number;min:number;max:number;step?:number;onChange:(v:number)=>void;suffix?:string;disabled?:boolean}){
 return <div className="range-field"><label className="field-label">{label}<span>{Math.round(value*100)/100}{suffix}</span></label><Slider aria-label={label} disabled={disabled} value={[value]} min={min} max={max} step={step} onValueChange={v=>onChange(v[0])}/></div>;
}
export type PillTone='approved'|'candidate'|'new'|'warning'|'neutral';
export function Pill({tone,lock=false,children}:{tone:PillTone;lock?:boolean;children:React.ReactNode}){
 return <span className={`pill pill-${tone}`}>{lock&&<Lock size={11} aria-hidden="true"/>}{children}</span>;
}
export type BannerTone='info'|'demo'|'lock'|'warning';
/** A one-line notice across the top of a working area, with optional actions on the right. */
export function Banner({tone='info',icon,children,actions}:{tone?:BannerTone;icon?:React.ReactNode;children:React.ReactNode;actions?:React.ReactNode}){
 return <div className={`banner banner-${tone}`} role="status">{icon}<div className="banner-text">{children}</div>{actions&&<div className="banner-actions">{actions}</div>}</div>;
}
/** 64×64 pixels on the transparency checkerboard, scaled to `size` CSS pixels. */
export function Sprite({pixels,palette,size,label}:{pixels:number[];palette:string[];size:number;label:string}){
 return <div className="sprite-box" style={{width:size,height:size}}><PixelCanvas pixels={pixels} palette={palette} scale={size/64} label={label}/></div>;
}
export function EmptyState({title,children,action}:{title:string;children?:React.ReactNode;action?:React.ReactNode}){
 return <div className="empty-state"><strong>{title}</strong>{children&&<p>{children}</p>}{action}</div>;
}
export function LoadError({message,onRetry}:{message:string;onRetry?:()=>void}){
 return <div className="load-error" role="alert"><p>{message}</p>{onRetry&&<button type="button" className="button" onClick={onRetry}>もう一度読み込む</button>}</div>;
}
