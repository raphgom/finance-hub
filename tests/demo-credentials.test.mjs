import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=(name)=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
test('demo substitui todos os secrets operacionais por arquivos isolados',()=>{
 const conf=src('compose.demo.yaml');
 for(const key of ['db_password','app_password','master_key','setup_code','backup_key','demo_password']){
   assert.match(conf,new RegExp(`  ${key}:\\n    file: \.\/secrets\/demo\/${key}`));
 }
});
test('demo nunca executa reset no projeto operacional',()=>{
 const s=src('scripts/demo.ps1');
 assert.match(s,/\$project='financehub-demo'/);
 assert.match(s,/\$composeArgs=@\('-p',\$project/);
 assert.match(s,/docker compose --ansi never --progress plain @composeArgs down --volumes/);
 assert.doesNotMatch(s,/docker compose down --volumes/);
 assert.doesNotMatch(s,/\.\\scripts\\init\.ps1/);
});
test('demo gera todas as credenciais proprias com CSPRNG e suporta migracao legacy',()=>{
 const s=src('scripts/demo.ps1');
 assert.match(s,/RandomNumberGenerator/);
 assert.match(s,/hadDbSecret/);
 assert.match(s,/legacyVolumeName/);
 assert.match(s,/28P01/);
 assert.match(s,/\$recoveryUsed=\$true/);
 assert.match(s,/Confirm-DemoLogin/);
 assert.match(s,/api\/health/);
});
test('verificacao demo utiliza a credencial propria, nunca a operacional',()=>{
 const check=src('scripts/demo-verify.ps1');
 assert.match(check,/secrets\/demo\/demo_password/);
 assert.doesNotMatch(check,/['"]secrets\/demo_password/);
});
test('fluxo operacional mantem arquivos independentes e nenhuma mudanca de persistencia',()=>{
 const prod=src('compose.yaml');
 assert.match(prod,/file: \.\/secrets\/db_password/);
 assert.match(prod,/db_data:\/var\/lib\/postgresql\/data/);
 assert.match(prod,/127\.0\.0\.1:/);
});
