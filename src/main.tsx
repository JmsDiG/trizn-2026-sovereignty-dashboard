import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import PortraitDashboard from "@/components/portrait-dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import "./styles.css";

function Editor() {
  const [authorized,setAuthorized]=useState(false);
  const [loading,setLoading]=useState(true);
  const [code,setCode]=useState("");
  const [error,setError]=useState("");
  const [submitting,setSubmitting]=useState(false);
  useEffect(()=>{fetch('/api/session',{cache:'no-store'}).then(async r=>{if(!r.ok)throw Error('Не удалось проверить вход. Повторите попытку.');const s=await r.json() as {authorized:boolean};setAuthorized(s.authorized)}).catch(e=>setError(e.message)).finally(()=>setLoading(false))},[]);
  async function login(e:React.FormEvent){
    e.preventDefault();setSubmitting(true);setError('');
    try{const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});const s=await r.json() as {error?:string};if(!r.ok)throw Error(s.error||'Не удалось войти.');setCode('');setAuthorized(true)}catch(e){setError(e instanceof Error?e.message:'Проверьте подключение.')}finally{setSubmitting(false)}
  }
  async function signOut(){const r=await fetch('/api/logout',{method:'POST'});if(r.ok)setAuthorized(false);else window.alert('Не удалось завершить сеанс. Попробуйте ещё раз.')}
  if(authorized)return <PortraitDashboard canEdit onSignOut={signOut}/>;
  return <main className="editor-access"><span className="mark-square">Т</span><span className="eyebrow">ТРИЗН–2026 · КРУГЛЫЙ СТОЛ</span><h1>Вход для помощника</h1><p>Введите код, который передал организатор. Аккаунт ChatGPT не требуется.</p>{loading?<p role="status">Проверяем вход…</p>:<form onSubmit={login} className="code-form"><Label htmlFor="editor-code">Код доступа</Label><Input id="editor-code" type="password" autoComplete="current-password" required value={code} onChange={e=>setCode(e.target.value)} maxLength={200}/>{error&&<p className="form-error" role="alert">{error}</p>}<Button type="submit" disabled={submitting}>{submitting?'Входим…':'Начать заполнение'}</Button></form>}<a className="access-secondary" href="/">Открыть экран зала</a></main>
}

const editing=location.pathname.replace(/\/$/,'')==='/edit'||new URLSearchParams(location.search).get('edit')==='1';
createRoot(document.getElementById('root')!).render(editing?<Editor/>:<PortraitDashboard canEdit={false}/>);
