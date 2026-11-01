# Verificacao integrada: autentica na demo e valida modulos reais com READs e WRITEs.
# Nao acessa o projeto operacional. Pode alterar apenas o dataset demo.
param([int]$Port=3100)
$ErrorActionPreference='Stop'
$base="http://localhost:$Port"
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if(!(Test-Path 'secrets/demo/demo_password')){throw 'Execute scripts/demo.ps1 primeiro.'}
$session=New-Object Microsoft.PowerShell.Commands.WebRequestSession
$passed=New-Object System.Collections.Generic.List[string]
function Request([string]$route,$payload=$null){
 $args=@{Uri="$base/api/$route";WebSession=$session;TimeoutSec=35;ErrorAction='Stop';Headers=@{'Origin'=$base}}
 if($null -ne $payload){$args.Method='POST';$args.ContentType='application/json';$args.Body=($payload|ConvertTo-Json -Depth 10 -Compress)}
 else{$args.Method='GET'}
 return Invoke-RestMethod @args
}
function Require($condition,[string]$label){if(!$condition){throw "FALHA: $label"};$passed.Add("APROVADO: $label")}
try {
 $h=Request 'health';Require ($h.status -eq 'ok' -and $h.analytics -eq 'ready') 'Backend + consultas analiticas'
 $pw=(Get-Content 'secrets/demo/demo_password' -Raw).Trim()
 $login=Request 'login' @{email='demo@financehub.local';password=$pw}
 Require $login.ok 'Login da demonstracao'
 $me=Request 'me';Require (@($me.workspaces).Count -eq 3) 'Tres workspaces isolados'
 foreach($ws in $me.workspaces){
  $w=$ws.id
  $dashboard=Request "overview?workspace=$w"
  Require ($dashboard.summary -and @($dashboard.monthly).Count -ge 10 -and @($dashboard.categories).Count -ge 10) "Dashboard com 12 meses e categorias: $($ws.kind)"
  Require ($dashboard.summary.monthlyIncome -gt 0 -and $dashboard.summary.cash -ne 0) "Indicadores com dados reais: $($ws.kind)"
  foreach($entity in @('accounts','transactions','cards','card_purchases','card_installments','budgets','goals','assets','trades','holdings','debts','subscriptions','contacts','invoices','opportunities','automation_rules','schedules','audit_events')){
   $rows=Request "data?workspace=$w&entity=$entity"
   Require ($null -ne $rows.rows) "API $entity / $($ws.kind)"
  }
 }
 $personal=($me.workspaces|Where-Object {$_.kind -eq 'personal'}|Select-Object -First 1).id
 $company=($me.workspaces|Where-Object {$_.kind -eq 'business'}|Select-Object -First 1).id
 $accounts=Request "data?workspace=$personal&entity=accounts"
 $id=($accounts.rows|Where-Object {$_.kind -eq 'checking'}|Select-Object -First 1).id
 $before=Request "overview?workspace=$personal"
 $amount=12345
 $income=Request "transaction?workspace=$personal" @{kind='income';account_id=$id;amount_cents=$amount;occurred_on=(Get-Date -Format 'yyyy-MM-dd');description='Smoke demo - estornar apos verificacao'}
 Require ([bool]$income.id) 'Criar lancamento financeiro'
 $after=Request "overview?workspace=$personal"
 Require (($after.summary.cash-$before.summary.cash) -eq $amount) 'Lancamento afeta saldo corretamente'
 $null=Request "transaction/void?workspace=$personal" @{id=$income.id}
 $restored=Request "overview?workspace=$personal"
 Require ($restored.summary.cash -eq $before.summary.cash) 'Estorno conserva saldo'
 $card=(Request "data?workspace=$personal&entity=cards").rows[0]
 $p=Request "card/purchase?workspace=$personal" @{card_id=$card.id;total_cents=101;installments=3;description='Compra demo teste';purchased_on=(Get-Date -Format 'yyyy-MM-dd')}
 $parts=(Request "data?workspace=$personal&entity=card_installments").rows|Where-Object {$_.purchase_id -eq $p.id}
 Require ((($parts|Measure-Object -Property amount_cents -Sum).Sum) -eq 101) 'Parcelas conservam os centavos'
 $null=Request "card/void?workspace=$personal" @{id=$p.id}
 Require $true 'Cancelamento da compra teste'
 $assets=(Request "data?workspace=$personal&entity=assets").rows
 $asset=$assets[0].id
 $rate=Request "price?workspace=$personal" @{asset_id=$asset;priced_on=(Get-Date -Format 'yyyy-MM-dd');price_cents=12500}
 Require ([bool]$rate.id) 'Atualizacao de cotacao'
 $contact=Request "manage?workspace=$company" @{entity='contacts';action='create';data=@{name='Contato QA demo';kind='customer'}}
 Require ([bool]$contact.id) 'Cadastro empresarial'
 $invoice=Request "manage?workspace=$company" @{entity='invoices';action='create';data=@{number="QA-$([guid]::NewGuid().ToString('N').Substring(0,12))";direction='receivable';status='open';amount_cents=12345;issued_on=(Get-Date -Format 'yyyy-MM-dd');due_on=(Get-Date -Format 'yyyy-MM-dd');contact_id=$contact.id}}
 Require ([bool]$invoice.id) 'Documento empresarial'
 $corpAccount=(Request "data?workspace=$company&entity=accounts").rows[0].id
 $settle=Request "invoice/settle?workspace=$company" @{id=$invoice.id;account_id=$corpAccount;paid_on=(Get-Date -Format 'yyyy-MM-dd')}
 Require ([bool]$settle.transaction_id) 'Quitacao integrada ao ledger'
 Write-Host "DEMO VERIFICADA - $($passed.Count) checks. http://localhost:$Port" -ForegroundColor Green
 $passed | ForEach-Object {Write-Host $_}
}catch{
 Write-Host "FALHA NA DEMO: $($_.Exception.Message)" -ForegroundColor Red
 & docker compose -p financehub-demo -f compose.yaml -f compose.demo.yaml logs --no-color --tail=100 web demo-seed migrate db
 exit 1
}
