/** Política local simplificada. Senhas de 8–14 caracteres NÃO atendem ao mínimo NIST para autenticação de fator único. */
export const MIN_PASSWORD_LENGTH=8;
const weak=new Set(['12345678','123456789','password','password1','1234567890','qwerty123','abcdefgh','admin123','senha123','11111111','00000000','financehub']);
export function passwordError(value:string):string|null{
 if([...value].length<MIN_PASSWORD_LENGTH) return 'Use pelo menos 8 caracteres na senha.';
 if(Buffer.byteLength(value,'utf8')>72) return 'Esta versão aceita até 72 bytes UTF-8 de senha para evitar truncamento no bcrypt.';
 if(weak.has(value.trim().toLowerCase()))return 'Esta senha é muito comum. Escolha outra.';
 return null;
}
