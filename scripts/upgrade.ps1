# Atualiza os containers sem apagar dados, segredos ou volumes Docker.
$ErrorActionPreference='Stop'
$dir=Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Resolve-Path (Join-Path $dir '..')).Path
if (!(Test-Path 'secrets/db_password') -or !(Test-Path 'secrets/master_key') -or !(Test-Path 'secrets/setup_code')) {
 throw 'Segredos ausentes. Em atualizacoes, copie a pasta secrets da instalacao antiga antes de iniciar. Nao crie novas chaves sobre um banco existente.'
}
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\init.ps1
if ($LASTEXITCODE -ne 0) {throw 'Falha na inicializacao de segredos de aplicacao.'}
Write-Host 'Verificando arquivos de configuracao e secrets existentes...' -ForegroundColor Cyan
docker compose config --quiet
if ($LASTEXITCODE -ne 0) {throw 'Compose invalido.'}
Write-Host 'Atualizando imagens e migracao sem excluir volumes...' -ForegroundColor Cyan
docker compose up --build -d
if ($LASTEXITCODE -ne 0) {throw 'Falha ao atualizar. Verifique docker compose logs --tail=100 migrate web db'}
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\doctor.ps1
if ($LASTEXITCODE -ne 0) {throw 'Diagnostico falhou. Consulte os logs.'}
Write-Host 'Atualizacao aplicada; dados preservados pelo volume existente.' -ForegroundColor Green
