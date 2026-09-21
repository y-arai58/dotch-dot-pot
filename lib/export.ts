import {composite,DIRECTIONS,rgba,type Revision} from './pixel';
const utf8=new TextEncoder();
const u32=(n:number)=>new Uint8Array([n>>>24,(n>>>16)&255,(n>>>8)&255,n&255]);
const join=(...parts:Uint8Array[])=>{const r=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let i=0;for(const p of parts){r.set(p,i);i+=p.length;}return r;};
export function crc32(data:Uint8Array){let c=0xffffffff;for(const b of data){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function chunk(name:string,data:Uint8Array){const v=join(utf8.encode(name),data);return join(u32(data.length),v,u32(crc32(v)));}
export function png(width:number,height:number,pixels:Uint8Array):Uint8Array{
 if(pixels.length!==width*height*4)throw Error('画素数が一致しません');
 const raw=new Uint8Array(height*(width*4+1));for(let y=0;y<height;y++)raw.set(pixels.subarray(y*width*4,(y+1)*width*4),y*(width*4+1)+1);
 const blocks:Uint8Array[]=[new Uint8Array([0x78,0x01])];for(let i=0;i<raw.length;i+=65535){const d=raw.subarray(i,i+65535),n=d.length;blocks.push(new Uint8Array([i+n>=raw.length?1:0,n&255,n>>>8,(~n)&255,((~n)>>>8)&255]),d);}
 let a=1,b=0;for(const byte of raw){a=(a+byte)%65521;b=(b+a)%65521;}blocks.push(u32((b<<16)|a));
 return join(new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',join(u32(width),u32(height),new Uint8Array([8,6,0,0,0]))),chunk('sRGB',new Uint8Array([0])),chunk('IDAT',join(...blocks)),chunk('IEND',new Uint8Array()));
}
export function zip(files:Record<string,Uint8Array>):Uint8Array{
 const local:Uint8Array[]=[],central:Uint8Array[]=[];let offset=0;
 for(const [name,data] of Object.entries(files)){const filename=utf8.encode(name),crc=crc32(data);const header=new Uint8Array(30),v=new DataView(header.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,filename.length,true);const entry=join(header,filename,data);local.push(entry);
 const c=new Uint8Array(46),cv=new DataView(c.buffer);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x800,true);cv.setUint32(16,crc,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,filename.length,true);cv.setUint32(42,offset,true);central.push(join(c,filename));offset+=entry.length;}
 const dir=join(...central),end=new Uint8Array(22),ev=new DataView(end.buffer);ev.setUint32(0,0x06054b50,true);ev.setUint16(8,central.length,true);ev.setUint16(10,central.length,true);ev.setUint32(12,dir.length,true);ev.setUint32(16,offset,true);return join(...local,dir,end);
}
export function exportRevision(rev:Revision,layer:'body'|'shadow'|'composite'='composite'){
 const files:Record<string,Uint8Array>={},width=rev.frames.length*64,sheet=new Uint8Array(width*64*4);
 rev.frames.forEach((f,i)=>{const pixels=rgba(composite(f,layer),rev.style.palette);files[`${f.direction}.png`]=png(64,64,pixels);for(let y=0;y<64;y++)sheet.set(pixels.subarray(y*256,(y+1)*256),(y*width+i*64)*4);});
 files['spritesheet.png']=png(width,64,sheet);
 if(rev.sharedEdits)files['shared-edits.json']=utf8.encode(JSON.stringify({source:{kind:rev.source,modelId:rev.modelId,modelKey:rev.modelKey},edits:rev.sharedEdits},null,2));
 files['metadata.json']=utf8.encode(JSON.stringify({formatVersion:1,rendererVersion:rev.rendererVersion||'legacy',assetVersion:rev.id,styleVersion:rev.style.id,layer,width:64,height:64,palette:rev.style.palette,transparentIndex:0,camera:{projection:'orthographic',elevation:rev.style.elevation},light:{azimuth:rev.style.light,elevation:rev.style.lightHeight,space:'world'},frames:rev.frames.map((f,i)=>({direction:f.direction,angle:DIRECTIONS.indexOf(f.direction)*45,rect:{x:i*64,y:0,width:64,height:64},pivot:rev.style.anchor}))},null,2));return files;
}
export function download(data:Uint8Array,name:string,type='application/octet-stream'){const url=URL.createObjectURL(new Blob([data as BlobPart],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
