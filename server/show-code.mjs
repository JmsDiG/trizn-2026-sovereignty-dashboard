import { readFileSync } from 'node:fs';
import path from 'node:path';
const data=path.resolve(process.env.DATA_DIR||'./data');
if(process.env.EDITOR_CODE){console.log(process.env.EDITOR_CODE);}else{console.log(readFileSync(path.join(data,'код-помощника.txt'),'utf8').trim());}
