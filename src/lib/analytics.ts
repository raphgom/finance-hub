import { query,unseal } from './server';
import { portfolio } from './finance';
export async function overview(w:string){
 const [accounts, tx, cardTx, cards, budget, goals, debts, holdings, trades, prices, invoices, opportunities, subs, categories, upcoming, overdue, activity, returns, interest]=await Promise.all([
  query(`SELECT a.id,a.name,a.kind,a.currency,a.initial_cents,coalesce(sum(le.amount_cents),0)::text ledger_cents,(a.initial_cents+coalesce(sum(le.amount_cents),0))::text balance_cents FROM accounts a LEFT JOIN ledger_entries le ON le.account_id=a.id WHERE a.workspace_id=$1 AND a.archived=false GROUP BY a.id ORDER BY a.name`,[w]),
  query(`SELECT to_char(date_trunc('month',occurred_on),'YYYY-MM') AS "month",kind,category_id,sum(amount_cents)::text amount FROM transactions WHERE workspace_id=$1 AND voided_at IS NULL AND kind<>'transfer' AND occurred_on >= (CURRENT_DATE - INTERVAL '18 months') GROUP BY 1,2,3 ORDER BY 1`,[w]),
  query(`SELECT to_char(date_trunc('month',p.purchased_on),'YYYY-MM') AS "month",p.category_id,sum(p.total_cents)::text amount FROM card_purchases p WHERE p.workspace_id=$1 AND p.voided_at IS NULL AND p.purchased_on >= (CURRENT_DATE - INTERVAL '18 months') GROUP BY 1,2`,[w]),
  query(`SELECT c.id,c.name,c.limit_cents,coalesce((SELECT sum(p.total_cents) FROM card_purchases p WHERE p.card_id=c.id AND p.voided_at IS NULL),0)::text purchases_cents,coalesce((SELECT sum(cp.amount_cents) FROM card_payments cp WHERE cp.card_id=c.id),0)::text paid_cents,coalesce((SELECT sum(i.amount_cents) FROM card_installments i JOIN card_purchases p ON p.id=i.purchase_id WHERE p.card_id=c.id AND p.voided_at IS NULL AND i.due_on >=date_trunc('month',current_date)),0)::text future_cents FROM cards c WHERE c.workspace_id=$1 AND c.archived=false`,[w]),
  query(`SELECT b.id,b.period,b.limit_cents,c.name category,c.id category_id,c.color FROM budgets b JOIN categories c ON c.id=b.category_id WHERE b.workspace_id=$1 AND b.period>=to_char(current_date-interval '2 months','YYYY-MM')`,[w]),
  query('SELECT id,name,target_cents,allocated_cents,target_on FROM goals WHERE workspace_id=$1 ORDER BY name',[w]),
  query('SELECT id,name,remaining_cents,principal_cents,annual_rate,payment_cents FROM debts WHERE workspace_id=$1',[w]),
  query('SELECT id,name,kind,value_cents,valued_on FROM holdings WHERE workspace_id=$1',[w]),
  query('SELECT t.*,a.symbol,a.name asset_name,a.asset_class FROM trades t JOIN assets a ON a.id=t.asset_id WHERE t.workspace_id=$1 ORDER BY t.traded_on,t.created_at',[w]),
  query(`SELECT a.id,a.symbol,a.name,a.asset_class,COALESCE((SELECT p.price_cents FROM asset_prices p WHERE p.asset_id=a.id ORDER BY p.priced_on DESC LIMIT 1),(SELECT t.unit_price_cents FROM trades t WHERE t.asset_id=a.id AND t.kind IN ('buy','sell') ORDER BY t.traded_on DESC,t.created_at DESC LIMIT 1),0)::text price_cents FROM assets a WHERE a.workspace_id=$1`,[w]),
  query(`SELECT direction,status,amount_cents,due_on FROM invoices WHERE workspace_id=$1 AND status<>'void'`,[w]),
  query(`SELECT stage,expected_cents,probability,expected_on FROM opportunities WHERE workspace_id=$1`,[w]),
  query('SELECT id,name,amount_cents,cadence,next_on,status FROM subscriptions WHERE workspace_id=$1',[w]),
  query('SELECT id,name,kind,color FROM categories WHERE workspace_id=$1 ORDER BY name',[w]),
  query(`SELECT amount_cents,due_on,'invoice' kind,direction AS label FROM invoices WHERE workspace_id=$1 AND status='open' AND due_on <= current_date+interval '60 days' UNION ALL SELECT amount_cents,next_on,'subscription',name FROM subscriptions WHERE workspace_id=$1 AND status='active' AND next_on<=current_date+interval '60 days' ORDER BY due_on LIMIT 30`,[w]),
  query(`SELECT count(*)::int count FROM invoices WHERE workspace_id=$1 AND status='open' AND due_on<current_date`,[w]),
  query(`SELECT id,account_id,kind,amount_cents,occurred_on,description_enc FROM transactions WHERE workspace_id=$1 AND voided_at IS NULL ORDER BY occurred_on DESC,created_at DESC LIMIT 12`,[w]),
  query(`SELECT to_char(date_trunc('month',traded_on),'YYYY-MM') AS "month",kind,sum(total_cents)::text amount FROM trades WHERE workspace_id=$1 AND kind IN ('dividend','fee') AND traded_on>=current_date-interval '18 months' GROUP BY 1,2`,[w]),
  query(`SELECT to_char(date_trunc('month',dp.paid_on),'YYYY-MM') AS "month",sum(dp.interest_cents)::text amount FROM debt_payments dp JOIN debts d ON d.id=dp.debt_id WHERE d.workspace_id=$1 AND dp.paid_on>=current_date-interval '18 months' GROUP BY 1`,[w])
 ]);
 const income:Record<string,number>={},expenses:Record<string,number>={},byCategory:Record<string,number>={};
 const period=new Date().toISOString().slice(0,7);
 for(const t of tx.rows){const a=Number(t.amount);if(t.kind==='income')income[t.month]=(income[t.month]||0)+a;else{expenses[t.month]=(expenses[t.month]||0)+a;if(t.month===period)byCategory[t.category_id??'other']=(byCategory[t.category_id??'other']||0)+a;}}
 for(const t of cardTx.rows){const a=Number(t.amount);expenses[t.month]=(expenses[t.month]||0)+a;if(t.month===period)byCategory[t.category_id??'other']=(byCategory[t.category_id??'other']||0)+a;}
 for(const t of returns.rows){const a=Number(t.amount);if(t.kind==='dividend')income[t.month]=(income[t.month]||0)+a;else expenses[t.month]=(expenses[t.month]||0)+a;}
 for(const t of interest.rows)expenses[t.month]=(expenses[t.month]||0)+Number(t.amount);
 const priceDict:Record<string,number>={};for(const p of prices.rows)priceDict[p.id]=Number(p.price_cents);
 const positions=portfolio(trades.rows,priceDict).map(p=>({...p,...(prices.rows.find(a=>a.id===p.asset_id)||{})}));
 const invested=positions.reduce((sum,p)=>sum+p.market,0);
 const cash=accounts.rows.reduce((sum,a)=>sum+Number(a.balance_cents),0);
 const liabilities=debts.rows.reduce((sum,d)=>sum+Number(d.remaining_cents),0);
 const cardLiability=cards.rows.reduce((sum,c)=>sum+Number(c.purchases_cents)-Number(c.paid_cents),0);
 const tangible=holdings.rows.reduce((sum,a)=>sum+Number(a.value_cents),0);
 const receivables=invoices.rows.filter(i=>i.direction==='receivable'&&i.status==='open').reduce((s,i)=>s+Number(i.amount_cents),0);
 const payables=invoices.rows.filter(i=>i.direction==='payable'&&i.status==='open').reduce((s,i)=>s+Number(i.amount_cents),0);
 const monthlyIncome=income[period]||0,monthlyExpense=expenses[period]||0;
 const budgetMap=budget.rows.map(b=>({ ...b, used:byCategory[b.category_id]||0, remaining:Number(b.limit_cents)-(byCategory[b.category_id]||0)}));
 const months=Array.from(new Set([...Object.keys(income),...Object.keys(expenses)])).sort();
 const monthly=months.map(m=>({month:m,income:income[m]||0,expenses:expenses[m]||0,result:(income[m]||0)-(expenses[m]||0)}));
 const categoryList=Object.entries(byCategory).map(([id,value])=>({name:categories.rows.find(c=>c.id===id)?.name||'Sem categoria',value,color:categories.rows.find(c=>c.id===id)?.color||'#97a2bd'})).sort((a,b)=>b.value-a.value);
 // Pipeline futuro: nao inclui oportunidades ganhas ou perdidas.
 const weightedPipeline=opportunities.rows.filter(o=>['lead','qualified','proposal','negotiation'].includes(o.stage)).reduce((s,o)=>s+Math.round(Number(o.expected_cents)*Number(o.probability)/100),0);
 const insights:{type:'risk'|'opportunity'|'info',title:string,detail:string,section:string}[]=[];
 if(monthlyIncome>0 && monthlyExpense>monthlyIncome)insights.push({type:'risk',title:'Despesas acima das receitas',detail:'O mês apresenta resultado negativo. Avalie os maiores centros de custo.',section:'reports'});
 if(monthlyIncome>0&&monthlyExpense<monthlyIncome*.65)insights.push({type:'opportunity',title:'Capacidade de poupança',detail:'Há margem para destinar parte do resultado positivo a metas ou investimentos.',section:'goals'});
 for(const b of budgetMap.filter(b=>b.used>b.limit_cents))insights.push({type:'risk',title:`Orçamento excedido: ${b.category}`,detail:'O realizado ultrapassou o limite definido para o mês.',section:'budgets'});
 if(Number(overdue.rows[0]?.count)>0)insights.push({type:'risk',title:'Recebíveis ou pagamentos vencidos',detail:`Existem ${overdue.rows[0].count} documentos empresariais em atraso.`,section:'business'});
 if(cardLiability>monthlyIncome && monthlyIncome>0)insights.push({type:'risk',title:'Exposição elevada em cartões',detail:'O saldo pendente dos cartões é superior à receita mensal registrada.',section:'cards'});
 if(opportunities.rows.length && weightedPipeline>0)insights.push({type:'opportunity',title:'Pipeline comercial ponderado',detail:'Projeção baseada no valor e na probabilidade de cada oportunidade.',section:'business'});
 if(!tx.rows.length)insights.push({type:'info',title:'Comece a construir seu histórico',detail:'Cadastre contas e importe movimentações para ativar análises comparativas.',section:'transactions'});
 return {
 period,accounts:accounts.rows,cards:cards.rows,budgets:budgetMap,goals:goals.rows,debts:debts.rows,holdings:holdings.rows,positions,
 invoices:invoices.rows,opportunities:opportunities.rows,subscriptions:subs.rows,categories:categories.rows,
 upcoming:upcoming.rows,activity:activity.rows.map(r=>({...r,description:unseal(w,r.description_enc),description_enc:undefined})),
 monthly,byCategory:categoryList,insights,summary:{cash,invested,tangible,liabilities,cardLiability,receivables,payables,
  netWorth:cash+invested+tangible-liabilities-cardLiability+receivables-payables,
  monthlyIncome,monthlyExpense,monthlyResult:monthlyIncome-monthlyExpense,
  savingsRate:monthlyIncome?Math.round((monthlyIncome-monthlyExpense)/monthlyIncome*10000)/100:0,
  weightedPipeline, activeSubscriptions:subs.rows.filter(s=>s.status==='active').length,openInvoices:invoices.rows.filter(i=>i.status==='open').length}
 };
}
