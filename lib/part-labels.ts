import type {Revision} from './pixel';

const terms:Record<string,string>={body:'胴体',torso:'胴体',chest:'胸',belly:'お腹',head:'頭',neck:'首',muzzle:'鼻先',nose:'鼻',jaw:'あご',throat:'喉',ear:'耳',ears:'耳',eye:'目',eyes:'目',brow:'まゆ',cheek:'頬',horn:'角',horns:'角',tail:'しっぽ',base:'根元',tip:'先端',plume:'ふさ',ankle:'足首',joint:'関節',upper:'付け根',lower:'すね',toe:'つま先',hoof:'蹄',hooves:'蹄',hand:'手',foot:'足',arm:'腕',leg:'脚',thigh:'太もも',shin:'すね',haunch:'もも',fur:'毛',inner:'内側',outer:'外側',white:'白い部分',cream:'明るい部分',black:'黒い部分',brown:'茶色の部分',patch:'模様',spot:'斑点',spots:'斑点',mark:'印',highlight:'ハイライト',collar:'首輪',tag:'名札',forehead:'額',blaze:'白い筋',saddle:'背中の模様',hood:'フード',robe:'ローブ',sleeve:'袖',boot:'靴',boots:'靴',belt:'ベルト',buckle:'留め具',bag:'鞄',sword:'剣',blade:'刃',hilt:'柄',staff:'杖',hair:'髪',face:'顔',hat:'帽子',cape:'マント',pelvis:'腰'};
const prefixes=new Set(['fox','dog','cat','cow','calf','horse','wolf','scout','mage','front','fore','hind','rear','back','left','right','l','r','mesh','part','region']);
export function partLabel(part:{id:string;name:string},revision:Pick<Revision,'name'|'prompt'|'features'>,index=0){
 if(/[\u3040-\u30ff\u3400-\u9fff]/.test(part.name))return part.name;
 const tokens=part.id.replace(/([a-z])([A-Z])/g,'$1-$2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
 const left=tokens.some(t=>t==='left'||t==='l'),right=tokens.some(t=>t==='right'||t==='r'),side=left?'左':right?'右':'';
 const front=tokens.some(t=>t==='front'||t==='fore'),hind=tokens.some(t=>['hind','rear','back'].includes(t));
 const hoofed=/(牛|うし|ウシ|馬|うま|ウマ|羊|ひつじ|ヒツジ|鹿|シカ|豚|ブタ|ヤギ|山羊|\b(cow|calf|cattle|horse|deer|goat|sheep|pig)\b)/i.test([revision.name,revision.prompt,...revision.features].join(' '));
 const labels=tokens.filter(t=>!prefixes.has(t)).map(t=>t==='paw'?(hoofed?'蹄':'足先'):terms[t]).filter(Boolean);
 const unique=[...new Set(labels)];
 if(!unique.length)return part.name!==part.id?part.name:`パーツ ${index+1}`;
 return (side+(front?'前脚':hind?'後脚':'')||'')+((front||hind)?'の':'')+unique.join('・');
}
