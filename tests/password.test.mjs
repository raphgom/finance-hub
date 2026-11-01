import test from 'node:test';
import assert from 'node:assert/strict';
import {passwordError,MIN_PASSWORD_LENGTH} from '../src/lib/password.ts';
test('senha local: permite oito caracteres, bloqueia sete',()=>{
 assert.equal(MIN_PASSWORD_LENGTH,8);
 assert.equal(passwordError('abcd1234!'),null);
 assert.match(passwordError('1234567'),/8 caracteres/);
});
test('senhas comuns e truncamento bcrypt são bloqueados',()=>{
 assert.match(passwordError('password1'),/comum/);
 assert.match(passwordError('x'.repeat(73)),/72 bytes/);
});
test('frases-senha extensas e Unicode aceitável',()=>{
 assert.equal(passwordError('EstaFraseSenhaTem21!'),null);
 assert.equal(passwordError('UmPassphrase!é2026'),null);
});
