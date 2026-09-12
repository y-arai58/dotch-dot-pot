import {bakeAnimal,type AnimalConfig} from './animal-animation';
import type {Mesh} from './pixel';
self.onmessage=async(event:MessageEvent<{mesh:Mesh;config:AnimalConfig}>)=>{try{const baked=await bakeAnimal(event.data.mesh,event.data.config,(done,total)=>self.postMessage({type:'progress',done,total}));self.postMessage({type:'done',baked});}catch(error){self.postMessage({type:'error',error:error instanceof Error?error.message:'生成に失敗しました'});}};
