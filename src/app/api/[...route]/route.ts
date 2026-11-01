import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import type { PoolClient } from 'pg';
import { pool,query,digest,seal,unseal,ApiError,sessionUser,access,ownerOnly,audit,sameOrigin,cents,pos,field,date,uuid,ensureOwned,safeEquals,json,sessionCookieName } from '@/lib/server';
import { categoriesDefault,cardFirstDue,nextDue,splitCents } from '@/lib/finance';
import {exactCents} from '@/lib/money';
import { overview } from '@/lib/analytics';
import { passwordError } from '@/lib/password';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const now=()=>new Date().toISOString().slice(0,10);
const text=(v:unknown)=>String(v??'').trim();
const optuuid=(v:unknown)=>v?uuid(v):null;
const bool=(v:unknown)=>v===true;
const enumVal=(v:unknown,options:string[])=>{const s=text(v);if(!options.includes(s))throw new ApiError(400,`Opção inválida: ${s}`);return s;};
async function bodyOf(req:NextRequest){
 if(Number(req.headers.get('content-length')||'0')>1100000)throw new ApiError(413,'Solicitação excede 1 MB.');
 const s=await req.text();if(s.length>1100000)throw new ApiError(413,'Solicitação excede 1 MB.');
 try{const obj=JSON.parse(s);if(!obj||typeof obj!=='object'||Array.isArray(obj))throw new ApiError(400,'JSON deve ser um objeto.');return obj as Record<string,any>;}catch(e){if(e instanceof ApiError)throw e;throw new ApiError(400,'JSON inválido.');}
}
async function inTx<T>(fn:(c:PoolClient)=>Promise<T>){const c=await pool().connect();try{await c.query('BEGIN');const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
async function seedWorkspace(c:PoolClient,userId:string,name:string,kind:string){
 const r=await c.query('INSERT INTO workspaces(name,kind) VALUES($1,$2) RETURNING id',[name,kind]);const w=r.rows[0].id;
 await c.query("INSERT INTO members(workspace_id,user_id,role) VALUES($1,$2,'owner')",[w,userId]);
 for(const [title,catKind,color] of categoriesDefault)await c.query('INSERT INTO categories(workspace_id,name,kind,color) VALUES($1,$2,$3,$4)',[w,title,catKind,color]);
 return w;
}
async function setSessionCookie(token:string){
 const {cookies}=await import('next/headers');
 (await cookies()).set(sessionCookieName(),token,{httpOnly:true,secure:(process.env.APP_ORIGIN||'').startsWith('https:'),sameSite:'strict',path:'/',maxAge:43200});
}
async function setup(b:Record<string,any>){
 const expected=(await import('fs')).readFileSync('/run/secrets/setup_code','utf8').trim();
 if(!safeEquals(text(b.code),expected))throw new ApiError(403,'Código de instalação inválido.');
 const email=field(b.email,180).toLowerCase(),name=field(b.name,100),password=typeof b.password==='string'?b.password:'';
 if(!/^\S+@\S+\.\S+$/.test(email))throw new ApiError(400,'Informe um e-mail válido.');
 const invalidPassword=passwordError(password);if(invalidPassword)throw new ApiError(400,invalidPassword);
 const hash=await bcrypt.hash(password,12);
 const token=randomBytes(32).toString('base64url');
 await inTx(async c=>{await c.query('SELECT pg_advisory_xact_lock(9827331)');
 const count=await c.query('SELECT count(*)::int AS n FROM users');if(count.rows[0].n>0)throw new ApiError(409,'Instalação já configurada.');
 const r=await c.query('INSERT INTO users(email,name,password_hash) VALUES($1,$2,$3) RETURNING id',[email,name,hash]);
 const w=await seedWorkspace(c,r.rows[0].id,'Minhas finanças','personal');
 await c.query("INSERT INTO audit_events(workspace_id,actor_id,action,entity,entity_id) VALUES($1,$2,'system.setup','workspace',$3)",[w,r.rows[0].id,String(w)]);
 await c.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES ($1,$2,now()+interval '12 hours')",[digest(token),r.rows[0].id]);
 });
 await setSessionCookie(token);
 return {ok:true};
}
async function login(b:Record<string,any>,req:NextRequest){
 const email=text(b.email).toLowerCase().slice(0,180),password=typeof b.password==='string'?b.password:'';
 const ip=digest(req.headers.get('x-real-ip')||'local').slice(0,64);
 const attempts=await query("SELECT count(*)::int AS n FROM login_attempts WHERE identifier=$1 AND ip_hash=$2 AND attempted_at>now()-interval '15 minutes'",[email,ip]);
 if(attempts.rows[0].n>=8)throw new ApiError(429,'Muitas tentativas. Tente novamente mais tarde.');
 const record=await query('SELECT id,password_hash FROM users WHERE email=$1',[email]);
 const valid=await bcrypt.compare(password,record.rows[0]?.password_hash||'$2b$12$KcTb9AfFJI8aQl9ZoOw8fuBUVBZ1q7j1.K9yqL8gVxzOXZGcVRgJa');
 if(!valid){await query('INSERT INTO login_attempts(identifier,ip_hash) VALUES($1,$2)',[email,ip]);throw new ApiError(401,'Credenciais inválidas.');}
 const token=randomBytes(32).toString('base64url');
 await query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES ($1,$2,now()+interval '12 hours')",[digest(token),record.rows[0].id]);
 await setSessionCookie(token);
 await query('DELETE FROM login_attempts WHERE identifier=$1',[email]);
 return {ok:true};
}
async function createTransaction(c:PoolClient,w:string,user:string,b:Record<string,any>){
 const kind=enumVal(b.kind,['income','expense','transfer']),account=uuid(b.account_id),target=optuuid(b.to_account_id);
 const amount=pos(b.amount_cents),on=date(b.occurred_on||now()),description=field(b.description,400);
 const category=optuuid(b.category_id);
 const accountQuery=await c.query('SELECT id,currency FROM accounts WHERE id=$1 AND workspace_id=$2 AND archived=false',[account,w]);
 if(!accountQuery.rowCount)throw new ApiError(400,'Conta não pertence ao workspace.');
 if(kind==='transfer'){
  if(!target||target===account)throw new ApiError(400,'Selecione outra conta de destino.');
  const dest=await c.query('SELECT currency FROM accounts WHERE id=$1 AND workspace_id=$2 AND archived=false',[target,w]);
  if(!dest.rowCount||dest.rows[0].currency!==accountQuery.rows[0].currency)throw new ApiError(400,'Contas incompatíveis para transferência.');
 }
 if(category){const cat=await c.query('SELECT kind FROM categories WHERE id=$1 AND workspace_id=$2',[category,w]);if(!cat.rowCount||(kind!=='transfer'&&cat.rows[0].kind!==kind))throw new ApiError(400,'Categoria incompatível.');}
 let autoCategory=category;
 if(!autoCategory&&kind!=='transfer'){
  const rules=await c.query('SELECT pattern,category_id FROM automation_rules WHERE workspace_id=$1 AND enabled=true ORDER BY priority ASC,created_at ASC',[w]);
  const matches=rules.rows.find(r=>description.toLowerCase().includes(String(r.pattern).toLowerCase()));
  if(matches){const matchCat=await c.query('SELECT kind FROM categories WHERE id=$1',[matches.category_id]);if(matchCat.rows[0]?.kind===kind)autoCategory=matches.category_id;}
 }
 const fp=b.fingerprint?field(b.fingerprint,64):null;
 const inserted=await c.query(`INSERT INTO transactions(workspace_id,account_id,to_account_id,category_id,kind,amount_cents,occurred_on,description_enc,counterparty_enc,source,fingerprint,created_by)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,[w,account,kind==='transfer'?target:null,autoCategory,kind,amount,on,seal(w,description),seal(w,text(b.counterparty)),b.source==='import'?'import':'manual',fp,user]);
 const id=inserted.rows[0].id;
 const amt=kind==='income'?amount:-amount;
 await c.query('INSERT INTO ledger_entries(workspace_id,account_id,transaction_id,amount_cents,effective_on) VALUES($1,$2,$3,$4,$5)',[w,account,id,amt,on]);
 if(kind==='transfer')await c.query('INSERT INTO ledger_entries(workspace_id,account_id,transaction_id,amount_cents,effective_on) VALUES($1,$2,$3,$4,$5)',[w,target,id,amount,on]);
 await c.query("INSERT INTO audit_events(workspace_id,actor_id,action,entity,entity_id) VALUES($1,$2,'transaction.create','transaction',$3)",[w,user,id]);
 return {id,category_id:autoCategory};
}
const fields:{[key:string]:{table:string,cols:Record<string,string>}}={
 accounts:{table:'accounts',cols:{name:'text',kind:'accountkind',initial_cents:'cents',currency:'currency',details_enc:'secret',archived:'bool'}},
 categories:{table:'categories',cols:{name:'text',kind:'inout',color:'color'}},
 cards:{table:'cards',cols:{name:'text',brand:'optional',limit_cents:'positivezero',closing_day:'day',due_day:'day',archived:'bool'}},
 budgets:{table:'budgets',cols:{category_id:'category',period:'period',limit_cents:'positivezero'}},
 goals:{table:'goals',cols:{name:'text',target_cents:'positive',allocated_cents:'positivezero',target_on:'optionaldate'}},
 assets:{table:'assets',cols:{symbol:'text',name:'text',asset_class:'text',currency:'currency'}},
 holdings:{table:'holdings',cols:{name:'text',kind:'text',value_cents:'positivezero',valued_on:'date',notes_enc:'secret'}},
 debts:{table:'debts',cols:{name:'text',principal_cents:'positivezero',remaining_cents:'positivezero',annual_rate:'rate',payment_cents:'positivezero',due_day:'day',notes_enc:'secret'}},
 subscriptions:{table:'subscriptions',cols:{name:'text',amount_cents:'positive',cadence:'cadence',next_on:'date',category_id:'category',status:'subscriptionstatus'}},
 contacts:{table:'contacts',cols:{name:'text',kind:'contactkind',email_enc:'secret',tax_id_enc:'secret'}},
 invoices:{table:'invoices',cols:{contact_id:'contact',number:'text',direction:'direction',status:'invoicestatus',amount_cents:'positive',issued_on:'date',due_on:'date'}},
 opportunities:{table:'opportunities',cols:{name:'text',contact_id:'contact',stage:'stage',expected_cents:'positivezero',probability:'probability',expected_on:'optionaldate'}},
 automation_rules:{table:'automation_rules',cols:{name:'text',pattern:'text',category_id:'category',enabled:'bool',priority:'priority'}},
 schedules:{table:'schedules',cols:{account_id:'account',category_id:'category',kind:'inout',amount_cents:'positive',description_enc:'secret',cadence:'cadence',next_on:'date',enabled:'bool'}}
};
function normalize(v:unknown,t:string,w:string){
 if(t==='text')return field(v,220);if(t==='optional')return text(v).slice(0,200)||null;
 if(t==='secret')return seal(w,text(v));if(t==='positive')return pos(v);if(t==='positivezero'){const n=cents(v);if(n<0)throw new ApiError(400,'Valor não pode ser negativo.');return n;}
 if(t==='cents')return cents(v);if(t==='date')return date(v);if(t==='optionaldate')return v?date(v):null;
 if(t==='day'){const n=cents(v);if(n<1||n>28)throw new ApiError(400,'Dia de 1 a 28.');return n;}
 if(t==='currency'){if(text(v)!=='BRL')throw new ApiError(400,'No escopo 1.0, o ledger usa BRL. Conversão cambial não está habilitada.');return 'BRL';}
 if(t==='period'){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(text(v)))throw new ApiError(400,'Período inválido.');return text(v);}
 if(t==='color'){if(!/^#[0-9a-f]{6}$/i.test(text(v)))throw new ApiError(400,'Cor hexadecimal inválida.');return text(v);}
 if(t==='rate'){const n=Number(v);if(!Number.isFinite(n)||n<0||n>1000)throw new ApiError(400,'Taxa inválida.');return n;}
 if(t==='probability'){const n=cents(v);if(n<0||n>100)throw new ApiError(400,'Probabilidade inválida.');return n;}
 if(t==='priority'){const n=cents(v);if(n<-10000||n>10000)throw new ApiError(400,'Prioridade inválida.');return n;}
 if(t==='bool')return bool(v);
 if(t==='category'||t==='account'||t==='contact')return v?uuid(v):null;
 const enums:Record<string,string[]>={accountkind:['checking','savings','cash','digital','investment'],account:['checking'],inout:['income','expense'],contactkind:['customer','vendor','both'],direction:['receivable','payable'],invoicestatus:['draft','open','paid','void'],subscriptionstatus:['active','paused','cancelled'],cadence:['weekly','monthly','yearly'],stage:['lead','qualified','proposal','negotiation','won','lost']};
 if(enums[t])return enumVal(v,enums[t]);throw new ApiError(400,'Tipo desconhecido.');
}
async function generic(w:string,user:string,b:Record<string,any>){
 const entity=text(b.entity),config=fields[entity];if(!config)throw new ApiError(400,'Módulo inválido.');
 const action=enumVal(b.action||'create',['create','update','delete']);
 if(action==='delete'){
  if(['invoices','debts','assets','accounts','cards','contacts','categories'].includes(entity))throw new ApiError(400,'Exclusão de entidades financeiras não é permitida. Utilize arquivamento ou atualização.');
  const id=uuid(b.id);
  if(entity==='schedules'){
   const runs=await query('SELECT EXISTS(SELECT 1 FROM schedule_runs WHERE schedule_id=$1) AS executed',[id]);
   if(runs.rows[0].executed)throw new ApiError(400,'Agendamento executado deve ser desabilitado, não excluído, para preservar o histórico.');
  }
  const r=await query(`DELETE FROM ${config.table} WHERE id=$1 AND workspace_id=$2 RETURNING id`,[id,w]);
  if(!r.rowCount)throw new ApiError(404,'Registro não encontrado.');await audit(w,user,`${entity}.delete`,entity,id);return {id};
 }
 const data=b.data||{};const props=Object.entries(config.cols).filter(([key])=>data[key]!==undefined);
 if(!props.length)throw new ApiError(400,'Nenhum campo informado.');
 for(const [key,type] of props){if(['category','account','contact'].includes(type)&&data[key])await ensureOwned(type==='category'?'categories':type==='account'?'accounts':'contacts',data[key],w);}
 if(entity==='invoices'&&action==='update'&&['paid','void'].includes(text(data.status)))throw new ApiError(400,'Use a operação de quitação ou cancelamento para atualizar a fatura.');
 if(entity==='invoices'&&action==='update'){
  const status=await query('SELECT status FROM invoices WHERE id=$1 AND workspace_id=$2',[uuid(b.id),w]);
  if(status.rows[0]?.status==='paid'||status.rows[0]?.status==='void')throw new ApiError(400,'Documento quitado ou cancelado não pode ser alterado.');
 }
 if(entity==='accounts'&&action==='update'&&data.initial_cents!==undefined){
  const movements=await query('SELECT EXISTS(SELECT 1 FROM ledger_entries WHERE account_id=$1 AND workspace_id=$2) AS has_movements',[uuid(b.id),w]);
  if(movements.rows[0].has_movements)throw new ApiError(400,'Saldo inicial não pode ser alterado após movimentações. Registre um ajuste com rastreabilidade.');
 }
 if(entity==='debts'&&action==='update'&&(['principal_cents','remaining_cents'].some(k=>data[k]!==undefined))){
  const movements=await query('SELECT EXISTS(SELECT 1 FROM debt_payments WHERE debt_id=$1) AS has_movements',[uuid(b.id)]);
  if(movements.rows[0].has_movements)throw new ApiError(400,'Dívida com amortizações não permite alteração retroativa do principal ou saldo.');
 }
 if(entity==='invoices'&&action==='create'&&text(data.status)==='paid')throw new ApiError(400,'Crie a fatura aberta e depois registre a quitação.');
 const columns=props.map(([key])=>key),args=props.map(([key,type])=>normalize(data[key],type,w));
 if(entity==='schedules'&&data.next_on){columns.push('anchor_day');args.push(Number(date(data.next_on).slice(8)));}
 let id='';
 if(action==='create'){
  const markers=columns.map((_,i)=>`$${i+2}`).join(',');
  const r=await query(`INSERT INTO ${config.table}(workspace_id,${columns.join(',')}) VALUES($1,${markers}) RETURNING id`,[w,...args]);id=r.rows[0].id;
 }else{
  id=uuid(b.id);const sets=columns.map((k,i)=>`${k}=$${i+3}`).join(',');
  const r=await query(`UPDATE ${config.table} SET ${sets} WHERE workspace_id=$1 AND id=$2 RETURNING id`,[w,id,...args]);
  if(!r.rowCount)throw new ApiError(404,'Registro não encontrado.');
 }
 await audit(w,user,`${entity}.${action}`,entity,id);return {id};
}
async function getData(w:string,entity:string,offset:number){
 if(entity==='transactions'){
  const r=await query(`SELECT t.id,t.kind,t.amount_cents,t.occurred_on,t.description_enc,t.counterparty_enc,t.account_id,t.to_account_id,t.category_id,t.source,t.voided_at,a.name account_name,c.name category_name FROM transactions t JOIN accounts a ON a.id=t.account_id LEFT JOIN categories c ON c.id=t.category_id WHERE t.workspace_id=$1 ORDER BY t.occurred_on DESC,t.created_at DESC LIMIT 300 OFFSET $2`,[w,offset]);
  return r.rows.map(x=>({...x,description:unseal(w,x.description_enc),counterparty:unseal(w,x.counterparty_enc),description_enc:undefined,counterparty_enc:undefined}));
 }
 if(entity==='card_purchases'){
  const r=await query('SELECT p.*,c.name card_name FROM card_purchases p JOIN cards c ON c.id=p.card_id WHERE p.workspace_id=$1 ORDER BY p.purchased_on DESC LIMIT 300 OFFSET $2',[w,offset]);
  return r.rows.map(x=>({...x,description:unseal(w,x.description_enc),description_enc:undefined}));
 }
 if(entity==='card_installments')return (await query(`SELECT ci.*,p.card_id,p.workspace_id,c.name card_name FROM card_installments ci JOIN card_purchases p ON p.id=ci.purchase_id JOIN cards c ON c.id=p.card_id WHERE p.workspace_id=$1 AND p.voided_at IS NULL ORDER BY ci.due_on DESC LIMIT 300 OFFSET $2`,[w,offset])).rows;
 if(entity==='trades')return (await query('SELECT t.*,a.name asset_name,a.symbol FROM trades t JOIN assets a ON a.id=t.asset_id WHERE t.workspace_id=$1 ORDER BY t.traded_on DESC LIMIT 300 OFFSET $2',[w,offset])).rows;
 if(entity==='asset_prices')return (await query('SELECT p.*,a.name asset_name FROM asset_prices p JOIN assets a ON a.id=p.asset_id WHERE a.workspace_id=$1 ORDER BY p.priced_on DESC LIMIT 300 OFFSET $2',[w,offset])).rows;
 if(entity==='card_payments')return (await query('SELECT * FROM card_payments WHERE workspace_id=$1 ORDER BY paid_on DESC LIMIT 300 OFFSET $2',[w,offset])).rows;
 if(entity==='debt_payments')return (await query('SELECT dp.* FROM debt_payments dp JOIN debts d ON d.id=dp.debt_id WHERE d.workspace_id=$1 ORDER BY paid_on DESC LIMIT 300 OFFSET $2',[w,offset])).rows;
 if(entity==='audit_events')return (await query('SELECT a.id,a.action,a.entity,a.entity_id,a.meta,a.happened_at,u.name actor FROM audit_events a LEFT JOIN users u ON u.id=a.actor_id WHERE a.workspace_id=$1 ORDER BY a.happened_at DESC LIMIT 150 OFFSET $2',[w,offset])).rows;
 if(entity==='members')return (await query('SELECT m.user_id,m.role,u.name,u.email FROM members m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=$1',[w])).rows;
 const cfg=fields[entity];if(!cfg)throw new ApiError(404,'Entidade não encontrada.');
 const r=await query(`SELECT * FROM ${cfg.table} WHERE workspace_id=$1 ORDER BY 1 DESC LIMIT 300 OFFSET $2`,[w,offset]);
 return r.rows.map(row=>{const result={...row};for(const key of Object.keys(result))if(key.endsWith('_enc')){result[key.slice(0,-4)]=unseal(w,result[key]);delete result[key];}return result;});
}
function csvParse(csv:string){const rows:string[][]=[];let row:string[]=[],cell='',quote=false;
 for(let i=0;i<csv.length;i++){const c=csv[i];if(c==='"'){if(quote&&csv[i+1]==='"'){cell+='"';i++;}else quote=!quote;}
 else if(c===','&&!quote){row.push(cell);cell='';}
 else if((c==='\n'||c==='\r')&&!quote){if(c==='\r'&&csv[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';}
 else cell+=c;
 }if(quote)throw new ApiError(400,'CSV contém aspas não fechadas.');row.push(cell);if(row.some(x=>x.trim()))rows.push(row);return rows;
}
async function dispatch(req:NextRequest,parts:string[]){
 const path=parts.join('/');if(path==='health'&&req.method==='GET'){
  // Testa TODAS as consultas que sustentam o dashboard, não apenas SELECT 1.
  // UUID inexistente: nenhum dado privado é recuperado nem exposto.
  const report=await overview('00000000-0000-0000-0000-000000000000');
  if(!Array.isArray(report.monthly)||!report.summary)throw Error('Analytics readiness inválido');
  return {status:'ok',database:'ready',analytics:'ready'};
 }
 if(req.method==='GET'&&path==='setup-status'){const r=await query('SELECT EXISTS(SELECT 1 FROM users) configured');return {configured:r.rows[0].configured};}
 if(req.method==='POST'&&path==='setup')return setup(await bodyOf(req));
 if(req.method==='POST'&&path==='login')return login(await bodyOf(req),req);
 if(req.method==='POST'&&path==='logout'){
  const {cookies}=await import('next/headers');const jar=await cookies();const token=jar.get(sessionCookieName())?.value;
  if(token)await query('UPDATE sessions SET revoked_at=now() WHERE token_hash=$1',[digest(token)]);
  jar.delete(sessionCookieName());return {ok:true};
 }
 const user=await sessionUser();if(!user)throw new ApiError(401,'Faça login.');
 if(path==='me'&&req.method==='GET'){
  const r=await query('SELECT w.id,w.name,w.kind,w.currency,m.role FROM workspaces w JOIN members m ON m.workspace_id=w.id WHERE m.user_id=$1 ORDER BY w.created_at',[user.id]);
  return {user,workspaces:r.rows};
 }
 if(path==='workspaces'&&req.method==='POST'){
  const b=await bodyOf(req);const kind=enumVal(b.kind,['personal','family','business']),name=field(b.name,100);
  const id=await inTx(c=>seedWorkspace(c,user.id,name,kind));await audit(id,user.id,'workspace.create','workspace',id);return {id};
 }
 const w=text(req.nextUrl.searchParams.get('workspace')||'') || text((req.method==='POST'?req.headers.get('x-workspace'):null)||'');
 const ctx=await access(w,req.method!=='GET');
 if(path==='overview'&&req.method==='GET')return overview(w);
 if(path==='data'&&req.method==='GET')return {rows:await getData(w,text(req.nextUrl.searchParams.get('entity')),Math.min(Math.max(Number(req.nextUrl.searchParams.get('offset')||0),0),1000000))};
 if(path==='manage'&&req.method==='POST')return generic(w,user.id,await bodyOf(req));
 if(path==='transaction'&&req.method==='POST'){
  const b=await bodyOf(req);return inTx(c=>createTransaction(c,w,user.id,b));
 }
 if(path==='transaction/void'&&req.method==='POST'){
  const b=await bodyOf(req),id=uuid(b.id);
  return inTx(async c=>{const refs=await c.query('SELECT 1 FROM invoices WHERE transaction_id=$1 UNION SELECT 1 FROM schedule_runs WHERE transaction_id=$1',[id]);if(refs.rowCount)throw new ApiError(400,'Esta movimentação possui dependência contratual ou agendamento; reverta a origem antes do ajuste.');
   const r=await c.query('UPDATE transactions SET voided_at=now() WHERE id=$1 AND workspace_id=$2 AND voided_at IS NULL RETURNING id',[id,w]);
   if(!r.rowCount)throw new ApiError(404,'Transação inexistente ou já estornada.');
   await c.query(`INSERT INTO ledger_entries(workspace_id,account_id,transaction_id,reference,amount_cents,effective_on) SELECT workspace_id,account_id,transaction_id,'reversal',-amount_cents,current_date FROM ledger_entries WHERE transaction_id=$1 AND reference IS DISTINCT FROM 'reversal'`,[id]);
   await c.query("INSERT INTO audit_events(workspace_id,actor_id,action,entity,entity_id) VALUES($1,$2,'transaction.void','transaction',$3)",[w,user.id,id]);return {id};
  });
 }
 if(path==='card/purchase'&&req.method==='POST'){
  const b=await bodyOf(req),cardId=uuid(b.card_id),amount=pos(b.total_cents),count=cents(b.installments??1),on=date(b.purchased_on||now());
  await ensureOwned('cards',cardId,w);if(count<1||count>120)throw new ApiError(400,'Parcelamento de 1 a 120 vezes.');if(amount<count)throw new ApiError(400,'Cada parcela deve ter pelo menos R$ 0,01.');
  if(b.category_id)await ensureOwned('categories',b.category_id,w);
  const cr=await query('SELECT closing_day,due_day FROM cards WHERE id=$1 AND workspace_id=$2',[cardId,w]);
  const first=cardFirstDue(on,cr.rows[0].closing_day,cr.rows[0].due_day);
  const values=splitCents(amount,count);
  return inTx(async c=>{
   const r=await c.query('INSERT INTO card_purchases(workspace_id,card_id,category_id,description_enc,purchased_on,total_cents,installments) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[w,cardId,optuuid(b.category_id),seal(w,field(b.description,400)),on,amount,count]);
   for(let i=0;i<count;i++)await c.query('INSERT INTO card_installments(purchase_id,installment_no,due_on,amount_cents) VALUES($1,$2,$3,$4)',[r.rows[0].id,i+1,nextDue(first,i),values[i]]);
   await c.query("INSERT INTO audit_events(workspace_id,actor_id,action,entity,entity_id) VALUES($1,$2,'card.purchase','card_purchase',$3)",[w,user.id,r.rows[0].id]);return {id:r.rows[0].id};
  });
 }
 if(path==='card/payment'&&req.method==='POST'){
  const b=await bodyOf(req),cardId=uuid(b.card_id),account=uuid(b.account_id),amount=pos(b.amount_cents),on=date(b.paid_on||now());
  await ensureOwned('cards',cardId,w);await ensureOwned('accounts',account,w);
  return inTx(async c=>{
   await c.query('SELECT id FROM cards WHERE id=$1 FOR UPDATE',[cardId]);
   const outstanding=await c.query('SELECT coalesce((SELECT sum(total_cents) FROM card_purchases WHERE card_id=$1 AND voided_at IS NULL),0)-coalesce((SELECT sum(amount_cents) FROM card_payments WHERE card_id=$1),0) AS amount',[cardId]);
   if(Number(outstanding.rows[0].amount)<amount)throw new ApiError(400,'Pagamento excede o saldo total registrado do cartão.');
   const r=await c.query('INSERT INTO card_payments(workspace_id,card_id,account_id,amount_cents,paid_on) VALUES($1,$2,$3,$4,$5) RETURNING id',[w,cardId,account,amount,on]);
   await c.query("INSERT INTO ledger_entries(workspace_id,account_id,reference,amount_cents,effective_on) VALUES($1,$2,$3,$4,$5)",[w,account,`card-payment:${r.rows[0].id}`,-amount,on]);
   await c.query("INSERT INTO audit_events(workspace_id,actor_id,action,entity,entity_id) VALUES($1,$2,'card.payment','card_payment',$3)",[w,user.id,r.rows[0].id]);return {id:r.rows[0].id};
  });
 }
 if(path==='card/void'&&req.method==='POST'){
  const b=await bodyOf(req),id=uuid(b.id);
  return inTx(async c=>{
   const p=await c.query('SELECT card_id,total_cents FROM card_purchases WHERE id=$1 AND workspace_id=$2 AND voided_at IS NULL',[id,w]);
   if(!p.rowCount)throw new ApiError(404,'Compra não localizada.');
   await c.query('SELECT id FROM cards WHERE id=$1 FOR UPDATE',[p.rows[0].card_id]);
   const due=await c.query('SELECT coalesce(sum(total_cents),0)::text total FROM card_purchases WHERE card_id=$1 AND voided_at IS NULL',[p.rows[0].card_id]);
   const paid=await c.query('SELECT coalesce(sum(amount_cents),0)::text total FROM card_payments WHERE card_id=$1',[p.rows[0].card_id]);
   if(Number(due.rows[0].total)-Number(p.rows[0].total_cents)<Number(paid.rows[0].total))throw new ApiError(400,'Esta compra já está comprometida por pagamentos efetuados e não pode ser cancelada diretamente.');
   await c.query('UPDATE card_purchases SET voided_at=now() WHERE id=$1',[id]);
   await c.query("INSERT INTO audit_events(workspace_id,actor_id,action,entity,entity_id) VALUES($1,$2,'card.purchase.void','card_purchase',$3)",[w,user.id,id]);return {id};
  });
 }
 if(path==='trade'&&req.method==='POST'){
  const b=await bodyOf(req),asset=uuid(b.asset_id),kind=enumVal(b.kind,['buy','sell','dividend','fee']);
  await ensureOwned('assets',asset,w);const acct=optuuid(b.account_id);if(acct)await ensureOwned('accounts',acct,w);
  const quantity=Number(b.quantity||0),price=cents(b.unit_price_cents||0),fees=cents(b.fees_cents||0);
  if(!Number.isFinite(quantity)||quantity<0||quantity>1e12||!/^\d+(\.\d{1,8})?$/.test(String(quantity)))throw new ApiError(400,'Quantidade inválida.');
  if(['buy','sell'].includes(kind)&&quantity<=0)throw new ApiError(400,'Quantidade necessária.');
  const total=['buy','sell'].includes(kind)?Math.round(quantity*price):pos(b.total_cents);
  if(!Number.isSafeInteger(total)||total<0||fees<0||(['buy','sell'].includes(kind)&&(price===0||total===0)))throw new ApiError(400,'Valor de negociação inválido.');
  const on=date(b.traded_on||now());
  return inTx(async c=>{
   const lastTrade=await c.query('SELECT traded_on FROM trades WHERE asset_id=$1 ORDER BY traded_on DESC LIMIT 1',[asset]);
   if(lastTrade.rowCount&&on<new Date(lastTrade.rows[0].traded_on).toISOString().slice(0,10))throw new ApiError(400,'Registre operações deste ativo em ordem cronológica para manter o custo médio correto.');
   await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[asset]);
   if(kind==='sell'){
    const r=await c.query("SELECT coalesce(sum(CASE kind WHEN 'buy' THEN quantity WHEN 'sell' THEN -quantity ELSE 0 END),0) quantity FROM trades WHERE asset_id=$1 AND traded_on <= $2",[asset,on]);
    if(Number(r.rows[0].quantity)+1e-7<quantity)throw new ApiError(400,'Quantidade vendida excede a posição registrada na data da operação.');
    const future=await c.query("SELECT traded_on,kind,quantity FROM trades WHERE asset_id=$1 AND kind IN ('buy','sell') AND traded_on > $2 ORDER BY traded_on,created_at",[asset,on]);
    let remaining=Number(r.rows[0].quantity)-quantity;
    for(const item of future.rows){remaining+=item.kind==='buy'?Number(item.quantity):-Number(item.quantity);if(remaining < -0.00000001)throw new ApiError(400,'Venda retroativa excederia a posição em data posterior.');}
   }
   const r=await c.query('INSERT INTO trades(workspace_id,asset_id,account_id,kind,quantity,unit_price_cents,total_cents,fees_cents,traded_on) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',[w,asset,acct,kind,quantity,price,total,fees,on]);
   if(acct){let out=0;if(kind==='buy')out=-total-fees;if(kind==='sell')out=total-fees;if(kind==='dividend')out=total;if(kind==='fee')out=-total;
    if(out!==0)await c.query('INSERT INTO ledger_entries(workspace_id,account_id,reference,amount_cents,effective_on) VALUES($1,$2,$3,$4,$5)',[w,acct,`trade:${r.rows[0].id}`,out,on]);
   }
   await c.query("INSERT INTO audit_events(workspace_id,actor_id,action,entity,entity_id) VALUES($1,$2,'investment.trade','trade',$3)",[w,user.id,r.rows[0].id]);return {id:r.rows[0].id};
  });
 }
 if(path==='price'&&req.method==='POST'){
  const b=await bodyOf(req),id=uuid(b.asset_id);await ensureOwned('assets',id,w);
  const price=cents(b.price_cents);if(price<0)throw new ApiError(400,'Preço não pode ser negativo.');
  await query(`INSERT INTO asset_prices(asset_id,priced_on,price_cents) VALUES($1,$2,$3) ON CONFLICT(asset_id,priced_on) DO UPDATE SET price_cents=excluded.price_cents,source='manual'`,[id,date(b.priced_on||now()),price]);
  await audit(w,user.id,'investment.price','asset',id);return {id};
 }
 if(path==='invoice/settle'&&req.method==='POST'){
  const b=await bodyOf(req),id=uuid(b.id),account=uuid(b.account_id);await ensureOwned('accounts',account,w);
  return inTx(async c=>{
   const invoice=await c.query("SELECT * FROM invoices WHERE id=$1 AND workspace_id=$2 AND status='open' FOR UPDATE",[id,w]);if(!invoice.rowCount)throw new ApiError(404,'Fatura não está em aberto.');
   const inv=invoice.rows[0];const kind=inv.direction==='receivable'?'income':'expense';
   const tr=await createTransaction(c,w,user.id,{kind,account_id:account,amount_cents:Number(inv.amount_cents),occurred_on:date(b.paid_on||now()),description:`Documento ${inv.number}`,source:'manual'});
   await c.query("UPDATE invoices SET status='paid',paid_on=$1,transaction_id=$2 WHERE id=$3",[date(b.paid_on||now()),tr.id,id]);
   await c.query("INSERT INTO audit_events(workspace_id,actor_id,action,entity,entity_id) VALUES($1,$2,'invoice.settle','invoice',$3)",[w,user.id,id]);return {id,transaction_id:tr.id};
  });
 }
 if(path==='invoice/void'&&req.method==='POST'){
  const b=await bodyOf(req),id=uuid(b.id);
  const r=await query("UPDATE invoices SET status='void' WHERE id=$1 AND workspace_id=$2 AND status IN ('open','draft') RETURNING id",[id,w]);
  if(!r.rowCount)throw new ApiError(400,'Documento não pode ser cancelado.');await audit(w,user.id,'invoice.void','invoice',id);return {id};
 }
 if(path==='debt/payment'&&req.method==='POST'){
  const b=await bodyOf(req),id=uuid(b.debt_id),account=uuid(b.account_id),principal=pos(b.principal_cents),interest=cents(b.interest_cents||0),on=date(b.paid_on||now());
  await ensureOwned('debts',id,w);await ensureOwned('accounts',account,w);if(interest<0)throw new ApiError(400,'Juros não podem ser negativos.');
  return inTx(async c=>{
   const d=await c.query('SELECT remaining_cents FROM debts WHERE id=$1 AND workspace_id=$2 FOR UPDATE',[id,w]);
   if(principal>Number(d.rows[0].remaining_cents))throw new ApiError(400,'Amortização maior do que o saldo devedor.');
   const p=await c.query('INSERT INTO debt_payments(debt_id,account_id,paid_on,principal_cents,interest_cents) VALUES($1,$2,$3,$4,$5) RETURNING id',[id,account,on,principal,interest]);
   await c.query('UPDATE debts SET remaining_cents=remaining_cents-$1 WHERE id=$2',[principal,id]);
   await c.query('INSERT INTO ledger_entries(workspace_id,account_id,reference,amount_cents,effective_on) VALUES($1,$2,$3,$4,$5)',[w,account,`debt-payment:${p.rows[0].id}`,-principal-interest,on]);
   await c.query("INSERT INTO audit_events(workspace_id,actor_id,action,entity,entity_id) VALUES($1,$2,'debt.payment','debt_payment',$3)",[w,user.id,p.rows[0].id]);return {id:p.rows[0].id};
  });
 }
 if(path==='import'&&req.method==='POST'){
  const b=await bodyOf(req),account=uuid(b.account_id);await ensureOwned('accounts',account,w);
  const raw=field(b.csv,1000000);
  let rows:string[][]=[];
  if(raw.includes('<STMTTRN>')){
   rows=[['date','description','amount','kind']];
   for(const block of raw.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi)||[]){
    const read=(tag:string)=>{const m=block.match(new RegExp(`<${tag}>([^<\r\n]+)`,'i'));return m?.[1]?.trim()||'';};
    const t=read('DTPOSTED'),value=Number(read('TRNAMT'));
    if(!/^\d{8}/.test(t)||!Number.isFinite(value)||value===0)continue;
    const day=`${t.slice(0,4)}-${t.slice(4,6)}-${t.slice(6,8)}`;
    rows.push([day,(read('NAME')+' '+read('MEMO')).trim().slice(0,400)||'Movimentação OFX',String(Math.abs(value)),value>0?'income':'expense']);
   }
   if(rows.length<2)throw new ApiError(400,'Nenhuma transação OFX válida encontrada.');
  }else rows=csvParse(raw);
  if(rows.length>2501)throw new ApiError(413,'Importação limitada a 2.500 registros por lote.');
  const header=rows.shift()?.map(s=>s.trim().toLowerCase())||[];
  const required=['date','description','amount','kind'];for(const name of required)if(!header.includes(name))throw new ApiError(400,`CSV deve conter cabeçalho: ${required.join(', ')}`);
  let imported=0,duplicates=0,rejected=0;const errors:string[]=[];
  for(let i=0;i<rows.length;i++){
   const r=Object.fromEntries(header.map((h,k)=>[h,rows[i][k]||'']));
   try{
    const kind=enumVal(r.kind,['income','expense']);const amount=exactCents(r.amount);
    if(amount<=0)throw Error('amount inválido');
    const on=date(r.date),description=field(r.description,400);
    const fingerprint=digest(`${account}|${on}|${kind}|${amount}|${description.toLowerCase()}`);
    await inTx(c=>createTransaction(c,w,user.id,{account_id:account,kind,amount_cents:amount,occurred_on:on,description,source:'import',fingerprint}));imported++;
   }catch(e){if((e as {code?:string}).code==='23505')duplicates++;else{rejected++;if(errors.length<15)errors.push(`Linha ${i+2}: ${e instanceof ApiError?e.message:'registro inválido'}`);}}
  }
  await audit(w,user.id,'csv.import','transactions',account,{imported,duplicates,rejected});return {imported,duplicates,rejected,errors};
 }
 if(path==='member'&&req.method==='POST'){
  ownerOnly(ctx);const b=await bodyOf(req);const action=enumVal(b.action||'create',['create','update','delete']);
  if(action==='create'){
   const email=field(b.email,180).toLowerCase(),name=field(b.name,100),password=text(b.password),role=enumVal(b.role,['admin','editor','viewer']);
   const invalidPassword=passwordError(password);if(invalidPassword)throw new ApiError(400,invalidPassword);
   const hash=await bcrypt.hash(password,12);
   const memberId=await inTx(async c=>{
    const existing=await c.query('SELECT id FROM users WHERE email=$1',[email]);
    const id=existing.rows[0]?.id||(await c.query('INSERT INTO users(email,name,password_hash) VALUES($1,$2,$3) RETURNING id',[email,name,hash])).rows[0].id;
    await c.query('INSERT INTO members(workspace_id,user_id,role) VALUES($1,$2,$3)',[w,id,role]);return id;
   });await audit(w,user.id,'member.add','user',memberId,{role});return {id:memberId};
  }
  const id=uuid(b.user_id);const target=await query('SELECT role FROM members WHERE user_id=$1 AND workspace_id=$2',[id,w]);
  if(!target.rowCount||target.rows[0].role==='owner')throw new ApiError(403,'Não é possível alterar o proprietário.');
  if(action==='delete')await query('DELETE FROM members WHERE user_id=$1 AND workspace_id=$2',[id,w]);
  else await query('UPDATE members SET role=$1 WHERE user_id=$2 AND workspace_id=$3',[enumVal(b.role,['admin','editor','viewer']),id,w]);
  await audit(w,user.id,`member.${action}`,'user',id);return {id};
 }
 throw new ApiError(404,'Rota inexistente.');
}
async function handler(req:NextRequest,{params}:{params:Promise<{route:string[]}>}){
 try {await sameOrigin(req);const {route}=await params;const result=await dispatch(req,route);return json(result);}
 catch(e){
  if(e instanceof ApiError)return json({error:e.message},e.status);
  if((e as {code?:string}).code==='23505')return json({error:'Já existe um registro com estes dados.'},409);
  if((e as {code?:string}).code==='23503')return json({error:'Registro relacionado inexistente, em uso ou de outro contexto.'},400);
  if((e as {code?:string}).code==='23514')return json({error:'O valor viola uma regra de integridade.'},400);
  const incident=randomBytes(5).toString('hex').toUpperCase();
  const pgCode=(e as {code?:string})?.code;
  const phase=req.nextUrl.pathname.includes('/setup')?'setup':req.nextUrl.pathname.includes('/login')?'login':'api';
  console.error(JSON.stringify({severity:'error',service:'finance-hub',incident,phase,sqlstate:typeof pgCode==='string'?pgCode:undefined,errorClass:e instanceof Error?e.name:'Unknown'}));
  return json({error:`Erro interno [FH-${incident}]. Verifique os logs do container web e o diagnóstico da instalação.`,code:`FH-${incident}`},500);
 }
}
export {handler as GET,handler as POST};
