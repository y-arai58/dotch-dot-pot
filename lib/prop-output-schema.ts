const text={type:'string'},vec={type:'array',items:{type:'number'},minItems:3,maxItems:3};
const obj=(properties:Record<string,unknown>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
export const propModelOutputSchema=obj({id:text,name:text,prompt:text,features:{type:'array',items:text},parts:{type:'array',items:obj({id:text,shape:{type:'string',enum:['box','ellipsoid','cylinder','cone']},position:vec,size:vec,color:text,rotation:vec})}});
export const propReviewOutputSchema=obj({accepted:{type:'boolean'},review:text,issues:{type:'array',items:text},model:{anyOf:[propModelOutputSchema,{type:'null'}]}});
