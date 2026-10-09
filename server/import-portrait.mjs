import { readFileSync, mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { portraitSchema } from '../lib/portrait.ts';

const file=process.argv[2];
if(!file)throw Error('Укажите JSON-файл экспортированной карты.');
const root=fileURLToPath(new URL('../',import.meta.url));
const snapshot=JSON.parse(readFileSync(file,'utf8'));
const data=portraitSchema.parse(snapshot.data);
const folder=path.resolve(process.env.DATA_DIR||path.join(root,'data'));
mkdirSync(folder,{recursive:true,mode:0o700});
const db=new DatabaseSync(path.join(folder,'portrait.sqlite'));
db.exec(readFileSync(path.join(root,'server/migrations/001.sql'),'utf8'));
if(db.prepare('SELECT 1 FROM portraits WHERE id = 1').get())throw Error('В новой базе уже есть карта. Импорт остановлен, чтобы сохранить существующие записи.');
db.prepare('INSERT INTO portraits VALUES (1, ?, ?, ?)').run(JSON.stringify(data),Math.max(1,Number(snapshot.revision)||1),snapshot.updatedAt||new Date().toISOString());
db.close();
console.log(`Перенесено составляющих: ${data.components.length}. Прежний сайт не изменён.`);
