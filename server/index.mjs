import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initialPortrait, portraitSchema } from '../lib/portrait.ts';

const root=fileURLToPath(new URL('../',import.meta.url));
const dataDir=path.resolve(process.env.DATA_DIR||path.join(root,'data'));
mkdirSync(dataDir,{recursive:true,mode:0o700});
const codePath=path.join(dataDir,'код-помощника.txt');
let code=process.env.EDITOR_CODE?.trim();
if(!code){if(existsSync(codePath))code=readFileSync(codePath,'utf8').trim();else{code=randomBytes(12).toString('base64url');writeFileSync(codePath,code+'\n',{mode:0o600});}}
if(code.length<12)throw Error('EDITOR_CODE должен содержать не менее 12 символов.');
const salt=randomBytes(32),expected=scryptSync(code,salt,32);
code=undefined;
const db=new DatabaseSync(path.join(dataDir,'portrait.sqlite'));
db.exec('PRAGMA journal_mode=WAL;');
db.exec(readFileSync(path.join(root,'server/migrations/001.sql'),'utf8'));
const hash=value=>createHash('sha256').update(value).digest('hex');
const sessionCookie='trizn_editor';
const secure=process.env.SECURE_COOKIES==='1';
const json=(res,status,data,extra={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extra});res.end(JSON.stringify(data));};
function cookie(req){const part=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(sessionCookie+'='));return part?.slice(sessionCookie.length+1)||'';}
function authorized(req){const token=cookie(req);if(!/^[a-f0-9]{64}$/.test(token))return false;return !!db.prepare('SELECT 1 FROM editor_sessions WHERE token_hash = ? AND expires_at > ?').get(hash(token),Date.now());}
function sameOrigin(req){if(req.headers['sec-fetch-site']==='cross-site')return false;if(!req.headers.origin)return true;try{return new URL(req.headers.origin).host===req.headers.host;}catch{return false;}}
async function body(req){let size=0;const parts=[];for await(const part of req){size+=part.length;if(size>2_000_000)throw Object.assign(Error('Слишком большой запрос'),{status:413});parts.push(part);}try{return JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw Object.assign(Error('Неверный формат запроса'),{status:400});}}
function snapshot(){const row=db.prepare('SELECT payload, revision, updated_at FROM portraits WHERE id = 1').get();return row?{data:portraitSchema.parse(JSON.parse(row.payload)),revision:row.revision,updatedAt:row.updated_at}:{data:initialPortrait(),revision:0,updatedAt:null};}
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.ttf':'font/ttf'};

const server=createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  try{
    const url=new URL(req.url,'http://local');
    if(req.method==='GET'&&url.pathname==='/api/health'){return json(res,200,{ready:true});}
    if(req.method==='GET'&&url.pathname==='/api/session'){return json(res,200,{authorized:authorized(req)});}
    if(req.method==='GET'&&url.pathname==='/api/portrait'){return json(res,200,snapshot());}
    if(req.method==='POST'&&url.pathname.startsWith('/api/')){
      if(!sameOrigin(req))return json(res,403,{error:'Недопустимый запрос.'});
      if(url.pathname==='/api/logout'){
        db.prepare('DELETE FROM editor_sessions WHERE token_hash = ?').run(hash(cookie(req)));
        return json(res,200,{ok:true},{'Set-Cookie':`${sessionCookie}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure?'; Secure':''}`});
      }
      if(!req.headers['content-type']?.includes('application/json'))return json(res,415,{error:'Недопустимый формат.'});
      if(url.pathname==='/api/login'){
        const address=req.socket.remoteAddress||'unknown',now=Date.now();
        const attempts=db.prepare('SELECT attempts, window_start FROM login_attempts WHERE address = ?').get(address);
        if(attempts&&now-attempts.window_start<300_000&&attempts.attempts>=5)return json(res,429,{error:'Слишком много попыток. Повторите через 5 минут.'},{'Retry-After':'300'});
        const data=await body(req);
        const supplied=typeof data?.code==='string'&&data.code.length<=200?data.code.trim():'';
        const valid=timingSafeEqual(scryptSync(supplied,salt,32),expected);
        if(!valid){
          const n=attempts&&now-attempts.window_start<300_000?attempts.attempts+1:1;
          const started=n===1?now:attempts.window_start;
          db.prepare('INSERT INTO login_attempts VALUES (?, ?, ?) ON CONFLICT(address) DO UPDATE SET attempts=excluded.attempts, window_start=excluded.window_start').run(address,n,started);
          return json(res,401,{error:'Неверный код доступа.'});
        }
        db.prepare('DELETE FROM login_attempts WHERE address = ?').run(address);
        db.prepare('DELETE FROM editor_sessions WHERE expires_at < ?').run(now);
        const token=randomBytes(32).toString('hex');
        db.prepare('INSERT INTO editor_sessions VALUES (?, ?)').run(hash(token),now+28_800_000);
        return json(res,200,{ok:true},{'Set-Cookie':`${sessionCookie}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure?'; Secure':''}`});
      }
      if(url.pathname==='/api/portrait'){
        if(!authorized(req))return json(res,401,{error:'Введите код доступа на странице входа. Текст изменений остаётся в форме.'});
        const data=await body(req),parsed=portraitSchema.safeParse(data?.data);
        if(!parsed.success||!Number.isInteger(data?.revision)||data.revision<0)return json(res,400,{error:'Проверьте заполненные поля.'});
        const now=new Date().toISOString();
        const saved=data.revision===0
          ?db.prepare('INSERT INTO portraits VALUES (1, ?, 1, ?) ON CONFLICT(id) DO NOTHING RETURNING revision').get(JSON.stringify(parsed.data),now)
          :db.prepare('UPDATE portraits SET payload = ?, revision = revision + 1, updated_at = ? WHERE id = 1 AND revision = ? RETURNING revision').get(JSON.stringify(parsed.data),now,data.revision);
        if(!saved)return json(res,409,{error:'Карта уже изменилась в другом окне. Ваш текст остаётся в форме. Обновите карту и повторите сохранение.'});
        return json(res,200,{data:parsed.data,revision:saved.revision,updatedAt:now});
      }
    }
    if(url.pathname.startsWith('/api/'))return json(res,404,{error:'Страница не найдена.'});
    if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'Недопустимый метод.'});
    const name=(url.pathname==='/'||url.pathname==='/edit'||url.pathname==='/edit/')?'index.html':decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const dist=path.join(root,'dist'),file=path.resolve(dist,name),relative=path.relative(dist,file);
    if(relative.startsWith('..')||path.isAbsolute(relative)||relative.split(path.sep).some(x=>x.startsWith('.')))return json(res,404,{error:'Страница не найдена.'});
    try{const content=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':name==='index.html'?'no-store':'public, max-age=3600'});res.end(req.method==='HEAD'?undefined:content);}catch{return json(res,404,{error:'Страница не найдена.'});}
  }catch(error){console.error('Request failed:',error.message);if(!res.headersSent)json(res,error.status||503,{error:error.status?error.message:'Сервис временно недоступен. Ваш текст остаётся в форме.'});else res.end();}
});
const port=Number(process.env.PORT||8787),host=process.env.HOST||'127.0.0.1';
server.listen(port,host,()=>{const actualPort=server.address().port;console.log(`Дашборд: http://${host}:${actualPort}/`);console.log(`Заполнение: http://${host}:${actualPort}/edit`);console.log(`Код помощника хранится только на сервере: ${codePath}`);});
function stop(){server.close(()=>{db.close();process.exit(0)});setTimeout(()=>process.exit(0),2000).unref();}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
