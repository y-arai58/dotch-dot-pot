import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
const studio=option('--studio'),model=option('--model'),out=option('--out');
if(!studio||!model||!out){console.error('Required: --studio <checkout> --model <json> --out <directory> [--style <json>]');process.exit(2);}
const run=spawnSync(process.execPath,['--import',resolve(studio,'node_modules/tsx/dist/loader.mjs'),resolve(studio,'scripts/check-animal.ts'),resolve(model),resolve(out),...(option('--style')?[resolve(option('--style'))]:[])],{cwd:resolve(studio),stdio:'inherit'});
if(run.error){console.error('Studio runtime unavailable:',run.error.message);process.exit(2);}process.exit(run.status??2);
