import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadGLB} from '../lib/glb';
import {DEFAULT_STYLE,renderSet} from '../lib/pixel';

function fixture(external=false){
 // An asymmetric, Y-up triangle with its front along +Z in glTF.
 const vertices=new Float32Array([-1,0,1, 1,0,1, 0,2,-1]);
 const binary=Buffer.from(vertices.buffer);
 const json=JSON.stringify({asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0}}]}],buffers:[{byteLength:binary.length,...(external?{uri:'https://example.invalid/mesh.bin'}:{})}],bufferViews:[{buffer:0,byteLength:binary.length}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[-1,0,-1],max:[1,2,1]}]});
 const document=Buffer.from(json.padEnd(Math.ceil(json.length/4)*4,' '));
 const bytes=Buffer.alloc(12+8+document.length+8+binary.length);
 bytes.writeUInt32LE(0x46546c67,0);bytes.writeUInt32LE(2,4);bytes.writeUInt32LE(bytes.length,8);
 bytes.writeUInt32LE(document.length,12);bytes.writeUInt32LE(0x4e4f534a,16);document.copy(bytes,20);
 const offset=20+document.length;
 bytes.writeUInt32LE(binary.length,offset);bytes.writeUInt32LE(0x004e4942,offset+4);binary.copy(bytes,offset+8);
 return 'data:model/gltf-binary;base64,'+bytes.toString('base64');
}

test('実際のGLBを読込み、Y-upをZ-upへ変換して8方向へ描画できる',async()=>{
 const mesh=await loadGLB(fixture());
 assert.equal(mesh.triangles.length,1);
 assert.deepEqual(mesh.triangles[0].vertices,[[-1.175,-1.175,0],[1.175,-1.175,0],[0,1.175,2.35]]);
 const frames=renderSet(mesh,DEFAULT_STYLE);
 assert.equal(frames.length,8);
 assert.ok(frames.every(f=>f.body.length===4096));
 assert.ok(frames[0].body.some(Boolean));
});

test('外部バッファ参照を含むGLBは取得へ進まず拒否する',async()=>{
 await assert.rejects(()=>loadGLB(fixture(true)),/外部ファイル/);
});

test('骨格付きGLBの骨とウェイトを失わずに取り込む',async()=>{
 const arrays=[new Float32Array([-1,0,0, 1,0,0, 0,2,0]),new Uint16Array([1,0,0,0, 1,0,0,0, 1,0,0,0]),new Float32Array([1,0,0,0, 1,0,0,0, 1,0,0,0]),new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1, 1,0,0,0,0,1,0,0,0,0,1,0,0,-2,0,1])];
 let offset=0;const views=arrays.map(a=>{const view={buffer:0,byteOffset:offset,byteLength:a.byteLength};offset+=a.byteLength;return view;});
 const binary=Buffer.concat(arrays.map(a=>Buffer.from(a.buffer)));
 const doc={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0,1]}],nodes:[{name:'mesh',mesh:0,skin:0},{name:'mixamorig:Hips',children:[2]},{name:'mixamorig:Head',translation:[0,2,0]}],meshes:[{primitives:[{attributes:{POSITION:0,JOINTS_0:1,WEIGHTS_0:2}}]}],skins:[{joints:[1,2],inverseBindMatrices:3}],buffers:[{byteLength:binary.length}],bufferViews:views,accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[-1,0,0],max:[1,2,0]},{bufferView:1,componentType:5123,count:3,type:'VEC4'},{bufferView:2,componentType:5126,count:3,type:'VEC4'},{bufferView:3,componentType:5126,count:2,type:'MAT4'}]};
 const text=JSON.stringify(doc),json=Buffer.from(text.padEnd(Math.ceil(text.length/4)*4,' '));const bytes=Buffer.alloc(28+json.length+binary.length);
 bytes.writeUInt32LE(0x46546c67,0);bytes.writeUInt32LE(2,4);bytes.writeUInt32LE(bytes.length,8);bytes.writeUInt32LE(json.length,12);bytes.writeUInt32LE(0x4e4f534a,16);json.copy(bytes,20);bytes.writeUInt32LE(binary.length,20+json.length);bytes.writeUInt32LE(0x004e4942,24+json.length);binary.copy(bytes,28+json.length);
 const mesh=await loadGLB('data:model/gltf-binary;base64,'+bytes.toString('base64'));
 assert.equal(mesh.skeleton?.find(b=>b.id==='head')?.pivot[2],2.35);
 assert.deepEqual(mesh.triangles[0].weights,[[{bone:'head',weight:1}],[{bone:'head',weight:1}],[{bone:'head',weight:1}]]);
 assert.deepEqual(mesh.triangles[0].vertices.map(v=>v.map(n=>n+0)),[[-1.175,0,0],[1.175,0,0],[0,0,2.35]]);
});
