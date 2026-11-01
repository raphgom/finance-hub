import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../scripts/demo.ps1',import.meta.url),'utf8');
test('Docker Desktop: no native command output capture that breaks Windows console handles',()=>{
 const active=src.split('\n').filter(x=>!x.trimStart().startsWith('#')).join('\n');
 assert.doesNotMatch(active,/docker\s+(?:info|volume|compose)[^\n]*\|\s*(?:Out-Host|Out-Null|Out-String|Where-Object|Select-Object)/i);
 assert.doesNotMatch(active,/docker\s+compose[^\n]*2>&1\s*\|/i);
});
test('Docker Compose uses documented plain progress and disables ANSI',()=>{
 assert.match(src,/COMPOSE_PROGRESS='plain'/);
 assert.match(src,/COMPOSE_ANSI='never'/);
 assert.match(src,/docker compose --ansi never --progress plain @composeArgs up --build -d/);
});
test('demo reset scoped to the demo project and mandatory confirmation when explicit',()=>{
 assert.match(src,/\$project='financehub-demo'/);
 assert.match(src,/\$composeArgs=@\('-p',\$project/);
 assert.match(src,/if\(\$ResetDemo -and !\$ConfirmReset\)/);
 assert.match(src,/docker compose --ansi never --progress plain @composeArgs down --volumes --remove-orphans/);
});
test('demo verifies healthy analytics plus login before success',()=>{
 assert.match(src,/\$h.analytics -eq 'ready'/);
 assert.match(src,/Confirm-DemoLogin/);
 assert.match(src,/DEMO ATIVA E LOGIN VALIDADO/);
});
