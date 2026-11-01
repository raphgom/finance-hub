export function exactCents(v:unknown):number{
 const s=String(v??'').trim().replace(',','.');if(!/^-?\d{1,13}(?:\.\d{1,2})?$/.test(s))throw Error('Use valor em reais com até duas casas decimais');
 const sign=s.startsWith('-')?-1:1,clean=s.replace('-',''),[whole,part='']=clean.split('.');
 const result=(Number(whole)*100+Number((part+'00').slice(0,2)))*sign;
 if(!Number.isSafeInteger(result))throw Error('Valor monetário excede precisão suportada');return result;
}
