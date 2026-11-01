import pg from 'pg';
import {readFileSync} from 'node:fs';
const secret=k=>readFileSync(`/run/secrets/${k}`,'utf8').trim();
const db=new pg.Pool({host:process.env.PGHOST||'db',database:process.env.PGDATABASE||'financehub',user:process.env.PGUSER||'financehub_app',password:secret('app_password'),port:5432,max:2});
function advance(s,frequency,anchorDay){const d=new Date(s+'T12:00:00Z'),day=d.getUTCDate();if(frequency==='weekly'){d.setUTCDate(day+7);return d.toISOString().slice(0,10);}d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+(frequency==='yearly'?12:1));d.setUTCDate(Math.min(anchorDay,new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate()));return d.toISOString().slice(0,10);}
async function cycle(){
 const c=await db.connect();try{
  for(let i=0;i<500;i++){
   await c.query('BEGIN');
   const r=await c.query("SELECT * FROM schedules WHERE enabled=true AND next_on<=current_date ORDER BY next_on FOR UPDATE SKIP LOCKED LIMIT 1");
   if(!r.rowCount){await c.query('COMMIT');break;}
   const s=r.rows[0],due=s.next_on.toISOString?.().slice(0,10)||String(s.next_on).slice(0,10);
   const existing=await c.query('SELECT 1 FROM schedule_runs WHERE schedule_id=$1 AND due_on=$2',[s.id,due]);
   if(!existing.rowCount){
    const t=await c.query("INSERT INTO transactions(workspace_id,account_id,category_id,kind,amount_cents,occurred_on,description_enc,source) VALUES($1,$2,$3,$4,$5,$6,$7,'schedule') RETURNING id",[s.workspace_id,s.account_id,s.category_id,s.kind,s.amount_cents,due,s.description_enc]);
    await c.query('INSERT INTO ledger_entries(workspace_id,account_id,transaction_id,amount_cents,effective_on) VALUES($1,$2,$3,$4,$5)',[s.workspace_id,s.account_id,t.rows[0].id,s.kind==='income'?s.amount_cents:-Number(s.amount_cents),due]);
    await c.query('INSERT INTO schedule_runs(schedule_id,due_on,transaction_id) VALUES($1,$2,$3)',[s.id,due,t.rows[0].id]);
    await c.query("INSERT INTO audit_events(workspace_id,action,entity,entity_id,meta) VALUES($1,'schedule.execute','schedule',$2,$3)",[s.workspace_id,s.id,JSON.stringify({due,transaction_id:t.rows[0].id})]);
   }
   await c.query('UPDATE schedules SET next_on=$1 WHERE id=$2',[advance(due,s.cadence,s.anchor_day||Number(due.slice(8))),s.id]);
   await c.query('COMMIT');
  }
 }catch(e){await c.query('ROLLBACK').catch(()=>{});console.error('Automation cycle failed:',e.message);}finally{c.release();}
}
console.log('Finance Hub worker active');await cycle();setInterval(cycle,60000).unref?.();
// Keep Node process alive for scheduled checks.
setInterval(()=>{},3600000);
