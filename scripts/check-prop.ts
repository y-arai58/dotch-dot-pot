import {readFile} from 'node:fs/promises';
import {DEFAULT_STYLE} from '../lib/pixel';
import {styleSchema} from '../lib/contracts';
import {inspectProp} from './prop-quality';
const [modelPath,out,stylePath]=process.argv.slice(2);if(!modelPath||!out)throw Error('model path and output directory required');
const style=stylePath?styleSchema.parse(JSON.parse(await readFile(stylePath,'utf8'))):DEFAULT_STYLE;
const result=await inspectProp(JSON.parse(await readFile(modelPath,'utf8')),style,out);console.log(JSON.stringify(result.validation,null,2));process.exitCode=result.validation.issues.length?1:0;
