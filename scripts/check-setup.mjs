// Verificação transacional NÃO destrutiva; executada após a migração.
// Valida exatamente as tabelas e os tipos de dados necessários ao primeiro cadastro.
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const secret=readFileSync('/run/secrets/app_password','utf8').trim();
const pool=new pg.Pool({host:process.env.PGHOST||'db',port:Number(process.env.PGPORT||5432),user:'financehub_app',database:process.env.PGDATABASE||'financehub',password:secret,connectionTimeoutMillis:5000});
let client;
try {
 client=await pool.connect();
 const required=['users','sessions','login_attempts','workspaces','members','categories','audit_events'];
 const missing=[];
 for (const name of required) {const r=await client.query('SELECT to_regclass($1) AS relation',[`public.${name}`]);if(!r.rows[0].relation)missing.push(name);}
 if(missing.length)throw new Error('Tabelas obrigatórias ausentes: '+missing.join(', '));
 await client.query('BEGIN');
 const unique=randomUUID();
 const user=await client.query('INSERT INTO users(email,name,password_hash) VALUES($1,$2,$3) RETURNING id',[`selftest-${unique}@example.invalid`,'FinanceHub Teste','$2b$12$placeholder.for.schema.only']);
 const workspace=await client.query("INSERT INTO workspaces(name,kind) VALUES($1,'personal') RETURNING id",['Diagnóstico temporário']);
 const w=workspace.rows[0].id,u=user.rows[0].id;
 await client.query("INSERT INTO members(workspace_id,user_id,role) VALUES($1,$2,'owner')",[w,u]);
 await client.query("INSERT INTO categories(workspace_id,name,kind,color) VALUES($1,$2,'expense',$3)",[w,'Diagnóstico','#123456']);
 await client.query("INSERT INTO audit_events(workspace_id,actor_id,action,entity,entity_id) VALUES($1,$2,'system.setup','workspace',$3)",[w,u,String(w)]);
 const r=await client.query('SELECT count(*)::int AS count FROM members WHERE user_id=$1 AND workspace_id=$2',[u,w]);
 if(r.rows[0].count!==1)throw new Error('Falha ao consultar vínculo do administrador.');
 console.log('FINANCE HUB: diagnóstico de primeiro acesso aprovado (transação revertida, dados reais preservados).');
} catch(err){
 console.error('FINANCE HUB: diagnóstico de primeiro acesso FALHOU; sqlstate='+String(err.code||'N/A')+'; tipo='+String(err.name||'Error')+'; detalhe='+String(err.message||'Erro desconhecido'));
 process.exitCode=1;
} finally {
 if(client){try{await client.query('ROLLBACK');}catch{}client.release();}
 await pool.end();
}
