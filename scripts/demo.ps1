# Finance Hub 1.3.3 - demo isolada para PowerShell 5.1 / Windows 11.
# A demo usa projeto Docker, volumes e segredos exclusivos.
# IMPORTANTE: comandos Docker sao executados SEM pipelines ou redirecionamentos:
# Docker Desktop para Windows pode falhar ao detectar o console quando a saida
# e capturada por Out-Host / Out-Null / Out-String / redirecionamento.
param([int]$Port=3100,[switch]$ResetDemo,[switch]$ConfirmReset)
$ErrorActionPreference='Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if ($Port -lt 1024 -or $Port -gt 65535 -or $Port -eq 3000) {
 throw 'Porta da demo invalida. Use 3100 ou outra porta livre (exceto 3000).'
}
$env:APP_PORT=[string]$Port
$env:COMPOSE_ANSI='never'
$env:COMPOSE_PROGRESS='plain'
$env:BUILDKIT_PROGRESS='plain'
$env:COMPOSE_MENU='false'
$project='financehub-demo'
$composeArgs=@('-p',$project,'-f','compose.yaml','-f','compose.demo.yaml')
$demoSecrets=Join-Path (Get-Location).Path 'secrets/demo'
$hadDbSecret=Test-Path (Join-Path $demoSecrets 'db_password')
$legacyVolumeName='financehub-demo_db_data' # Somente para documentar o volume isolado.
$readyTimeout=100

function Assert-Docker([string]$step){
 if($LASTEXITCODE -ne 0){throw "$step falhou (codigo de saida $LASTEXITCODE)."}
}
function New-SecureValue([int]$size){
 $bytes=New-Object byte[] $size
 $rng=[System.Security.Cryptography.RandomNumberGenerator]::Create()
 try{$rng.GetBytes($bytes)}finally{$rng.Dispose()}
 return [Convert]::ToBase64String($bytes).TrimEnd('=')
}
function Initialize-DemoSecrets {
 New-Item -ItemType Directory -Path $demoSecrets -Force | Out-Null
 $utf8=New-Object System.Text.UTF8Encoding($false)
 foreach($item in @(@('db_password',36),@('app_password',36),@('master_key',48),@('setup_code',24),@('backup_key',48),@('demo_password',24))){
  $target=Join-Path $demoSecrets $item[0]
  if(!(Test-Path $target)){
   [IO.File]::WriteAllText($target,(New-SecureValue $item[1]),$utf8)
   Write-Host "Credencial isolada da demo criada: $($item[0])" -ForegroundColor DarkCyan
  }
 }
}
function Invoke-DemoReset {
 Write-Warning 'Recriando exclusivamente os containers e o VOLUME FICTICIO do projeto financehub-demo.'
 # NUNCA usar "docker compose down" sem os argumentos fixos de projeto da demo.
 & docker compose --ansi never --progress plain @composeArgs down --volumes --remove-orphans
 Assert-Docker 'Reset exclusivo da demo'
}
function Show-DemoLogs {
 Write-Host 'Diagnostico dos servicos da demo:' -ForegroundColor Yellow
 # IMPORTANTE: sem 2>&1, Out-Host ou qualquer outra captura da saida Docker.
 & docker compose --ansi never --progress plain @composeArgs logs --no-color --tail=80 migrate db demo-seed web
}
function Start-DemoContainers {
 Write-Host 'Construindo e iniciando a demo com saida Docker em modo plain...' -ForegroundColor Cyan
 & docker compose --ansi never --progress plain @composeArgs up --build -d
 return ($LASTEXITCODE -eq 0)
}
function Wait-DemoReady {
 for($i=0;$i -lt $readyTimeout;$i++){
  try {
   $h=Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 5
   if($h.status -eq 'ok' -and $h.database -eq 'ready' -and $h.analytics -eq 'ready') {return $true}
  } catch {}
  Start-Sleep -Seconds 2
 }
 return $false
}
function Confirm-DemoLogin {
 $body=@{email='demo@financehub.local';password=([IO.File]::ReadAllText((Join-Path $demoSecrets 'demo_password')).Trim())} | ConvertTo-Json -Compress
 try {
  $response=Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/login" -Method Post -Body $body -ContentType 'application/json' -Headers @{Origin="http://localhost:$Port"} -TimeoutSec 20
  return [bool]$response.ok
 } catch {return $false}
}

try {
 if ((Get-Location).Path -match '(?i)\\OneDrive\\') {
  Write-Warning 'Projeto dentro do OneDrive. Para dados reais, mantenha secrets/ e backups fora de pastas sincronizadas.'
 }
 if($ResetDemo -and !$ConfirmReset){throw 'Para apagar APENAS a demo use -ResetDemo -ConfirmReset.'}
 # Executar diretamente: no Windows, ate docker info pode falhar se a saida for pipe.
 & docker info --format '{{.ServerVersion}}'
 Assert-Docker 'Docker Desktop'
 Initialize-DemoSecrets
 & docker compose --ansi never --progress plain @composeArgs config --quiet
 Assert-Docker 'Validacao da configuracao Docker Compose'

 # Sem segredos antigos nao ha garantia de compatibilidade com volume de demo legado.
 # Nao consultamos volumes com "docker volume ls | ...", evitando handle invalido.
 # Se os segredos da demo acabaram de ser criados, descarte SOMENTE a antiga demo.
 if($ResetDemo){Invoke-DemoReset}
 elseif(!$hadDbSecret){
  Write-Warning 'Primeiro uso das credenciais independentes: reinicializando SOMENTE a demo ficticia.'
  Invoke-DemoReset
 }

 $recoveryUsed=$false
 while($true){
  $started=Start-DemoContainers
  if($started -and (Wait-DemoReady)){
   $status=Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/setup-status" -TimeoutSec 10
   if($status.configured -and (Confirm-DemoLogin)){break}
   Write-Warning 'O seed da demonstracao nao completou ou o login da demo nao foi validado.'
  } else {
   Write-Warning 'O build/start ou healthcheck da demo nao foi concluido. Verifique os logs a seguir.'
  }
  if($recoveryUsed){Show-DemoLogs;throw 'A demo nao ficou pronta apos uma tentativa de recuperacao.'}
  $recoveryUsed=$true
  Write-Warning 'Recuperacao unica: recriando apenas o banco FICTICIO (possivel senha divergente / SQLSTATE 28P01).'
  Invoke-DemoReset
 }
 Write-Host "`nDEMO ATIVA E LOGIN VALIDADO: http://localhost:$Port" -ForegroundColor Green
 Write-Host 'Usuario: demo@financehub.local' -ForegroundColor Cyan
 Write-Host "Senha da demo: $(([IO.File]::ReadAllText((Join-Path $demoSecrets 'demo_password'))).Trim())" -ForegroundColor Cyan
 Write-Host 'Banco operacional e segredos reais inalterados. Dados 100% ficticios.'
} catch {
 Write-Host "DEMO FALHOU: $($_.Exception.Message)" -ForegroundColor Red
 try {Show-DemoLogs} catch {Write-Host "Nao foi possivel obter logs: $($_.Exception.Message)" -ForegroundColor Yellow}
 exit 1
}
