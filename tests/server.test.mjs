import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';

const code='test-editor-code-only';
let processHandle,base,dir;
async function start(){
  processHandle=spawn(process.execPath,['server/index.mjs'],{env:{...process.env,PORT:'0',HOST:'127.0.0.1',DATA_DIR:dir,EDITOR_CODE:code},stdio:['ignore','pipe','pipe']});
  base=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('Startup timed out')),10000);processHandle.stdout.on('data',data=>{output+=data;const match=output.match(/Дашборд: (http:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1].replace(/\/$/,''));}});processHandle.once('exit',code=>{clearTimeout(timer);reject(Error('Server exited '+code));});});
}
async function stop(){if(processHandle&&!processHandle.killed){const done=once(processHandle,'exit');processHandle.kill('SIGTERM');await done;}}
const post=(path,data,cookie='')=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(data)});
const get=async()=>{const r=await fetch(base+'/api/portrait');assert.equal(r.status,200);return r.json();};

test('code access, shared persistence, conflicts, validation and logout',async t=>{
  dir=await mkdtemp(path.join(tmpdir(),'trizn-test-'));await start();
  t.after(async()=>{await stop();await rm(dir,{recursive:true,force:true});});
  const before=await get();assert.equal(before.revision,0);assert.equal(before.data.components.length,16);
  assert.equal((await post('/api/portrait',{data:before.data,revision:0})).status,401);
  assert.equal((await post('/api/login',{code:'wrong-code'})).status,401);
  const login=await post('/api/login',{code});assert.equal(login.status,200);
  const header=login.headers.get('set-cookie');assert.match(header,/HttpOnly/);assert.match(header,/SameSite=Strict/);
  const cookie=header.split(';')[0];
  const changed=structuredClone(before.data);changed.components[0].status='gap';changed.components[0].definition='Контрольная формулировка';changed.lastChanged=changed.components[0].id;
  const saved=await post('/api/portrait',{data:changed,revision:0},cookie);assert.equal(saved.status,200);
  assert.equal((await get()).data.components[0].definition,'Контрольная формулировка');
  assert.equal((await post('/api/portrait',{data:before.data,revision:0},cookie)).status,409);
  const invalid=structuredClone(changed);invalid.components[0].approved=true;
  assert.equal((await post('/api/portrait',{data:invalid,revision:1},cookie)).status,400);
  const cross=await fetch(base+'/api/portrait',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json',Origin:'https://another.example'},body:JSON.stringify({data:changed,revision:1})});assert.equal(cross.status,403);
  await stop();await start();
  const persisted=await get();assert.equal(persisted.revision,1);assert.equal(persisted.data.components[0].status,'gap');
  assert.equal((await post('/api/portrait',{data:before.data,revision:1},cookie)).status,200);
  assert.equal((await fetch(base+'/api/logout',{method:'POST',headers:{Cookie:cookie}})).status,200);
  assert.equal((await post('/api/portrait',{data:changed,revision:2},cookie)).status,401);
  for(let i=0;i<5;i++)assert.equal((await post('/api/login',{code:'wrong'})).status,401);
  assert.equal((await post('/api/login',{code:'wrong'})).status,429);
});
