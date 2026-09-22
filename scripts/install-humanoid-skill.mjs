import {cp,mkdir,readFile,access} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const kind=process.argv.slice(2).find(arg=>!arg.startsWith('--'))||'humanoid';if(!['humanoid','animal','prop'].includes(kind))throw Error('Choose humanoid, animal or prop');
const name='dotforge-'+kind;
const source=fileURLToPath(new URL('../skills/'+name,import.meta.url));
const target=join(process.env.CODEX_HOME||join(homedir(),'.codex'),'skills',name);
let exists=false;try{await access(target);exists=true;}catch{}
if(exists&&!process.argv.includes('--update')){console.error('Skill already exists. Inspect changes and use --update to replace this Dotforge skill.');process.exit(1);}
if(exists&&!(await readFile(join(target,'SKILL.md'),'utf8')).includes('name: '+name))throw Error('Destination is not the selected Dotforge skill');
await mkdir(resolve(target,'..'),{recursive:true});await cp(source,target,{recursive:true});
console.log('Installed '+name+' in the user skills directory.');
