#!/usr/bin/env node
/** Captura telas REAIS da demo local, sem mock e sem acesso à instalação principal. */
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const pass=resolve(root,'secrets/demo/demo_password');
const port=Number(process.env.DEMO_PORT||3100);
if(!Number.isInteger(port)||port<1024||port>65535||port===3000){console.error('Use exclusivamente a porta da demonstração (padrão 3100).');process.exit(1);}
let browser;
try{
 const {chromium}=await import('playwright');
 const password=readFileSync(pass,'utf8').trim();
 const base=`http://localhost:${port}`;
 const h=await fetch(`${base}/api/health`,{signal:AbortSignal.timeout(10000)});
 const status=await h.json();
 if(status.status!=='ok'||status.analytics!=='ready')throw Error('A demo não passou nos testes analíticos.');
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1580,height:950},deviceScaleFactor:1,locale:'pt-BR',colorScheme:'light'});
 const page=await context.newPage();
 await page.goto(base,{waitUntil:'networkidle'});
 await page.getByLabel('E-mail').fill('demo@financehub.local');
 await page.getByLabel('Senha').fill(password);
 await page.getByRole('button',{name:/Acessar o Finance Hub/}).click();
 await page.locator('.sidebar-nav').waitFor({timeout:20000});
 const workspaces=await page.locator('.workspace-select option').allTextContents();
 if(workspaces.length<3)throw Error('A demo precisa conter os três workspaces fictícios.');
 const dest=resolve(root,'docs/screenshots/generated');mkdirSync(dest,{recursive:true});
 const reports=['Executivo','Fluxo de caixa','Despesas','Orçamentos','Crédito','Investimentos','Patrimônio','Passivos','Empresa','Projeções','Oportunidades','Insights'];
 const slug=(s)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
 const check=async()=>{
  await page.locator('.loading-inline').first().waitFor({state:'hidden',timeout:25000});
  await page.waitForTimeout(500);
  if(await page.locator('.notice[role=alert]').count())throw Error(`Falha no dashboard: ${await page.locator('.notice[role=alert]').first().innerText()}`);
 };
 const screenshot=async(name)=>{await check();await page.screenshot({path:resolve(dest,`${name}.png`),fullPage:true,animations:'disabled'});console.log(`Gerado: docs/screenshots/generated/${name}.png`);};
 for(const theme of ['light','dark']){
  const dark=await page.locator('.app-shell').evaluate(e=>e.classList.contains('dark'));
  if(dark!==(theme==='dark'))await page.getByTitle('Alternar aparência').click();
  await page.locator('.sidebar-nav .nav-item').filter({hasText:'Visão geral'}).click();
  await screenshot(`demo-visao-geral-${theme}`);
  await page.locator('.sidebar-nav .nav-item').filter({hasText:'Dashboards & BI'}).click();
  await page.locator('.report-tabs').waitFor();
  for(const title of reports){
   await page.locator('.report-tabs button').filter({hasText:title}).click();
   await screenshot(`demo-bi-${slug(title)}-${theme}`);
  }
  const select=page.locator('.workspace-select');
  const options=await select.locator('option').all();
  for(let i=0;i<options.length;i++){
   const label=await options[i].textContent();
   if(/familiar|empresa|empresarial|family|business/i.test(label||'')){
    await select.selectOption({index:i});
    await page.locator('.report-tabs button').filter({hasText:'Executivo'}).click();
    await screenshot(`demo-bi-${slug(label||'workspace')}-executivo-${theme}`);
   }
  }
  await select.selectOption({index:0});
 }
 console.log(`Capturas reais concluídas. Use somente o dataset da demo; revise as imagens antes de publicar.`);
}catch(e){console.error(`Captura abortada: ${e.message}`);process.exitCode=1;}finally{if(browser)await browser.close();}
