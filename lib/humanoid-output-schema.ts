import {BONE_IDS} from './animation';
const text={type:'string'};
const vec={type:'array',items:{type:'number'},minItems:3,maxItems:3};
const obj=(properties:Record<string,unknown>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
// Nullable fields keep the structured-output contract fully required; normalize afterwards.
export const modelOutputSchema=obj({
 id:text,name:text,prompt:text,features:{type:'array',items:text},
 parts:{type:'array',items:obj({id:text,shape:{type:'string',enum:['box','ellipsoid','cylinder','cone']},position:vec,size:vec,color:text,rotation:vec,bone:{type:'string',enum:BONE_IDS}})},
 rig:obj({bones:{type:'array',items:obj({id:{type:'string',enum:BONE_IDS},parent:{anyOf:[{type:'string',enum:BONE_IDS},{type:'null'}]},pivot:vec})}}),
 motionCorrections:obj(Object.fromEntries(BONE_IDS.map(id=>[id,vec]))),
});
export const reviewOutputSchema=obj({accepted:{type:'boolean'},review:text,issues:{type:'array',items:text},model:{anyOf:[modelOutputSchema,{type:'null'}]}});
