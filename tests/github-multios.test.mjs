import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const src=name=>readFileSync(new URL(name,root),'utf8');
test('deploy Bash: main and demo stay in separate projects and ports',()=>{
 const sh=src('scripts/financehub.sh');
 assert.match(sh,/DEMO_PROJECT=financehub-demo/);
 assert.match(sh,/PORT="\$\{APP_PORT:-3000\}"/);
 assert.match(sh,/DEMO_PORT="\$\{DEMO_PORT:-3100\}"/);
 assert.match(sh,/down --volumes --remove-orphans/);
 assert.match(sh,/reset-demo --confirm/);
 assert.match(sh,/reset --confirm/);
 assert.match(sh,/secrets\/demo\/demo_password/);
});
test('multios secret generation CSPRNG only, preserving local secrets',()=>{
 const sh=src('scripts/financehub.sh');
 assert.match(sh,/\[ -f "\$target" \] && return 1/);
 assert.match(sh,/openssl rand -base64/);
 assert.match(sh,/secrets\.token_urlsafe/);
 assert.match(sh,/randomBytes/);
 assert.match(sh,/umask 077/);
});
test('Git ignore covers private data and keeps curated demo images',()=>{
 const i=src('.gitignore');
 for(const p of ['secrets/','backups/','.env','*.db','*.dump','*.pem'])assert.ok(i.includes(p),p);
 for(const p of ['docs/screenshots/demo-investimentos-light.png','docs/screenshots/demo-alocacao-portfolio.png','docs/screenshots/preview-investimentos-dark.png'])assert.ok(existsSync(new URL(p,root)),p);
});
test('GitHub publisher is self-contained: Git on Windows and Git + curl in Bash',()=>{
 const ps=src('scripts/publish-github.ps1');
 const sh=src('scripts/publish-github.sh');
 assert.match(ps,/AssertSafeStage/);
 assert.match(ps,/Invoke-RestMethod/);
 assert.match(ps,/UseTokenOnly/);
 assert.match(ps,/SkipGallery/);
 assert.match(ps,/git credential fill/);
 assert.match(ps,/credential\.helper=/);
 assert.match(sh,/git add -A/);
 assert.match(sh,/api POST \/user\/repos/);
 assert.match(sh,/SKIP_GALLERY/);
 assert.doesNotMatch(sh,/command -v (?:gh|node)/);
 assert.doesNotMatch(ps,/Get-Command (?:gh|node)/);
});
test('CI has OS matrix, Docker demo, galleries, multiarch publish',()=>{
 const ci=src('.github/workflows/ci.yml');
 assert.match(ci,/ubuntu-latest, macos-latest, windows-latest/);
 assert.match(ci,/scripts\/financehub\.sh demo/);
 assert.match(ci,/verify-demo/);
 const gallery=src('.github/workflows/demo-gallery.yml');
 assert.match(gallery,/capture-demo\.mjs/);
 const images=src('.github/workflows/release-images.yml');
 assert.match(images,/linux\/amd64,linux\/arm64/);
});
