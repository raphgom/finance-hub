import {createCipheriv,createDecipheriv,hkdfSync,randomBytes} from 'node:crypto';
const keyFor=(master:Buffer,workspace:string)=>Buffer.from(hkdfSync('sha256',master,Buffer.from(workspace),'finance-hub-field-encryption-v1',32));
export function encryptField(master:Buffer,workspace:string,content:string|null|undefined):string|null{
 if(!content)return null;
 const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',keyFor(master,workspace),iv);
 const ct=Buffer.concat([c.update(content,'utf8'),c.final()]);
 return `v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${ct.toString('base64')}`;
}
export function decryptField(master:Buffer,workspace:string,token:string):string{
 const parts=token.split(':');if(parts.length!==4||parts[0]!=='v1')throw Error('Invalid encrypted data');
 const iv=Buffer.from(parts[1],'base64'),tag=Buffer.from(parts[2],'base64'),encrypted=Buffer.from(parts[3],'base64');
 if(iv.length!==12||tag.length!==16)throw Error('Invalid cipher metadata');
 const d=createDecipheriv('aes-256-gcm',keyFor(master,workspace),iv);d.setAuthTag(tag);
 return Buffer.concat([d.update(encrypted),d.final()]).toString('utf8');
}
