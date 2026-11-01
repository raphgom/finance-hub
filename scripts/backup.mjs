import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {readFileSync,createWriteStream,createReadStream,mkdirSync,mkdtempSync,rmSync,statSync,openSync,closeSync,readSync} from 'node:fs';
import {execFileSync,spawn} from 'node:child_process';
import {pipeline} from 'node:stream/promises';
import {join,basename} from 'node:path';
const secret=k=>readFileSync(`/run/secrets/${k}`,'utf8').trim();
const key=createHash('sha256').update(secret('backup_key')).digest();
const args=process.argv.slice(2),action=args[0]||'backup';
const env={...process.env,PGPASSWORD:secret('db_password'),PGHOST:process.env.PGHOST||'db',PGUSER:'financehub',PGDATABASE:'financehub'};
const dir='/backups';mkdirSync(dir,{recursive:true});
const magic=Buffer.from('FHBK1');
const wipe=(path)=>{try{rmSync(path,{force:true,recursive:true});}catch{}};
async function encryptBackup(){
 const path=join(dir,`financehub-${new Date().toISOString().replace(/[:.]/g,'-')}.fhbak`),iv=randomBytes(12);
 const cipher=createCipheriv('aes-256-gcm',key,iv),writer=createWriteStream(path,{flags:'wx',mode:0o600});
 writer.write(Buffer.concat([magic,iv]));
 const child=spawn('pg_dump',['--format=custom','--no-owner','--no-acl','financehub'],{env,stdio:['ignore','pipe','pipe']});
 let stderr='';child.stderr.on('data',b=>stderr+=b.toString().slice(0,800));
 const ended=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
 try{await pipeline(child.stdout,cipher,writer,{end:false});
  const code=await ended;if(code!==0)throw Error('pg_dump: '+stderr);
  await new Promise((resolve,reject)=>{writer.end(cipher.getAuthTag(),(err)=>err?reject(err):resolve());});
  console.log('Backup AES-256-GCM criado:',basename(path));
 }catch(e){writer.destroy();wipe(path);throw e;}
}
async function restoreBackup(name){
 if(args[2]!=='--confirm=RESTORE')throw Error('Restauração destrutiva exige --confirm=RESTORE');
 if(!/^financehub-[\w-]+\.fhbak$/.test(name))throw Error('Nome de arquivo inválido');
 const path=join(dir,name),stats=statSync(path);if(stats.size<33)throw Error('Arquivo inválido');
 const fd=openSync(path,'r');
 let iv,tag;
 try{
  const header=Buffer.alloc(17);readSync(fd,header,0,17,0);
  if(!header.subarray(0,5).equals(magic))throw Error('Formato de backup inválido');
  iv=header.subarray(5,17);
  tag=Buffer.alloc(16);readSync(fd,tag,0,16,stats.size-16);
 }finally{closeSync(fd);}
 const decipher=createDecipheriv('aes-256-gcm',key,iv);decipher.setAuthTag(tag);
 const dirTmp=mkdtempSync('/tmp/financehub-'),temp=join(dirTmp,'restore.dump');
 try{
  // Stream restore supports multi-GB backups without loading clear data into RAM.
  await pipeline(createReadStream(path,{start:17,end:stats.size-17}),decipher,createWriteStream(temp,{flags:'wx',mode:0o600}));
  execFileSync('pg_restore',['--clean','--if-exists','--no-owner','--no-acl','-U','financehub','-d','financehub',temp],{env,stdio:'inherit',timeout:600000});
  console.log('Restauração finalizada. Reinicie os serviços para limpar as sessões em memória.');
 }finally{wipe(dirTmp);}
}
try{if(action==='backup')await encryptBackup();else if(action==='restore'&&args[1])await restoreBackup(args[1]);else throw Error('Uso: backup | restore FILENAME --confirm=RESTORE');}
catch(e){console.error('ERRO:',e.message);process.exitCode=1;}
