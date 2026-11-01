import 'server-only';
import pg from 'pg';
import { readFileSync } from 'fs';
import {createHash,timingSafeEqual} from 'crypto';
import {encryptField,decryptField} from './crypto';
import { cookies, headers } from 'next/headers';

const secret = (key:string) => readFileSync(`/run/secrets/${key}`,'utf8').trim();
const globalForPool=globalThis as unknown as {financePool?:pg.Pool};
export function pool():pg.Pool {
  if(!globalForPool.financePool) globalForPool.financePool=new pg.Pool({host:process.env.PGHOST||'db',database:process.env.PGDATABASE||'financehub',user:process.env.PGUSER||'financehub_app',password:secret('app_password'),port:Number(process.env.PGPORT||5432),max:12,idleTimeoutMillis:30000,connectionTimeoutMillis:10000});
  return globalForPool.financePool;
}
export const query = (sql:string,args:unknown[]=[]) => pool().query(sql,args);
export const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
// Nomes diferentes evitam colisao de cookies entre localhost:3000 e localhost:3100.
export const sessionCookieName=()=>process.env.FH_SESSION_COOKIE||'fh_session';
export const seal=(workspace:string,value:string|null|undefined)=>encryptField(Buffer.from(secret('master_key')),workspace,value);
export function unseal(workspace:string,value:string|null|undefined):string{
 if(!value)return '';
 try{return decryptField(Buffer.from(secret('master_key')),workspace,value);}
 catch{return '[Conteúdo indisponível: chave incorreta ou dados danificados]';}
}
export class ApiError extends Error {constructor(public status:number,message:string){super(message);}}
export async function sessionUser(){
 const token=(await cookies()).get(sessionCookieName())?.value;
 if(!token)return null;
 const r=await query('SELECT u.id,u.name,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND s.revoked_at IS NULL',[digest(token)]);
 return r.rows[0] as {id:string,name:string,email:string}|undefined || null;
}
export type AuthCtx={user:{id:string,name:string,email:string},workspace:string,role:string};
export async function access(workspace:string,write=false):Promise<AuthCtx>{
 const user=await sessionUser();if(!user)throw new ApiError(401,'Sessão não autenticada.');
 if(!/^[0-9a-f-]{36}$/.test(workspace))throw new ApiError(400,'Workspace inválido.');
 const r=await query('SELECT role FROM members WHERE user_id=$1 AND workspace_id=$2',[user.id,workspace]);
 if(!r.rowCount)throw new ApiError(404,'Workspace não encontrado.');
 const role=r.rows[0].role as string;
 if(write && role==='viewer')throw new ApiError(403,'Seu perfil permite apenas leitura.');
 return {user,workspace,role};
}
export function ownerOnly(ctx:AuthCtx){if(!['owner','admin'].includes(ctx.role))throw new ApiError(403,'Privilégio administrativo necessário.');}
export async function audit(workspace:string|null,actor:string|null,action:string,entity:string,entityId:string,meta:Record<string,unknown>={}){
 await query('INSERT INTO audit_events(workspace_id,actor_id,action,entity,entity_id,meta) VALUES ($1,$2,$3,$4,$5,$6)',[workspace,actor,action,entity,entityId,JSON.stringify(meta)]);
}
export async function sameOrigin(req:Request){
 if(['GET','HEAD','OPTIONS'].includes(req.method))return;
 const origin=req.headers.get('origin');
 const expected=process.env.APP_ORIGIN||'http://localhost:3000';
 const base=new URL(expected);
 const alternatives=[expected,`http://127.0.0.1:${base.port||'80'}`,`http://localhost:${base.port||'80'}`];
 if(!origin||!alternatives.includes(origin))throw new ApiError(403,'Origem não permitida.');
 const content=req.headers.get('content-type')||'';
 if(!content.startsWith('application/json') && !content.startsWith('text/plain'))throw new ApiError(415,'Tipo de conteúdo não permitido.');
}
export const cents=(value:unknown):number=>{
 const n=Number(value);if(!Number.isSafeInteger(n)||Math.abs(n)>9e14)throw new ApiError(400,'Valor monetário inválido. Use centavos inteiros.');return n;
};
export const pos=(value:unknown)=>{const n=cents(value);if(n<=0)throw new ApiError(400,'O valor precisa ser maior que zero.');return n;};
export const field=(v:unknown,max=240)=>{const s=String(v??'').trim();if(!s||s.length>max)throw new ApiError(400,'Campo obrigatório ou tamanho inválido.');return s;};
export const date=(v:unknown)=>{const s=String(v??'');if(!/^\d{4}-\d{2}-\d{2}$/.test(s))throw new ApiError(400,'Data inválida.');const d=new Date(s+'T00:00:00Z');if(Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==s)throw new ApiError(400,'Data inválida.');return s;};
export const uuid=(v:unknown)=>{const s=String(v??'');if(!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(s))throw new ApiError(400,'Identificador inválido.');return s;};
export async function ensureOwned(table:'accounts'|'categories'|'cards'|'assets'|'contacts'|'debts',id:string,w:string){
 const r=await query(`SELECT id FROM ${table} WHERE id=$1 AND workspace_id=$2`,[uuid(id),w]);if(!r.rowCount)throw new ApiError(400,`${table}: item inexistente ou pertence a outro workspace.`);
}
export function safeEquals(a:string,b:string){const aa=Buffer.from(digest(a),'hex'),bb=Buffer.from(digest(b),'hex');return timingSafeEqual(aa,bb);}
export function json(o:unknown,status=200){return Response.json(o,{status,headers:{'Cache-Control':'no-store'}});}
