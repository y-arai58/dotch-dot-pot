/** Fetch helpers for the studio's same-origin JSON API. Errors carry the server's message. */
export async function api<T>(url:string,options?:RequestInit):Promise<T>{
 const response=await fetch(url,options);
 const data=await response.json() as T&{error?:string};
 if(!response.ok)throw Error(data.error||'処理に失敗しました');
 return data;
}
export const post=<T,>(url:string,data:unknown)=>api<T>(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
export function uploadFile(file:File,model=false){
 return api<{id:string;name:string}>('/api/files',{method:'POST',headers:{'Content-Type':model?'model/gltf-binary':file.type,'X-Filename':encodeURIComponent(file.name)},body:file});
}
export const newId=()=>crypto.randomUUID();
export const now=()=>new Date().toISOString();
/** Mirrors app/chatgpt-auth.ts, which is server-only; the sign-in route re-validates the return path. */
export const signInPath=(returnTo='/')=>`/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo)}`;
export const signOutPath=(returnTo='/')=>`/signout-with-chatgpt?return_to=${encodeURIComponent(returnTo)}`;
export const errorMessage=(e:unknown,fallback='処理に失敗しました')=>e instanceof Error&&e.message?e.message:fallback;
