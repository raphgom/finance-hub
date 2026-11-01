# Finance Hub — acceptance E2E for Windows 11 / Docker Desktop.
# ISOLATED Compose project. Never touches the operational project or its DB volume.
param([int]$Port=3107)
$ErrorActionPreference='Stop'
$root=Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $root
if (!(Test-Path 'secrets/setup_code')) { throw 'Execute scripts/init.ps1 antes do teste.' }
if ($Port -eq 3000 -or $Port -lt 1024 -or $Port -gt 65535) { throw 'Use uma porta de teste livre entre 1024 e 65535, exceto 3000.' }
$testId=([guid]::NewGuid()).ToString('N').Substring(0,8)
$project="financehub-acceptance-$testId"
$previousPort=$env:APP_PORT
$env:APP_PORT=[string]$Port
$base="http://localhost:$Port"
$session=New-Object Microsoft.PowerShell.Commands.WebRequestSession
$results=New-Object System.Collections.Generic.List[string]
function Assert-Equal($got,$expected,$label){
 if ([string]$got -ne [string]$expected) { throw "FALHA [$label]: esperado=[$expected] obtido=[$got]" }
 $script:results.Add("PASS: $label")
}
function Request($route,$payload=$null,[Microsoft.PowerShell.Commands.WebRequestSession]$webSession=$null){
 $params=@{Uri="$base/api/$route";ErrorAction='Stop';TimeoutSec=35;Headers=@{'Origin'=$base}}
 if ($webSession) {$params.WebSession=$webSession}else{$params.WebSession=$session}
 if ($null -ne $payload) {$params.Method='POST';$params.ContentType='application/json';$params.Body=($payload | ConvertTo-Json -Depth 8 -Compress)}
 else {$params.Method='GET'}
 return Invoke-RestMethod @params
}
try {
 & docker version --format '{{.Server.Version}}' | Out-Host
 if ($LASTEXITCODE -ne 0){throw 'Docker Engine não acessível.'}
 Write-Host "Inicializando ambiente de aceitação isolado: $project na porta $Port" -ForegroundColor Cyan
 & docker compose -p $project up -d --build
 if ($LASTEXITCODE -ne 0){throw 'Docker Compose falhou durante build ou inicialização.'}
 $healthy=$false
 for($n=0;$n -lt 90;$n++) {
  try { $r=Request 'health';if($r.status -eq 'ok' -and $r.database -eq 'ready'){$healthy=$true;break} }
  catch {}
  if (!$healthy) {Start-Sleep -Seconds 2}
 }
 if (!$healthy){throw 'Health check falhou. Consulte os logs.'}
 $results.Add('PASS: build, migration e healthcheck')
 $setup=Request 'setup-status'
 if ($setup.configured) {throw 'Ambiente de aceitação já configurado. Execute com um projeto de teste novo para validar o primeiro acesso; não reutilize um banco anterior.'}
 $code=(Get-Content 'secrets/setup_code' -Raw).Trim()
 $email="acceptance-$([guid]::NewGuid().ToString('N'))@example.invalid"
 $password="Fh!$([guid]::NewGuid().ToString('N'))"
 $created=Request 'setup' @{code=$code;name='Administrador de Aceitação';email=$email;password=$password}
 Assert-Equal $created.ok $true 'Cadastro do primeiro administrador'
 $me=Request 'me'
 Assert-Equal $me.user.email $email 'Sessão criada automaticamente'
 $workspace=[string]$me.workspaces[0].id
 $account=Request "manage?workspace=$workspace" @{entity='accounts';action='create';data=@{name='Conta de testes';kind='checking';initial_cents=10000;currency='BRL'}}
 if (!$account.id){throw 'Conta não foi criada'}
 $results.Add('PASS: criação de conta')
 $income=Request "transaction?workspace=$workspace" @{kind='income';account_id=$account.id;amount_cents=12345;occurred_on=(Get-Date -Format 'yyyy-MM-dd');description='Receita de aceite'}
 $expense=Request "transaction?workspace=$workspace" @{kind='expense';account_id=$account.id;amount_cents=345;occurred_on=(Get-Date -Format 'yyyy-MM-dd');description='Despesa de aceite'}
 if (!$income.id -or !$expense.id){throw 'Falha ao criar transações'}
 $overview=Request "overview?workspace=$workspace"
 Assert-Equal $overview.summary.cash 22000 'Ledger conserva os centavos e saldo esperado'
 $void=Request "transaction/void?workspace=$workspace" @{id=$expense.id}
 $overview=Request "overview?workspace=$workspace"
 Assert-Equal $overview.summary.cash 22345 'Estorno reverso concilia saldo'
 $card=Request "manage?workspace=$workspace" @{entity='cards';action='create';data=@{name='Cartão de teste';limit_cents=20000;closing_day=10;due_day=20}}
 $purchase=Request "card/purchase?workspace=$workspace" @{card_id=$card.id;total_cents=100;installments=3;description='Compra parcelada teste';purchased_on=(Get-Date -Format 'yyyy-MM-dd')}
 $installments=Request "data?workspace=$workspace&entity=card_installments"
 $values=@($installments.rows | Where-Object {$_.purchase_id -eq $purchase.id} | ForEach-Object {[int]$_.amount_cents})
 Assert-Equal ($values | Measure-Object -Sum).Sum 100 'Parcelamentos conservam valor exato'
 $second=Request 'workspaces' @{kind='business';name='Empresa de aceitação'}
 $other=Request "data?workspace=$($second.id)&entity=accounts"
 Assert-Equal @($other.rows).Count 0 'Isolamento de espaços financeiros'
 $viewerEmail="viewer-$([guid]::NewGuid().ToString('N'))@example.invalid"
 $viewerPwd="Vw!$([guid]::NewGuid().ToString('N'))"
 $viewer=Request "member?workspace=$workspace" @{action='create';name='Usuário de leitura';email=$viewerEmail;password=$viewerPwd;role='viewer'}
 if (!$viewer.id){throw 'Falha ao criar usuário de leitura'}
 $viewerSession=New-Object Microsoft.PowerShell.Commands.WebRequestSession
 $logged=Request 'login' @{email=$viewerEmail;password=$viewerPwd} $viewerSession
 Assert-Equal $logged.ok $true 'Autenticação de usuário convidado'
 $forbidden=$false
 try {$null=Request "manage?workspace=$workspace" @{entity='accounts';action='create';data=@{name='Proibido';kind='checking';initial_cents=0}} $viewerSession}
 catch {if ([int]$_.Exception.Response.StatusCode -eq 403){$forbidden=$true}else{throw}}
 Assert-Equal $forbidden $true 'RBAC bloqueia escrita do perfil viewer'
 $results.Add('PASS: onboarding, sessão, lançamentos, estorno, cartão, segregação e RBAC')
 Write-Host "`nACEITAÇÃO APROVADA ($($results.Count) verificações)" -ForegroundColor Green
 $results | ForEach-Object {Write-Host "  $_"}
 Write-Host "`nBanco de ACEITAÇÃO mantido no projeto $project. Não executamos exclusão de volumes."
} catch {
 Write-Host "`nACEITAÇÃO REPROVADA: $($_.Exception.Message)" -ForegroundColor Red
 Write-Host 'Logs do ambiente de aceitação:' -ForegroundColor Yellow
 & docker compose -p $project logs --tail=80 web migrate db 2>&1 | Out-Host
 exit 1
} finally {
 $env:APP_PORT=$previousPort
}
