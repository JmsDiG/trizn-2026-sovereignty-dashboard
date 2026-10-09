import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

if(Number(process.versions.node.split('.')[0])<24){
  console.error('Для запуска нужен Node.js 24 или новее: https://nodejs.org/en/download');
  process.exit(1);
}
const root=fileURLToPath(new URL('../',import.meta.url));
const snapshot=path.join(root,'Портрет_для_переноса.json');
if(existsSync(snapshot)){
  const result=spawnSync(process.execPath,[path.join(root,'server/import-portrait.mjs'),snapshot,'--if-empty'],{stdio:'inherit',env:process.env});
  if(result.status!==0)process.exit(result.status||1);
}
process.env.HOST||='0.0.0.0';
const port=process.env.PORT||'8787';
console.log('\nЭкран на этом компьютере: http://localhost:'+port+'/');
for(const addresses of Object.values(networkInterfaces()))for(const entry of addresses||[]){
  if(entry.family==='IPv4'&&!entry.internal){
    console.log('Экран для других компьютеров: http://'+entry.address+':'+port+'/');
    console.log('Помощнику: http://'+entry.address+':'+port+'/edit');
  }
}
console.log('Оставьте это окно открытым на время круглого стола.\n');
await import('./index.mjs');
