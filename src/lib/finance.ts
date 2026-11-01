export const categoriesDefault:[string,string,string][]=[
 ['Salário','income','#4BBFA8'],['Receitas extras','income','#6DC8BA'],['Vendas e serviços','income','#61B2E6'],['Dividendos e rendimentos','income','#4D9FCE'],
 ['Moradia','expense','#9E8CF4'],['Alimentação','expense','#F6B96A'],['Transporte','expense','#E68C8A'],['Saúde','expense','#DC91C4'],
 ['Educação','expense','#72BAE3'],['Lazer','expense','#B09BF4'],['Assinaturas','expense','#7DA4E8'],['Impostos','expense','#EF9B84'],
 ['Serviços e operações','expense','#E5BC74'],['Outros','expense','#93A0B5']
];
export function monthNext(value:string,delta=1){
 const d=new Date(value+'T12:00:00Z');d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+delta);return d.toISOString().slice(0,7);
}
export function nextDue(date:string,monthDelta:number){
 const day=Number(date.slice(8)),s=monthNext(date,monthDelta);const [y,m]=s.split('-').map(Number);
 const end=new Date(Date.UTC(y,m,0)).getUTCDate();return `${s}-${String(Math.min(day,end)).padStart(2,'0')}`;
}
export function cardFirstDue(purchased:string,closing:number,due:number){
 const day=Number(purchased.slice(8));const closingMonth=day>closing?1:0;
 const cycleMonth=monthNext(purchased,closingMonth);const dueMonth=due<=closing?monthNext(cycleMonth,1):cycleMonth;
 return `${dueMonth}-${String(due).padStart(2,'0')}`;
}
export function splitCents(total:number,count:number){
 if(count<1||count>120||!Number.isInteger(count))throw Error('Parcelas inválidas');
 const base=Math.floor(total/count),rem=total%count;
 return Array.from({length:count},(_,i)=>base+(i<rem?1:0));
}
export function portfolio(trades:{asset_id:string,kind:string,quantity:string|number,unit_price_cents:string|number,total_cents:string|number,fees_cents:string|number,traded_on:string}[],prices:Record<string,number>){
 const holdings:Record<string,{quantity:number,cost:number,dividends:number,fees:number,realized:number}>= {};
 for(const t of trades){const h=holdings[t.asset_id]??={quantity:0,cost:0,dividends:0,fees:0,realized:0};
 const q=Number(t.quantity),value=Number(t.total_cents),fee=Number(t.fees_cents);
 if(t.kind==='buy'){h.quantity+=q;h.cost+=value+fee;h.fees+=fee;}
 else if(t.kind==='sell'){const avg=h.quantity? h.cost/h.quantity:0;const removed=avg*q;h.quantity=Math.max(0,h.quantity-q);h.cost=Math.max(0,h.cost-removed);h.realized+=value-removed-fee;h.fees+=fee;}
 else if(t.kind==='dividend')h.dividends+=value;
 else if(t.kind==='fee'){h.fees+=value;h.realized-=value;}
 }
 return Object.entries(holdings).map(([asset_id,h])=>({asset_id,...h,market:Math.round(h.quantity*(prices[asset_id]??0)),unrealized:Math.round(h.quantity*(prices[asset_id]??0)-h.cost)}));
}
