import {bakeAnimations,type MotionConfig} from './animation';
import type {Mesh} from './pixel';
self.onmessage=async(event:MessageEvent<{mesh:Mesh;config:MotionConfig}>)=>{
 try{const baked=await bakeAnimations(event.data.mesh,event.data.config,(done,total)=>self.postMessage({type:'progress',done,total}));self.postMessage({type:'done',baked});}
 catch(error){self.postMessage({type:'error',error:error instanceof Error?error.message:'生成に失敗しました'});}
};
