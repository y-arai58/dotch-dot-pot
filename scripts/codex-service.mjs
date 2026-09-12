import {execFileSync} from 'node:child_process';
import {createConnection} from 'node:net';
import {access,mkdir,readFile,readdir,writeFile,rename,unlink} from 'node:fs/promises';
import {homedir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const LABEL='dev.dotforge.bridge';
const MARKER='<!-- Managed by Dotforge codex-service v1 -->';
const studio=fileURLToPath(new URL('..',import.meta.url));
const xml=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
export function servicePlist({node,checkout,home,directory,environment={}}){
 const env={HOME:home,PATH:[dirname(node),join(home,'.volta/bin'),'/usr/local/bin','/opt/homebrew/bin','/usr/bin','/bin','/usr/sbin','/sbin'].join(':'),DOTFORGE_HOME:directory};
 for(const name of ['CODEX_HOME','DOTFORGE_CODEX_BIN','DOTFORGE_ALLOWED_ORIGINS','TMPDIR'])if(environment[name])env[name]=environment[name];
 return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
${MARKER}
<plist version="1.0"><dict>
<key>Label</key><string>${LABEL}</string>
<key>ProgramArguments</key><array>${[node,'--import',join(checkout,'node_modules/tsx/dist/loader.mjs'),join(checkout,'scripts/codex-bridge.ts')].map(v=>`<string>${xml(v)}</string>`).join('')}</array>
<key>WorkingDirectory</key><string>${xml(checkout)}</string>
<key>EnvironmentVariables</key><dict>${Object.entries(env).map(([k,v])=>`<key>${k}</key><string>${xml(v)}</string>`).join('')}</dict>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>5</integer>
<key>ExitTimeOut</key><integer>15</integer>
<key>Umask</key><integer>63</integer>
<key>StandardOutPath</key><string>${xml(join(directory,'logs/bridge.stdout.log'))}</string>
<key>StandardErrorPath</key><string>${xml(join(directory,'logs/bridge.stderr.log'))}</string>
</dict></plist>\n`;
}
const launch=(...args)=>execFileSync('/bin/launchctl',args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:10000});
function serviceState(target){try{const out=launch('print',target);return {loaded:true,state:out.match(/\bstate = (.+)/)?.[1]||'unknown',pid:Number(out.match(/\bpid = (\d+)/)?.[1])||null,lastExitCode:out.match(/last exit code = (.+)/)?.[1]||null};}catch(e){if(e.status===113)return {loaded:false};throw Error('自動起動サービスの状態を確認できません');}}
async function occupied(){return new Promise(resolve=>{const socket=createConnection({host:'127.0.0.1',port:43117});const done=value=>{socket.destroy();resolve(value);};socket.once('connect',()=>done(true));socket.once('error',()=>done(false));socket.setTimeout(1000,()=>done(false));});}
async function assertIdle(directory){let names=[];try{names=await readdir(join(directory,'jobs'));}catch(e){if(e.code!=='ENOENT')throw e;}
 for(const name of names){let job;try{job=JSON.parse(await readFile(join(directory,'jobs',name,'job.json'),'utf8'));}catch{continue;}if(job.state==='running')throw Error('作成中の依頼があります。完了を待ってからサービスを更新してください');}}
async function waitForListener(){const until=Date.now()+15000;while(Date.now()<until){if(await occupied())return;await new Promise(r=>setTimeout(r,300));}throw Error('サービスは登録済みですが起動を確認できません。~/.dotforge/logs のログを確認してください');}
async function main(){
 if(process.platform!=='darwin')throw Error('自動起動の登録はmacOS用です。この環境では npm run codex:bridge を使ってください');
 const action=process.argv[2]||'status';if(!['install','status','uninstall'].includes(action))throw Error('install / status / uninstall を指定してください');
 const target=`gui/${process.getuid()}/${LABEL}`,domain=`gui/${process.getuid()}`,home=homedir(),directory=resolve(process.env.DOTFORGE_HOME||join(home,'.dotforge')),plist=join(home,'Library/LaunchAgents',LABEL+'.plist');
 const state=serviceState(target);
 if(action==='status'){console.log(JSON.stringify({...state,listening:await occupied()}));return;}
 let previous;try{previous=await readFile(plist,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
 if((previous&&!previous.includes(MARKER))||(state.loaded&&!previous))throw Error('既存のサービスをDotforgeの管理対象として確認できません。上書きを中止しました');
 if(action==='uninstall'){if(state.loaded){await assertIdle(directory);launch('bootout',target);}if(previous)await unlink(plist);console.log('自動起動を解除しました。作成したアセットとログは保持しています');return;}
 const contents=servicePlist({node:process.execPath,checkout:studio,home,directory,environment:process.env});
 await access(join(studio,'node_modules/tsx/dist/loader.mjs'));await access(join(studio,'scripts/codex-bridge.ts'));
 if(!state.loaded&&await occupied())throw Error('連携サービスが手動起動中です。手動のサービスを停止してから登録してください');
 if(state.loaded){await assertIdle(directory);launch('bootout',target);}
 await mkdir(dirname(plist),{recursive:true});await mkdir(join(directory,'logs'),{recursive:true,mode:0o700});
 const temp=plist+'.tmp';await writeFile(temp,contents,{mode:0o600});execFileSync('/usr/bin/plutil',['-lint',temp],{stdio:'pipe'});await rename(temp,plist);
 launch('enable',target);launch('bootstrap',domain,plist);await waitForListener();
 console.log(JSON.stringify({...serviceState(target),listening:true,installed:true,automaticStart:'macOS login'}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(e=>{console.error(e instanceof Error?e.message:'サービスの設定に失敗しました');process.exitCode=1;});
