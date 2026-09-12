// Explicit opt-in: this test uses the signed-in Codex account's generation allowance.
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {generateHumanoid} from './codex-runner';
import {DEFAULT_STYLE} from '../lib/pixel';
if(process.env.DOTFORGE_LIVE_TEST!=='1')throw Error('Set DOTFORGE_LIVE_TEST=1 to run an actual Codex generation');
const directory=process.env.DOTFORGE_SMOKE_DIR||'/private/tmp/dotforge-codex-live';await mkdir(directory,{recursive:true});
const controller=new AbortController();process.once('SIGINT',()=>controller.abort());
const artifact=await generateHumanoid({id:'live-harbor-mechanic',projectId:'live-test',skillId:'humanoid',name:'港町の修理技師',prompt:'小柄で快活な港町の修理技師。橙色の短い作業ジャケット、紺色のズボン、短い銀髪に大きなゴーグル。左手に小さなスパナ。背中に薄い青い工具箱。見下ろし型ゲーム用で、サンプルとは違うシルエット。',features:['頭の大きなゴーグル','左手の小さなスパナ','背中の青い工具箱'],mode:'eight',style:DEFAULT_STYLE,referenceKeys:[],referenceSides:[]},[],directory,controller.signal,p=>console.log('generation progress',p));
await writeFile(join(directory,'artifact.json'),JSON.stringify(artifact,null,2));console.log(JSON.stringify({kind:artifact.kind,parts:artifact.model.parts.length,validation:artifact.validation,visualReview:artifact.visualReview}));
