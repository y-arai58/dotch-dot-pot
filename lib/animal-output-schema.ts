import {ANIMAL_BONES} from './animal-animation';
const text={type:'string'},vec={type:'array',items:{type:'number'},minItems:3,maxItems:3};
const obj=(properties:Record<string,unknown>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
export const animalModelOutputSchema=obj({id:text,name:text,prompt:text,features:{type:'array',items:text},parts:{type:'array',items:obj({id:text,shape:{type:'string',enum:['box','ellipsoid','cylinder','cone']},position:vec,size:vec,color:text,rotation:vec,bone:{type:'string',enum:ANIMAL_BONES}})},rig:obj({bones:{type:'array',items:obj({id:{type:'string',enum:ANIMAL_BONES},parent:{anyOf:[{type:'string',enum:ANIMAL_BONES},{type:'null'}]},pivot:vec})}}),motionCorrections:obj(Object.fromEntries(ANIMAL_BONES.map(id=>[id,vec]))) });
export const animalReviewOutputSchema=obj({accepted:{type:'boolean'},review:text,issues:{type:'array',items:text},model:{anyOf:[animalModelOutputSchema,{type:'null'}]}});
