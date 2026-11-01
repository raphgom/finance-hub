import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {splitCents,cardFirstDue,nextDue} from '../src/lib/finance.ts';
import {exactCents} from '../src/lib/money.ts';
import {encryptField,decryptField} from '../src/lib/crypto.ts';
import {randomBytes} from 'node:crypto';
const root=new URL('../',import.meta.url);
const file=x=>readFileSync(new URL(x,root),'utf8');
test('parcelamentos: 1 a 120 parcelas conservam centavos sem resíduos perdidos',()=>{
 for(let count=1;count<=120;count++){
  const total=100000+count;
  const parts=splitCents(total,count);
  assert.equal(parts.length,count);
  assert.ok(parts.every(x=>Number.isSafeInteger(x)&&x>0));
  assert.equal(parts.reduce((a,b)=>a+b,0),total);
  assert.ok(Math.max(...parts)-Math.min(...parts)<=1);
 }
});
test('faturas: atravessam dezembro, janeiro, fevereiro e anos bissextos',()=>{
 assert.equal(cardFirstDue('2026-12-21',20,5),'2027-02-05');
 assert.equal(nextDue('2028-01-31',1),'2028-02-29');
 assert.equal(nextDue('2027-01-31',1),'2027-02-28');
});
test('conversões financeiras: rejeitam frações de centavo e valores não numéricos',()=>{
 for(const value of ['1.001','NaN','Infinity','1e3','','123.4567'])assert.throws(()=>exactCents(value));
 assert.equal(exactCents('999999.99'),99999999);
});
test('segurança: cifra autenticada não revela campo e invalida adulteração',()=>{
 const secret=randomBytes(48),plain='Descrição privada: '+ 'segredo '.repeat(100);
 const enc=encryptField(secret,'workspace-1',plain);
 assert.ok(!enc.includes('Descrição privada'));
 assert.equal(decryptField(secret,'workspace-1',enc),plain);
 assert.throws(()=>decryptField(randomBytes(48),'workspace-1',enc));
 assert.throws(()=>decryptField(secret,'workspace-2',enc));
});
test('regressão build: componente modal não usa variável mode do formulário de login',()=>{
 const src=file('src/components/FinanceApp.tsx');
 const modal=src.slice(src.indexOf('function DataModal('));
 assert.ok(modal.startsWith('function DataModal('));
 assert.ok(!modal.includes("mode==='setup'"));
});
test('regressão middleware: não usa Buffer no ambiente Edge',()=>{
 const middleware=file('src/middleware.ts');
 assert.ok(!middleware.includes('Buffer.'));
 assert.ok(middleware.includes('crypto.randomUUID()'));
});
test('privilégio mínimo: aplicação não carrega a senha administrativa do banco',()=>{
 const compose=file('compose.yaml');
 const web=compose.split('\n  web:')[1].split('\nvolumes:')[0];
 const worker=compose.split('\n  worker:')[1].split('\n  backup:')[0];
 assert.ok(web.includes('financehub_app'));
 assert.ok(worker.includes('financehub_app'));
 assert.ok(!web.includes('db_password'));
 assert.ok(!worker.includes('db_password'));
});
