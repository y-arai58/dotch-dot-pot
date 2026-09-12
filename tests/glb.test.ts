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
