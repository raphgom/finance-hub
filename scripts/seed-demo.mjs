/**
 * Finance Hub demo dataset. Runs only in the dedicated Compose demo project.
 * Password is random per machine. Transactional and idempotent.
 * Does not touch the operational Compose project or its volume.
 */
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'node:fs';
import { createCipheriv, hkdfSync, randomBytes } from 'node:crypto';

if (process.env.FH_DEMO_MODE !== 'isolated-demo') throw Error('Recusando seed fora do ambiente de demonstração isolado.');
const secret = (key) => readFileSync(`/run/secrets/${key}`, 'utf8').trim();
const master = Buffer.from(secret('master_key'));
const password = secret('demo_password');
if (password.length < 16) throw Error('Senha da demonstração ausente ou curta.');
const db = new pg.Client({host: process.env.PGHOST||'db', user: 'financehub_app', database:'financehub',password:secret('app_password'),port:5432});
const encrypt = (w, content) => {
  if(!content)return null;
  const k=Buffer.from(hkdfSync('sha256',master,Buffer.from(w),'finance-hub-field-encryption-v1',32));
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',k,iv);
  const raw=Buffer.concat([cipher.update(String(content),'utf8'),cipher.final()]);
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${raw.toString('base64')}`;
};
const day=(delta=0)=>{const d=new Date();d.setUTCHours(12,0,0,0);d.setUTCDate(d.getUTCDate()+delta);return d.toISOString().slice(0,10);};
const month=(offset=0)=>{const d=new Date();d.setUTCHours(12,0,0,0);d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+offset);return d.toISOString().slice(0,7);};
const at=(mo,dd)=>{const [y,m]=month(mo).split('-').map(Number);const last=new Date(Date.UTC(y,m,0)).getUTCDate();return `${month(mo)}-${String(Math.min(dd,last)).padStart(2,'0')}`;};
const colors=['#4BBFA8','#6DC8BA','#61B2E6','#4D9FCE','#9E8CF4','#F6B96A','#E68C8A','#DC91C4','#72BAE3','#B09BF4','#7DA4E8','#EF9B84','#E5BC74','#93A0B5'];
const defaultCats=[['Salário','income'],['Receitas extras','income'],['Vendas e serviços','income'],['Dividendos e rendimentos','income'],['Moradia','expense'],['Alimentação','expense'],['Transporte','expense'],['Saúde','expense'],['Educação','expense'],['Lazer','expense'],['Assinaturas','expense'],['Impostos','expense'],['Serviços e operações','expense'],['Outros','expense']];
let inserts=0;
async function add(sql, args=[]){const r=await db.query(sql,args);inserts++;return r.rows[0];}
async function workspace(user,name,kind){
 const w=(await add('INSERT INTO workspaces(name,kind) VALUES($1,$2) RETURNING id',[name,kind])).id;
 await add("INSERT INTO members(workspace_id,user_id,role) VALUES($1,$2,'owner')",[w,user]);
 const categories={};
 for(let i=0;i<defaultCats.length;i++){const [title,type]=defaultCats[i];categories[title]=(await add('INSERT INTO categories(workspace_id,name,kind,color) VALUES($1,$2,$3,$4) RETURNING id',[w,title,type,colors[i]])).id;}
 return {w,categories};
}
async function account(w,name,kind,balance){return (await add('INSERT INTO accounts(workspace_id,name,kind,initial_cents) VALUES($1,$2,$3,$4) RETURNING id',[w,name,kind,balance])).id;}
async function transaction(w,user,accountId,categoryId,kind,cents,on,description,toAccount=null){
 const tx=(await add('INSERT INTO transactions(workspace_id,account_id,to_account_id,category_id,kind,amount_cents,occurred_on,description_enc,source,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',[w,accountId,toAccount,categoryId,kind,cents,on,encrypt(w,description),'demo',user])).id;
 await add('INSERT INTO ledger_entries(workspace_id,account_id,transaction_id,amount_cents,effective_on) VALUES($1,$2,$3,$4,$5)',[w,accountId,tx,kind==='income'?cents:-cents,on]);
 if(kind==='transfer')await add('INSERT INTO ledger_entries(workspace_id,account_id,transaction_id,amount_cents,effective_on) VALUES($1,$2,$3,$4,$5)',[w,toAccount,tx,cents,on]);
}
async function card(w,name,limit,close,due){return (await add('INSERT INTO cards(workspace_id,name,limit_cents,closing_day,due_day) VALUES($1,$2,$3,$4,$5) RETURNING id',[w,name,limit,close,due])).id;}
async function cardPurchase(w,id,category,amount,on,description,parts=1){
 const purchase=(await add('INSERT INTO card_purchases(workspace_id,card_id,category_id,description_enc,purchased_on,total_cents,installments) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[w,id,category,encrypt(w,description),on,amount,parts])).id;
 // Mesma regra de fechamento/vencimento do motor principal; meses curtos sao respeitados.
 const billing=await db.query('SELECT closing_day,due_day FROM cards WHERE id=$1',[id]);
 const {closing_day:closing,due_day:dueDay}=billing.rows[0];
 const [y,m]=on.slice(0,7).split('-').map(Number);
 const baseDelta=Number(on.slice(8))>closing?1:0;
 const dueDelta=baseDelta+(dueDay<=closing?1:0);
 for(let i=0;i<parts;i++){
  const d=new Date(Date.UTC(y,m-1+dueDelta+i,12));
  const due=d.toISOString().slice(0,7)+'-'+String(dueDay).padStart(2,'0');
  const part=Math.floor(amount/parts)+(i<amount%parts?1:0);
  await add('INSERT INTO card_installments(purchase_id,installment_no,due_on,amount_cents) VALUES($1,$2,$3,$4)',[purchase,i+1,due,part]);
 }
 return purchase;
}
async function asset(w,symbol,name,assetClass,buys,current){
 const id=(await add('INSERT INTO assets(workspace_id,symbol,name,asset_class) VALUES($1,$2,$3,$4) RETURNING id',[w,symbol,name,assetClass])).id;
 let index=0;
 for(const [quantity,priceCents,months] of buys){await add("INSERT INTO trades(workspace_id,asset_id,kind,quantity,unit_price_cents,total_cents,traded_on) VALUES($1,$2,'buy',$3,$4,$5,$6)",[w,id,quantity,priceCents,Math.round(quantity*priceCents),at(months,8+index++)]);}
 await add('INSERT INTO asset_prices(asset_id,priced_on,price_cents) VALUES($1,$2,$3)',[id,day(),current]);
 return id;
}
async function seedPersonal(user){
 const {w,categories:c}=await workspace(user,'Demo · Finanças pessoais','personal');
 const bank=await account(w,'Banco Principal · Demo','checking',1680000);
 const savings=await account(w,'Reserva de emergência','savings',2250000);
 const broker=await account(w,'Conta de investimentos','investment',0);
 const digital=await account(w,'Carteira digital','digital',85000);
 for(let m=-11;m<=0;m++){
  const seasonal=(m+12)%5;
  await transaction(w,user,bank,c['Salário'],'income',1120000+seasonal*12000,at(m,5),'Salário · Empresa de exemplo');
  await transaction(w,user,bank,c['Receitas extras'],'income',120000+seasonal*17500,at(m,21),'Consultoria eventual');
  const expenses=[['Moradia',345000,7,'Aluguel e condomínio'],['Alimentação',128000+seasonal*5500,9,'Mercado mensal'],['Transporte',68000+seasonal*4000,12,'Mobilidade'],['Saúde',47000,13,'Plano de saúde'],['Educação',52000,16,'Cursos e educação'],['Lazer',51000+seasonal*7500,22,'Restaurantes e lazer'],['Assinaturas',18300,24,'Serviços digitais'],['Impostos',41000,27,'Tributos mensais']];
  for(const [cat,v,d,desc] of expenses)await transaction(w,user,bank,c[cat],'expense',v,at(m,d),desc);
 }
 await transaction(w,user,bank,null,'transfer',200000,at(-1,18),'Reforço da reserva',savings);
 const mainCard=await card(w,'Cartão Premium · Demo',2600000,4,12), second=await card(w,'Cartão Cashback · Demo',950000,15,23);
 for(let m=-6;m<=0;m++)await cardPurchase(w,mainCard,c['Alimentação'],92000+Math.abs(m)*2500,at(m,10),'Compras no cartão');
 await cardPurchase(w,mainCard,c['Educação'],699000,at(-2,20),'Notebook para estudo',10);
 await cardPurchase(w,second,c['Lazer'],61500,at(-1,17),'Passeio familiar');
 const pay=(await add('INSERT INTO card_payments(workspace_id,card_id,account_id,amount_cents,paid_on) VALUES($1,$2,$3,$4,$5) RETURNING id',[w,mainCard,bank,190000,at(-1,12)])).id;
 await add('INSERT INTO ledger_entries(workspace_id,account_id,reference,amount_cents,effective_on) VALUES($1,$2,$3,$4,$5)',[w,bank,`card-payment:${pay}`,-190000,at(-1,12)]);
 for(const [category,limit] of [['Moradia',380000],['Alimentação',170000],['Saúde',60000],['Transporte',100000],['Educação',80000],['Lazer',70000],['Assinaturas',25000],['Impostos',70000]]){
  for(let m=-1;m<=0;m++)await add('INSERT INTO budgets(workspace_id,category_id,period,limit_cents) VALUES($1,$2,$3,$4)',[w,c[category],month(m),limit]);
 }
 await add('INSERT INTO goals(workspace_id,name,target_cents,allocated_cents,target_on) VALUES($1,$2,$3,$4,$5)',[w,'Reserva para viagem',1600000,950000,at(8,20)]);
 await add('INSERT INTO goals(workspace_id,name,target_cents,allocated_cents,target_on) VALUES($1,$2,$3,$4,$5)',[w,'Reserva de emergência',3000000,2250000,at(15,12)]);
 const a=await asset(w,'TESOURO-IPCA','Tesouro IPCA+','renda_fixa',[[20,11850,-10],[12,12000,-5]],12800);
 const b=await asset(w,'IVVB11','ETF S&P 500','etf',[[15,33000,-8],[8,34500,-2]],36800);
 const d=await asset(w,'HGLG11','Fundo imobiliário logístico','fii',[[32,15500,-6],[12,16000,-1]],16400);
 for(const [assetId,value,on] of [[a,4800,at(-2,18)],[b,3600,at(-1,18)],[d,7200,at(0,18)]])await add("INSERT INTO trades(workspace_id,asset_id,kind,total_cents,traded_on) VALUES($1,$2,'dividend',$3,$4)",[w,assetId,value,on]);
 await add('INSERT INTO holdings(workspace_id,name,kind,value_cents,valued_on,notes_enc) VALUES($1,$2,$3,$4,$5,$6)',[w,'Automóvel · Demo','veiculo',5600000,day(),encrypt(w,'Avaliação ilustrativa')]);
 const debt=(await add('INSERT INTO debts(workspace_id,name,principal_cents,remaining_cents,annual_rate,payment_cents,due_day) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[w,'Financiamento veículo',3400000,3115000,11.6,75000,18])).id;
 for(let i=1;i<=3;i++){
  const pid=(await add('INSERT INTO debt_payments(debt_id,paid_on,principal_cents,interest_cents,account_id) VALUES($1,$2,$3,$4,$5) RETURNING id',[debt,at(-i,18),95000,16500,bank])).id;
  await add('INSERT INTO ledger_entries(workspace_id,account_id,reference,amount_cents,effective_on) VALUES($1,$2,$3,$4,$5)',[w,bank,`debt-payment:${pid}`,-111500,at(-i,18)]);
 }
 for(const [name,amount,cadence,nextOn,cat] of [['Streaming filmes',4590,'monthly',at(1,10),'Assinaturas'],['Academia',12990,'monthly',at(1,6),'Saúde'],['Armazenamento',2990,'monthly',at(1,11),'Assinaturas']])await add('INSERT INTO subscriptions(workspace_id,name,amount_cents,cadence,next_on,category_id) VALUES($1,$2,$3,$4,$5,$6)',[w,name,amount,cadence,nextOn,c[cat]]);
 await add('INSERT INTO automation_rules(workspace_id,name,pattern,category_id,enabled,priority) VALUES($1,$2,$3,$4,true,$5)',[w,'Mercado automático','mercado',c['Alimentação'],10]);
 await add('INSERT INTO schedules(workspace_id,account_id,category_id,kind,amount_cents,description_enc,cadence,next_on,enabled) VALUES($1,$2,$3,$4,$5,$6,$7,$8,false)',[w,bank,c['Moradia'],'expense',345000,encrypt(w,'Aluguel agendado'),'monthly',at(1,7)]);
 return w;
}
async function seedFamily(user){
 const {w,categories:c}=await workspace(user,'Demo · Orçamento familiar','family');
 const household=await account(w,'Conta compartilhada','checking',730000);
 for(let m=-11;m<=0;m++){
  await transaction(w,user,household,c['Salário'],'income',880000,at(m,5),'Contribuições do casal');
  for(const [cat,v,d,name] of [['Moradia',298000,8,'Moradia familiar'],['Alimentação',145000,14,'Supermercado'],['Educação',115000,16,'Escola'],['Saúde',63000,20,'Saúde familiar'],['Lazer',50000,24,'Passeios']])await transaction(w,user,household,c[cat],'expense',v,at(m,d),name);
 }
 await add('INSERT INTO goals(workspace_id,name,target_cents,allocated_cents,target_on) VALUES($1,$2,$3,$4,$5)',[w,'Férias em família',2200000,780000,at(11,1)]);
 await add('INSERT INTO holdings(workspace_id,name,kind,value_cents,valued_on) VALUES($1,$2,$3,$4,$5)',[w,'Imóvel residencial','imovel',48000000,day()]);
 await add('INSERT INTO debts(workspace_id,name,principal_cents,remaining_cents,annual_rate,payment_cents,due_day) VALUES($1,$2,$3,$4,$5,$6,$7)',[w,'Financiamento imobiliário',31000000,24500000,8.9,320000,12]);
 const familyCard=await card(w,'Cartão Família',800000,7,17);
 await cardPurchase(w,familyCard,c['Educação'],258000,at(-1,3),'Material escolar',6);
 for(const [cat,v] of [['Moradia',310000],['Alimentação',155000],['Educação',120000],['Saúde',80000],['Lazer',60000]])await add('INSERT INTO budgets(workspace_id,category_id,period,limit_cents) VALUES($1,$2,$3,$4)',[w,c[cat],month(),v]);
 return w;
}
async function seedBusiness(user){
 const {w,categories:c}=await workspace(user,'Demo · Empresa modelo','business');
 const bank=await account(w,'Conta PJ · Demo','checking',3200000);
 for(let m=-11;m<=0;m++){
  const revenue=1520000+((m+12)%5)*145000;
  await transaction(w,user,bank,c['Vendas e serviços'],'income',revenue,at(m,8),'Receita de contratos recorrentes');
  await transaction(w,user,bank,c['Receitas extras'],'income',160000+((m+12)%3)*50000,at(m,18),'Projetos avulsos');
  for(const [cat,v,d,desc] of [['Serviços e operações',470000,10,'Equipe e serviços'],['Moradia',155000,12,'Escritório'],['Impostos',220000,20,'Tributos'],['Assinaturas',64500,25,'Software empresarial'],['Transporte',32000,27,'Deslocamentos']])await transaction(w,user,bank,c[cat],'expense',v,at(m,d),desc);
 }
 const contact1=(await add('INSERT INTO contacts(workspace_id,name,kind,email_enc) VALUES($1,$2,$3,$4) RETURNING id',[w,'Cliente Aurora Ltda.','customer',encrypt(w,'contato@aurora.example')])).id;
 const contact2=(await add('INSERT INTO contacts(workspace_id,name,kind,email_enc) VALUES($1,$2,$3,$4) RETURNING id',[w,'Fornecedor Solaris','vendor',encrypt(w,'financeiro@solaris.example')])).id;
 for(const [num,dir,amt,issue,due,contact] of [['NF-2026-081','receivable',380000,at(0,3),at(1,8),contact1],['NF-2026-082','receivable',550000,at(0,15),at(1,20),contact1],['FOR-076','payable',125000,at(0,7),at(1,11),contact2],['FOR-077','payable',86000,at(-1,6),at(-1,25),contact2]]){
  await add('INSERT INTO invoices(workspace_id,contact_id,number,direction,status,amount_cents,issued_on,due_on) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[w,contact,num,dir,'open',amt,issue,due]);
 }
 for(const [name,stage,val,prob,when] of [['Transformação digital','qualified',2400000,50,at(2,15)],['Automação operacional','proposal',1500000,70,at(1,20)],['Expansão de suporte','negotiation',780000,85,at(1,7)],['Projeto encerrado','won',580000,100,at(-2,7)]]){
  await add('INSERT INTO opportunities(workspace_id,name,contact_id,stage,expected_cents,probability,expected_on) VALUES($1,$2,$3,$4,$5,$6,$7)',[w,name,contact1,stage,val,prob,when]);
 }
 const companyCard=await card(w,'Cartão Corporativo',1500000,5,15);
 await cardPurchase(w,companyCard,c['Serviços e operações'],318000,at(-1,20),'Equipamentos empresariais',4);
 for(const [cat,v] of [['Serviços e operações',550000],['Impostos',300000],['Assinaturas',100000],['Moradia',190000]])await add('INSERT INTO budgets(workspace_id,category_id,period,limit_cents) VALUES($1,$2,$3,$4)',[w,c[cat],month(),v]);
 await add('INSERT INTO subscriptions(workspace_id,name,amount_cents,cadence,next_on,category_id) VALUES($1,$2,$3,$4,$5,$6)',[w,'Plataforma de CRM',24900,'monthly',at(1,9),c['Assinaturas']]);
 await add('INSERT INTO automation_rules(workspace_id,name,pattern,category_id,enabled,priority) VALUES($1,$2,$3,$4,true,$5)',[w,'Classificar CRM','crm',c['Assinaturas'],20]);
 return w;
}
await db.connect();
try{
 await db.query('BEGIN');
 const found=await db.query("SELECT id FROM users WHERE email='demo@financehub.local'");
 if(found.rowCount){
  const w=await db.query('SELECT count(*)::int AS n FROM members WHERE user_id=$1',[found.rows[0].id]);
  if(Number(w.rows[0].n)!==3)throw Error('Dataset demo incompleto; execute demo.ps1 -ResetDemo -ConfirmReset.');
  console.log('Demo já existe; preservado dataset existente.');
 } else {
  const others=await db.query('SELECT count(*)::int AS n FROM users');
  if(Number(others.rows[0].n)!==0)throw Error('Banco não está vazio. Recusando seed para proteger dados reais.');
  const pwHash=await bcrypt.hash(password,12);
  const user=(await add('INSERT INTO users(email,name,password_hash) VALUES($1,$2,$3) RETURNING id',['demo@financehub.local','Finance Hub · Demonstração',pwHash])).id;
  for(const create of [seedPersonal,seedFamily,seedBusiness]){
    const workspaceId=await create(user);
    await add('INSERT INTO audit_events(workspace_id,actor_id,action,entity,entity_id) VALUES($1,$2,$3,$4,$5)',[workspaceId,user,'demo.seed','workspace',workspaceId]);
  }
  console.log(`FINANCE HUB DEMO: 3 workspaces e ${inserts} registros inseridos. Todos os valores são fictícios.`);
 }
 await db.query('COMMIT');
}catch(e){await db.query('ROLLBACK');console.error('FINANCE HUB DEMO seed falhou:',e.message);process.exitCode=1;}
finally{await db.end();}
