import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,existsSync } from 'node:fs';
const root=new URL('../',import.meta.url);
const src=name=>readFileSync(new URL(name,root),'utf8');
test('regressão Docker: runner sempre recebe diretório public válido',()=>{
 const dockerfile=src('Dockerfile');
 assert.match(dockerfile,/COPY --from=builder[^\n]*\/app\/public \.\/public/);
 assert.match(dockerfile,/RUN mkdir -p \/app\/public && npm run build/);
 assert.ok(existsSync(new URL('public/.gitkeep',root)),'Public deve estar presente no ZIP, mesmo sem assets');
});
test('instalação limpa depende apenas de segredos geráveis e migração',()=>{
 const compose=src('compose.yaml');
 const init=src('scripts/init.ps1');
 const migrate=src('scripts/migrate.mjs');
 for(const name of ['db_password','app_password','master_key','setup_code','backup_key']){
   assert.match(compose,new RegExp(`file: \\.\\/secrets\\/${name}`));
   assert.ok(init.includes(`'${name}'`),`init.ps1 não gera ${name}`);
 }
 assert.match(compose,/db_data:\/var\/lib\/postgresql\/data/);
 assert.match(compose,/migrate:[\s\S]*?depends_on:[\s\S]*?service_healthy/);
 assert.match(compose,/web:[\s\S]*?depends_on:[\s\S]*?service_completed_successfully/);
 assert.match(migrate,/readFileSync\(new URL\('\.\.\/db\/schema\.sql'/);
 assert.match(migrate,/CREATE ROLE financehub_app/);
});
test('instalador suporta reset explícito e verifica a API',()=>{
 const start=src('scripts/start.ps1');
 for(const x of ['-ResetData','--volumes','-ConfirmReset','RotateSetupCode','docker compose up --build -d', '/api/health','/api/setup-status'])
   assert.ok(start.includes(x),`O instalador não contém o passo ${x}`);
});
test('segredos e backups fora do contexto de imagem Docker',()=>{
 const ignore=src('.dockerignore');
 for (const p of ['secrets','backups','.env*'])assert.ok(ignore.split(/\r?\n/).includes(p),p);
});
