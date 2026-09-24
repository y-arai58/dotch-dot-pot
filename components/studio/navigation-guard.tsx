'use client';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {createContext,useContext,useState} from 'react';
import {AlertDialog,AlertDialogAction,AlertDialogCancel,AlertDialogContent,AlertDialogDescription,AlertDialogFooter,AlertDialogHeader,AlertDialogTitle} from '@/components/ui/alert-dialog';

type Guard={blocks:(href:string)=>boolean;request:(href:string)=>void};
const GuardContext=createContext<Guard|null>(null);

/**
 * Confirms before leaving an area with unsaved work. `scope` is the path prefix that is safe
 * to move within (the workspace keeps its state across its own tabs).
 */
export function NavigationGuard({dirty,scope,children}:{dirty:boolean;scope:string;children:React.ReactNode}){
 const router=useRouter(),[pending,setPending]=useState<string|null>(null);
 const guard:Guard={blocks:href=>dirty&&!href.startsWith(scope),request:setPending};
 return <GuardContext.Provider value={guard}>{children}
  <AlertDialog open={!!pending} onOpenChange={open=>{if(!open)setPending(null);}}><AlertDialogContent>
   <AlertDialogHeader><AlertDialogTitle>保存していない変更があります</AlertDialogTitle><AlertDialogDescription>このまま移動すると、保存していない描き込みや設定は失われます。</AlertDialogDescription></AlertDialogHeader>
   <AlertDialogFooter><AlertDialogCancel>このページに残る</AlertDialogCancel><AlertDialogAction onClick={()=>{const href=pending;setPending(null);if(href)router.push(href);}}>保存せずに移動</AlertDialogAction></AlertDialogFooter>
  </AlertDialogContent></AlertDialog>
 </GuardContext.Provider>;
}
/** A Link that asks before leaving a guarded area with unsaved work. */
export function GuardedLink({href,onClick,...props}:React.ComponentProps<typeof Link>&{href:string}){
 const guard=useContext(GuardContext);
 return <Link href={href} {...props} onClick={e=>{onClick?.(e);if(!e.defaultPrevented&&guard?.blocks(href)){e.preventDefault();guard.request(href);}}}/>;
}
