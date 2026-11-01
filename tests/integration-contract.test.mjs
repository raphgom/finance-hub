import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const src = path => readFileSync(new URL(path,root),'utf8');
test('regressao 42601: agregacoes SQL nao utilizam alias month sem aspas',()=>{
 const analytics=src('src/lib/analytics.ts');
 assert.equal((analytics.match(/AS "month"/g)||[]).length,4);
 assert.doesNotMatch(analytics,/\) month[,\s]/);
 for (const table of ['transactions','card_purchases','trades','debt_payments']) assert.ok(analytics.includes(table));
});
test('health: readiness executa overview, nao apenas SELECT 1',()=>{
 const route=src('src/app/api/[...route]/route.ts');
 assert.ok(route.includes("await overview('00000000-0000-0000-0000-000000000000')"));
 assert.match(route,/analytics:'ready'/);
});
test('frontend: falha no overview nao bloqueia consulta de registros',()=>{
 const ui=src('src/components/FinanceApp.tsx');
 assert.match(ui,/Promise\.allSettled\(\[loadOverview,loadRows\]\)/);
 assert.match(ui,/role="alert"/);
 assert.match(ui,/Tentar novamente/);
});
test('demo isolada: projeto exclusivo e porta separada',()=>{
 const demo=src('scripts/demo.ps1'), compose=src('compose.demo.yaml');
 assert.ok(demo.includes("$project='financehub-demo'"));
 assert.match(demo,/\$Port=3100/);
 assert.match(demo,/\-ResetDemo/);
 assert.match(compose,/FH_DEMO_MODE: isolated-demo/);
 assert.match(compose,/demo-seed:/);
 assert.match(compose,/service_completed_successfully/);
});
test('seed: somente dados ficticios, protege banco existente e cifra campos',()=>{
 const demo=src('scripts/seed-demo.mjs');
 assert.match(demo,/Recusando seed fora do ambiente/);
 assert.match(demo,/Recusando seed para proteger dados reais/);
 assert.match(demo,/aes-256-gcm/);
 assert.match(demo,/await db\.query\('ROLLBACK'\)/);
 assert.match(demo,/seedPersonal,seedFamily,seedBusiness/);
 assert.match(demo,/demo@financehub\.local/);
});
test('teste demo: cobre dashboard, operacao de credito, ledger, investimentos e empresa',()=>{
 const check=src('scripts/demo-verify.ps1');
 for (const path of ['overview','card/purchase','transaction/void','price','invoice/settle','card/void']) assert.ok(check.includes(path),path);
});

test('demo e producao nao disputam o mesmo cookie localhost',()=>{
 const cfg=src('compose.demo.yaml'),api=src('src/app/api/[...route]/route.ts'),server=src('src/lib/server.ts');
 assert.match(cfg,/FH_SESSION_COOKIE: fh_session_demo/);
 assert.match(server,/get\(sessionCookieName\(\)\)/);
 assert.match(api,/set\(sessionCookieName\(\),token/);
 assert.match(api,/jar.delete\(sessionCookieName\(\)\)/);
});
