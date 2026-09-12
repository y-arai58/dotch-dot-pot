import {cp,mkdir,readFile,access} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const source=fileURLToPath(new URL('../skills/dotforge-humanoid',import.meta.url));
const target=join(process.env.CODEX_HOME||join(homedir(),'.codex'),'skills','dotforge-humanoid');
let exists=false;try{await access(target);exists=true;}catch{}
if(exists&&!process.argv.includes('--update')){console.error('Skill already exists. Inspect changes and use --update to replace this Dotforge skill.');process.exit(1);}
if(exists&&!(await readFile(join(target,'SKILL.md'),'utf8')).includes('name: dotforge-humanoid'))throw Error('Destination is not the Dotforge humanoid skill');
await mkdir(resolve(target,'..'),{recursive:true});await cp(source,target,{recursive:true});
console.log('Installed dotforge-humanoid in the user skills directory.');
