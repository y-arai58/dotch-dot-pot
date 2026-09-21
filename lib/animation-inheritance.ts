import {clone,type Revision} from './pixel';
import type {AnimationDocument} from './animation';
import type {AnimalDocument} from './animal-animation';
/** A new surface revision keeps the user's motion settings, but never old pixels or adoption. */
export function inheritAnimation<T extends AnimationDocument|AnimalDocument>(previous:T,initial:T):T{
 return {...initial,config:{...clone(previous.config),style:clone(initial.config.style),mode:initial.config.mode},baked:[],reviewed:false} as T;
}
export function findParentAnimation<T extends {sourceRevisionId:string}>(items:T[],revisions:Revision[],revision:Revision):T|undefined{
 const seen=new Set<string>([revision.id]);let id=revision.parentRevisionId;
 while(id&&!seen.has(id)){seen.add(id);const found=items.find(item=>item.sourceRevisionId===id);if(found)return found;id=revisions.find(r=>r.id===id)?.parentRevisionId;}
}
