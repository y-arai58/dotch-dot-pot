import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {inflateSync} from 'node:zlib';
import chair from '../skills/dotforge-prop/references/chair.json';
import chest from '../skills/dotforge-prop/references/chest.json';
import {parseProp,propModelIssues,PROP_VERSION} from '../lib/prop-contracts';
import {generationRequestSchema,parseCreationModel,parseHumanoid} from '../lib/generation';
import {parseAnimal} from '../lib/animal-contracts';
import {DEFAULT_STYLE,buildMesh,renderSet,clone,rgba,composite} from '../lib/pixel';
import {inspectProp,propArtifact} from '../scripts/prop-quality';
import {partLabel} from '../lib/part-labels';

test('物体は専用契約で受け取り、生き物の骨格・重複パーツ・不正寸法を拒否する',()=>{
 const model=parseProp(chair);
 assert.ok(generationRequestSchema.safeParse({id:'prop-test',projectId:'project-test',skillId:'prop',name:model.name,prompt:model.prompt,features:model.features,mode:'eight',style:DEFAULT_STYLE,referenceKeys:[],referenceSides:[]}).success);
 assert.deepEqual(parseCreationModel({kind:PROP_VERSION,model}),model);
 assert.throws(()=>parseHumanoid(model));assert.throws(()=>parseAnimal(model));
 assert.throws(()=>parseProp({...chair,rig:{bones:[]}}));
 assert.throws(()=>parseProp({...chair,parts:chair.parts.map(p=>({...p,bone:'root'}))}));
 assert.throws(()=>parseProp({...chair,parts:[...chair.parts,chair.parts[0]]}),/重複/);
 assert.throws(()=>parseProp({...chair,parts:[{...chair.parts[0],size:[0,1,1]}]}));
 const revision={...model,rigKind:'prop' as const};
 assert.equal(partLabel({id:'tabletop',name:'tabletop'},revision),'天板');
 assert.equal(partLabel({id:'rear-left-leg',name:'rear-left-leg'},revision),'左・後ろ側の脚');
 assert.equal(partLabel({id:'left-drawer-brass-knob',name:'left-drawer-brass-knob'},revision),'左の引き出し・真鍮・つまみ');
});

test('基準家具の全8方向が64×64と指定パレットを守り、枠外・地面貫通は不合格にする',()=>{
 for(const fixture of [chair,chest]){
  const model=parseProp(fixture);assert.deepEqual(propModelIssues(model,DEFAULT_STYLE),[]);
  const frames=renderSet(buildMesh(model),DEFAULT_STYLE);assert.equal(frames.length,8);
  for(const frame of frames){assert.equal(frame.body.length,4096);assert.ok(frame.body.every(i=>Number.isInteger(i)&&i>=0&&i<=DEFAULT_STYLE.palette.length));}
 }
 const sunk=parseProp(chair);sunk.parts[0].position[2]-=.1;assert.ok(propModelIssues(sunk,DEFAULT_STYLE).some(s=>s.includes('貫通')));
 const outside=parseProp(chair);outside.parts[0].position[0]=5;assert.ok(propModelIssues(outside,DEFAULT_STYLE).length);
 const custom={...clone(DEFAULT_STYLE),palette:['#161923','#ded8ca','#715431','#4065a5'],light:135};
 assert.deepEqual(propModelIssues(parseProp(chair),custom),[]);
 assert.notDeepEqual(renderSet(buildMesh(parseProp(chair)),custom),renderSet(buildMesh(parseProp(chair)),DEFAULT_STYLE));
});

function decode(data:Buffer){
 let offset=8,width=0,height=0;const compressed:Buffer[]=[];
 while(offset<data.length){const length=data.readUInt32BE(offset),kind=data.toString('ascii',offset+4,offset+8),body=data.subarray(offset+8,offset+8+length);if(kind==='IHDR'){width=body.readUInt32BE(0);height=body.readUInt32BE(4);}if(kind==='IDAT')compressed.push(body);offset+=length+12;}
 const raw=inflateSync(Buffer.concat(compressed)),pixels=Buffer.alloc(width*height*4);
 for(let y=0;y<height;y++){assert.equal(raw[y*(width*4+1)],0);raw.copy(pixels,y*width*4,y*(width*4+1)+1,(y+1)*(width*4+1));}
 return {width,height,pixels};
}
test('画像レビュー用PNGは元の64×64画素を維持し、検証成果は静止8枚として返す',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'dotch-prop-'));
 const result=await inspectProp(chair,DEFAULT_STYLE,directory),native=decode(await readFile(result.previews[0])),zoom=decode(await readFile(result.previews[1]));
 assert.deepEqual([native.width,native.height,zoom.width,zoom.height],[512,64,1024,512]);
 const frames=renderSet(buildMesh(result.model),DEFAULT_STYLE);
 for(const [i,frame] of frames.entries()){
  const source=rgba(composite(frame),DEFAULT_STYLE.palette);
  for(let y=0;y<64;y++)assert.deepEqual(native.pixels.subarray((y*512+i*64)*4,(y*512+i*64+64)*4),Buffer.from(source.subarray(y*256,(y+1)*256)));
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
   const actual=((Math.floor(i/4)*256+y)*1024+i%4*256+x)*4,expected=(Math.floor(y/4)*64+Math.floor(x/4))*4;
   assert.equal(zoom.pixels.readUInt32BE(actual),Buffer.from(source.buffer,source.byteOffset,source.byteLength).readUInt32BE(expected));
  }
 }
 const artifact=propArtifact(result.model,result.validation,'Fixture review, not an AI generation.');assert.equal(artifact.kind,PROP_VERSION);assert.equal(artifact.validation.frames,8);assert.equal(artifact.validation.motion,PROP_VERSION);assert.deepEqual(artifact.validation.issues,[]);
 const controller=new AbortController();controller.abort();await assert.rejects(()=>inspectProp(chair,DEFAULT_STYLE,directory,controller.signal),/停止/);
});
