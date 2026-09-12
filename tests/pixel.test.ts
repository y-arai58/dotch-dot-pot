import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {mkdirSync,writeFileSync} from 'node:fs';
import {DEFAULT_STYLE,buildMesh,renderSet,renderFrame,rgba,validateFrames,floodFill,drawLine,clone,type Mesh,type Model,type Revision,type V3} from '../lib/pixel';
import {png,exportRevision,zip,crc32} from '../lib/export';
import samples from '../lib/samples.json';
import {assetSchema,styleSchema} from '../lib/contracts';
import {RENDERER_VERSION,canReuseFrames} from '../lib/pixel';
function decode(bytes:Uint8Array){const data=Buffer.from(bytes);assert.equal(data.subarray(1,4).toString(),'PNG');let offset=8,w=0,h=0;const parts:Buffer[]=[];while(offset<data.length){const n=data.readUInt32BE(offset),kind=data.subarray(offset+4,offset+8).toString(),body=data.subarray(offset+8,offset+8+n);assert.equal(crc32(data.subarray(offset+4,offset+8+n)),data.readUInt32BE(offset+8+n));if(kind==='IHDR'){w=body.readUInt32BE(0);h=body.readUInt32BE(4);}if(kind==='IDAT')parts.push(body);offset+=12+n;}const rows=inflateSync(Buffer.concat(parts)),pixels=Buffer.alloc(w*h*4);for(let y=0;y<h;y++){assert.equal(rows[y*(w*4+1)],0);rows.copy(pixels,y*w*4,y*(w*4+1)+1,(y+1)*(w*4+1));}return {w,h,pixels};}
const style=clone(DEFAULT_STYLE),model=samples[0] as Model,mesh=buildMesh(model),frames=renderSet(mesh,style);
const revision:Revision={id:'revision-test',createdAt:'2026-09-12T00:00:00.000Z',style,frames,baseFrames:clone(frames),approved:false,reviewed:false,issues:'',mode:'eight',source:'sample',modelId:model.id,name:model.name,prompt:model.prompt,features:model.features,facing:0,size:1};
test('見下ろしカメラでは箱の上面が見え、底面は見えない（ユーザー指摘の回帰）',()=>{const triangles:Mesh['triangles']=[];const add=(a:V3,b:V3,c:V3,d:V3,color:string)=>{triangles.push({vertices:[a,b,c],color},{vertices:[a,c,d],color});};add([-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1],'#ff0000');add([-1,-1,0],[-1,1,0],[1,1,0],[1,-1,0],'#0000ff');add([-1,-1,0],[1,-1,0],[1,-1,1],[-1,-1,1],'#00ff00');add([-1,1,0],[-1,-1,0],[-1,-1,1],[-1,1,1],'#00ff00');add([1,-1,0],[1,1,0],[1,1,1],[1,-1,1],'#00ff00');add([1,1,0],[-1,1,0],[-1,1,1],[1,1,1],'#00ff00');const result=renderFrame({triangles},{...style,palette:['#111111','#ff0000','#00ff00','#0000ff'],outline:false,scale:12},'S');assert.ok(result.body.filter(x=>x===2).length>100,'上面の赤が見える');assert.equal(result.body.filter(x=>x===4).length,0,'底面の青が見えない');});
test('全サンプルの8方向は固定パレット・4096画素・透明余白を満たす',()=>{for(const sample of samples){const set=renderSet(buildMesh(sample as Model),style);assert.deepEqual(validateFrames(set,style,'eight'),[],sample.name);assert.equal(set.length,8);for(const frame of set){const data=rgba(frame.body,style.palette);for(let i=3;i<data.length;i+=4)assert.ok(data[i]===0||data[i]===255);}}});
test('PNGを実際に展開し、8方向と512×64シートが画素単位で一致する',()=>{const files=exportRevision(revision,'body'),sheet=decode(files['spritesheet.png']);assert.equal(sheet.w,512);assert.equal(sheet.h,64);for(const [i,f] of frames.entries()){const single=decode(files[`${f.direction}.png`]);assert.equal(single.w,64);assert.equal(single.h,64);for(let y=0;y<64;y++)assert.deepEqual(single.pixels.subarray(y*256,(y+1)*256),sheet.pixels.subarray((y*512+i*64)*4,(y*512+i*64+64)*4));}const zipped=zip(files);assert.equal(Buffer.from(zipped).readUInt32LE(0),0x04034b50);});
test('光源だけを変えても物体シルエットは不変、明暗は変化する',()=>{const other=renderSet(mesh,{...style,light:135});for(let i=0;i<8;i++)assert.deepEqual(frames[i].body.map(Boolean),other[i].body.map(Boolean));assert.notDeepEqual(frames[0].body,other[0].body);});
test('一方向の再描画で他方向の画素は変わらない',()=>{const before=clone(frames),after=frames.map(f=>f.direction==='E'?renderFrame(mesh,style,'E'):f);for(let i=0;i<8;i++)assert.deepEqual(after[i],before[i]);});
test('鉛筆は1ピクセルだけ変え、塗りつぶしは境界を越えない',()=>{const p=new Array(4096).fill(0),line=drawLine(p,[31,31],[31,31],2);assert.equal(line.filter(Boolean).length,1);for(let y=0;y<64;y++)p[y*64+32]=1;const filled=floodFill(p,0,3);assert.equal(filled[0],3);assert.equal(filled[32],1);assert.equal(filled[63],0);assert.equal(p[0],0);});
test('不正な画素・パレットは拒否される',()=>{assert.equal(assetSchema.safeParse({id:'asset',projectId:'project',name:'test',revisions:[revision],version:0,updatedAt:''}).success,true);assert.equal(styleSchema.safeParse({...style,palette:['#oops']}).success,false);const wrong=clone(frames);wrong[0].body[0]=999;assert.ok(validateFrames(wrong,style,'eight').length);});
test('正面のみは64×64のシート、枠外の影を検出する',()=>{const front={...revision,mode:'front' as const,frames:renderSet(mesh,style,'front')};const file=decode(exportRevision(front)['spritesheet.png']);assert.equal(file.w,64);assert.equal(file.h,64);const shadow=renderSet(mesh,{...style,shadow:true,lightHeight:20});assert.ok(shadow.some(f=>f.clipped));});
mkdirSync('/private/tmp/dotforge-verification',{recursive:true});
for(const m of samples){const r={...revision,frames:renderSet(buildMesh(m as Model),style)};writeFileSync(`/private/tmp/dotforge-verification/${m.id}.png`,exportRevision(r)['spritesheet.png']);}
writeFileSync('/private/tmp/dotforge-verification/ranger.zip',zip(exportRevision(revision)));
test('手修正で外周へ描いても余白違反を検出する',()=>{const touched=clone(frames);touched[0].body[0]=2;touched[0].clipped=false;assert.ok(validateFrames(touched,style,'eight').some(s=>s.includes('余白')));});
test('旧投影・サイズ・正面補正の違うフレームを方向別更新で混在させない',()=>{
 const current={...revision,rendererVersion:RENDERER_VERSION};
 assert.equal(canReuseFrames(current,1,0),true);
 assert.equal(canReuseFrames(revision,1,0),false,'投影方式が記録されていない旧版は全方向更新が必要');
 assert.equal(canReuseFrames(current,1.2,0),false);
 assert.equal(canReuseFrames(current,1,45),false);
});
