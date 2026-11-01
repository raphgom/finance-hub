import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../src/app/style.css',import.meta.url),'utf8');
function block(selector){const start=css.indexOf(selector+'{');assert.ok(start>=0,`missing ${selector}`);const end=css.indexOf('}',start);return css.slice(start,end)}
function getVar(selector,name){const text=block(selector);const re=new RegExp('(?:^|;)'+name.replaceAll('-','\\-')+':(#[0-9a-fA-F]{6})(?:;|\\})');return text.match(re)?.[1]}
function lum(hex){const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722}
function ratio(a,b){const [l,h]=[lum(a),lum(b)].sort((x,y)=>x-y);return(h+.05)/(l+.05)}
test('primary dark mode content matches WCAG AA text contrast against both surfaces',()=>{
 const token=k=>getVar('.app-shell.dark',k);const surfaces=[token('--bg'),token('--surface')];
 for(const background of surfaces)for(const foreground of ['--text','--muted','--primary']){
  const r=ratio(token(foreground),background);assert.ok(r>=4.5,`${foreground} against ${background}: ${r.toFixed(2)}:1`);
 }
});
test('light mode secondary text passes WCAG AA against canvas and cards',()=>{
 const txt=getVar('.app-shell','--muted');assert.ok(ratio(txt,getVar('.app-shell','--bg'))>=4.5);
 assert.ok(ratio(txt,'#ffffff')>=4.5);
});
