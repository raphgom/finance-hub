$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Resolve-Path (Join-Path $scriptDir '..')).Path
Write-Host 'Finance Hub · Verificacao local' -ForegroundColor Cyan
foreach ($secret in @('db_password','app_password','master_key','setup_code','backup_key')) {
  if (!(Test-Path (Join-Path 'secrets' $secret))) { throw "Segredo ausente: $secret. Execute init.ps1." }
}
Write-Host 'Segredos locais: OK'
docker compose config --quiet
if ($LASTEXITCODE -ne 0) { throw 'Docker Compose invalido.' }
Write-Host 'Docker Compose: OK'
docker compose ps
Write-Host 'Testando API de saude...'
$result=Invoke-RestMethod -Uri 'http://localhost:3000/api/health' -TimeoutSec 10
if ($result.status -ne 'ok' -or $result.database -ne 'ready' -or $result.analytics -ne 'ready') {throw 'API nao retornou saude OK.'}
Write-Host 'Finance Hub e PostgreSQL: OK' -ForegroundColor Green
Write-Host 'Verificando instalacao inicial...' -ForegroundColor Cyan
$status=Invoke-RestMethod -Uri 'http://localhost:3000/api/setup-status' -TimeoutSec 10
Write-Host "Administrador configurado: $($status.configured)"
Write-Host 'Teste de escrita do esquema (rollback automatico):' -ForegroundColor Cyan
docker compose run --rm migrate node scripts/check-setup.mjs
if ($LASTEXITCODE -ne 0) {throw 'Falha no teste de esquema. Veja logs: docker compose logs --tail=100 migrate db web'}
Write-Host 'Diagnostico do primeiro acesso: OK' -ForegroundColor Green
Write-Host 'Execute testes financeiros e restauracao em ambiente isolado antes de dados sensiveis.'
