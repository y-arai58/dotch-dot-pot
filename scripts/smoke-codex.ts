// Explicit opt-in: this test uses the signed-in Codex account's generation allowance.
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {generateCharacter} from './codex-runner';
import {DEFAULT_STYLE} from '../lib/pixel';
if(process.env.DOTFORGE_LIVE_TEST!=='1')throw Error('Set DOTFORGE_LIVE_TEST=1 to run an actual Codex generation');
const skill=process.env.DOTFORGE_SMOKE_SKILL||'humanoid';
if(!['humanoid','animal','prop'].includes(skill))throw Error('Unknown smoke test skill');
const animal=skill==='animal',prop=skill==='prop';
const directory=process.env.DOTFORGE_SMOKE_DIR||(prop?'/private/tmp/dotch-prop-live':animal?'/private/tmp/dotforge-animal-live':'/private/tmp/dotforge-codex-live');await mkdir(directory,{recursive:true});
const controller=new AbortController();process.once('SIGINT',()=>controller.abort());
const artifact=await generateCharacter(prop?{id:'live-writing-desk',projectId:'live-test',skillId:'prop',name:'青い本の書き物机',prompt:'四本脚の小さな木製の書き物机。薄い茶色の天板、濃い木色の脚、正面左側だけに真鍮の丸いつまみ付き引き出し。天板の右奥に閉じた青い本。椅子や人物は含めない。見下ろし型ゲーム用。',features:['四本の木製脚','正面左側だけの引き出しと真鍮のつまみ','天板の右奥の青い本'],mode:'eight',style:DEFAULT_STYLE,referenceKeys:[],referenceSides:[]}:animal?{id:'live-forest-cat',projectId:'live-test',skillId:'animal',name:'森の案内猫',prompt:'丸い顔と短い鼻、三角の耳、細長いしなやかな尾を持つ灰色の猫。青い首輪、左前足だけ白い靴下模様、尾に濃い灰色の縞。犬やキツネと異なる猫らしい小さな胸と丸みのある胴。見下ろし型ゲーム用。',features:['青い首輪','左前足だけ白い靴下模様','尾の濃い灰色の縞'],mode:'eight',style:DEFAULT_STYLE,referenceKeys:[],referenceSides:[]}:{id:'live-harbor-mechanic',projectId:'live-test',skillId:'humanoid',name:'港町の修理技師',prompt:'小柄で快活な港町の修理技師。橙色の短い作業ジャケット、紺色のズボン、短い銀髪に大きなゴーグル。左手に小さなスパナ。背中に薄い青い工具箱。見下ろし型ゲーム用で、サンプルとは違うシルエット。',features:['頭の大きなゴーグル','左手の小さなスパナ','背中の青い工具箱'],mode:'eight',style:DEFAULT_STYLE,referenceKeys:[],referenceSides:[]},[],directory,controller.signal,p=>console.log('generation progress',p));
await writeFile(join(directory,'artifact.json'),JSON.stringify(artifact,null,2));console.log(JSON.stringify({kind:artifact.kind,parts:artifact.model.parts.length,validation:artifact.validation,visualReview:artifact.visualReview}));
