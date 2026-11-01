import {test} from 'node:test';
import assert from 'node:assert/strict';
import {splitCents,cardFirstDue,nextDue,portfolio,monthNext} from '../src/lib/finance.ts';
test('parcelas conservam o total, inclusive centavos residuais',()=>{assert.deepEqual(splitCents(10001,3),[3334,3334,3333]);assert.equal(splitCents(10001,3).reduce((a,b)=>a+b),10001);});
test('fechamento da fatura empurra compras realizadas após o corte',()=>{assert.equal(cardFirstDue('2026-10-12',10,20),'2026-11-20');assert.equal(cardFirstDue('2026-10-05',10,20),'2026-10-20');});
test('prazo próximo não transborda por meses curtos',()=>{assert.equal(nextDue('2026-01-28',1),'2026-02-28');assert.equal(monthNext('2026-12-02',1),'2027-01');});
test('posição: custo médio e ganho realizado após venda',()=>{
 const rows=[{asset_id:'X',kind:'buy',quantity:10,unit_price_cents:1000,total_cents:10000,fees_cents:0,traded_on:'2026-01-01'},
 {asset_id:'X',kind:'sell',quantity:2,unit_price_cents:1500,total_cents:3000,fees_cents:0,traded_on:'2026-01-10'}];
 const [r]=portfolio(rows,{X:1500});assert.equal(r.quantity,8);assert.equal(r.cost,8000);assert.equal(r.market,12000);assert.equal(r.unrealized,4000);assert.equal(r.realized,1000);
});
import {encryptField,decryptField} from '../src/lib/crypto.ts';
import {exactCents} from '../src/lib/money.ts';
import {randomBytes} from 'node:crypto';
test('AES-GCM isola workspaces e detecta adulteração',()=>{
 const master=randomBytes(48),w='primeiro-espaco',token=encryptField(master,w,'Favorecido particular');
 assert.ok(token?.startsWith('v1:'));assert.equal(decryptField(master,w,token),'Favorecido particular');
 assert.throws(()=>decryptField(master,'outro-espaco',token));
 const tampered=token.slice(0,-3)+'abc';assert.throws(()=>decryptField(master,w,tampered));
});
test('conversão monetária decimal exata',()=>{
 assert.equal(exactCents('1.01'),101);assert.equal(exactCents('12,99'),1299);
 assert.equal(exactCents('-80.23'),-8023);assert.throws(()=>exactCents('1.005'));
});
