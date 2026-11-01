import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../src/app/style.css',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/components/FinanceApp.tsx',import.meta.url),'utf8');
function block(selector){const safe=selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return css.match(new RegExp(safe+'\\{([^}]*)\\}'))?.[1]||''}
test('shell sets computed text color, instead of inheriting old light root color',()=>{assert.match(block('.app-shell'),/color:var\(--text\)/);});
test('dark scheme includes a readable text token, form color scheme and chart grid token',()=>{const theme=block('.app-shell.dark');assert.match(theme,/color-scheme:dark/);assert.match(theme,/--text:#f5f5ff/);assert.match(theme,/--chart-grid:/);});
test('chart axes and grid use semantic tokens',()=>{assert.match(app,/stroke="var\(--chart-grid\)"/);assert.match(app,/fill:"var\(--muted\)"/);assert.doesNotMatch(app,/stroke="#e9ecf5"/);});
test('chart legends and panels have explicit dark mode styles',()=>{assert.match(css,/\.app-shell\.dark \.recharts-legend-item-text/);assert.match(css,/\.app-shell\.dark \.metric-icon/);assert.match(css,/\.app-shell\.dark \.notice\.warning/);});
test('toggle preference persists and is restored after hydration',()=>{assert.match(app,/localStorage.getItem\('finance-hub-theme'\)/);assert.match(app,/localStorage.setItem\('finance-hub-theme'/);});
test('investment donut uses correct center label',()=>{assert.match(app,/centerLabel="Carteira investida"/);assert.match(app,/centerLabel="Ativos e bens"/);});
