#!/usr/bin/env node
/** Finance Hub pre-push: independent from npm packages; checks the staged snapshot. */
import {execFileSync} from 'node:child_process';
import {extname} from 'node:path';
const cwd=new URL('../',import.meta.url);
const git=(args,opts={})=>execFileSync('git',args,{cwd,encoding:opts.encoding||'utf8',maxBuffer:50_000_000,stdio:['ignore','pipe','pipe']});
let files;
try{files=git(['ls-files','--cached','-z']).split('\0').filter(Boolean);}catch{
 console.error('Erro: execute dentro de um repositório Git inicializado.'); process.exit(2);
}
const danger=[
 /(^|\/)(secrets?|backups?|private|credentials?)(\/|$)/i,
 /(^|\/)\.env(?:\..*)?$/i,
 /(^|\/)(?:id_rsa|id_ed25519|\.npmrc|\.pypirc|\.pgpass|\.netrc)$/i,
 /(?:\.pem|\.p12|\.pfx|\.key|\.kdbx|\.sqlite3?|\.db|\.dump|\.bak|\.backup|\.tar(?:\.gz)?|\.zip)$/i,
 /(^|\/)(?:auth|session|tokens?)\.json$/i,
];
const keyPatterns=[
 /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
 /\bghp_[A-Za-z0-9]{30,}\b/,
 /\bgho_[A-Za-z0-9]{30,}\b/,
 /\bghu_[A-Za-z0-9]{30,}\b/,
 /\bgithub_pat_[A-Za-z0-9_]{30,}\b/,
 /\bAKIA[0-9A-Z]{16}\b/,
 /\bsk-proj-[A-Za-z0-9_-]{20,}\b/,
 /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
];
const errors=[];
for(const file of files){
 if(danger.some(p=>p.test(file))){errors.push(`Arquivo sensível incluído no stage: ${file}`);continue;}
 const ex=extname(file).toLowerCase();
 if(['.png','.jpg','.jpeg','.webp','.gif','.ico','.woff','.woff2','.pdf'].includes(ex))continue;
 let raw;
 try{raw=git(['show',`:${file}`],{encoding:'buffer'});}catch{continue;}
 if(Buffer.isBuffer(raw)&&raw.includes(0))continue;
 const s=Buffer.isBuffer(raw)?raw.toString('utf8'):raw;
 for(const patt of keyPatterns){
  if(patt.test(s)){errors.push(`Possível segredo no arquivo: ${file} (${patt.source.slice(0,35)}...)`);break;}
 }
}
if(errors.length){
 console.error('\nBLOQUEADO: verificação de segurança do Git falhou.');
 for(const e of errors)console.error(' - '+e);
 console.error('Revise o stage (git status) e remova dados sensíveis antes de publicar.');
 process.exit(1);
}
console.log(`Aprovado: ${files.length} arquivos rastreados, sem padrões de segredos conhecidos. Isso NÃO substitui uma auditoria de segurança.`);
