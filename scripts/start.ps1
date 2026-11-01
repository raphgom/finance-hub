# Finance Hub - instalação e inicialização para Windows PowerShell 5.1+ / Docker Desktop.
# Não exige volumes ou containers anteriores. Gera e reutiliza segredos locais.
param(
 [int]$Port=3000,
 [switch]$ResetData,
 [switch]$ConfirmReset,
 [switch]$RotateSetupCode
)
$ErrorActionPreference='Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if ($Port -lt 1024 -or $Port -gt 65535) {throw 'Porta inválida (1024-65535).'}
$env:APP_PORT=[string]$Port
function Invoke-Checked([scriptblock]$Command,[string]$Description) {
 & $Command
 if ($LASTEXITCODE -ne 0) {throw "$Description falhou (exit code: $LASTEXITCODE)."}
}
try {
 Write-Host 'FINANCE HUB - Inicialização verificada' -ForegroundColor Cyan
 Invoke-Checked {docker info --format '{{.ServerVersion}}' | Out-Host} 'Docker Desktop / Engine'
 if ($ResetData) {
  if (!$ConfirmReset) {throw 'Reset solicitado sem -ConfirmReset. Esse reset remove o volume de dados PostgreSQL.'}
  # O compose valida caminhos de secrets mesmo em determinadas operacoes de remocao.
  # Prepare os arquivos antes do down --volumes, inclusive em uma instalacao zerada.
  & powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\init.ps1 -Quiet
  if ($LASTEXITCODE -ne 0) {throw 'Não foi possível preparar os segredos para o reset.'}
  Write-Host 'AVISO: -ResetData excluirá o banco de dados dos volumes desta instância.' -ForegroundColor Yellow
  Invoke-Checked {docker compose down --volumes --remove-orphans} 'Reset de containers/volumes'
 }
 if ($RotateSetupCode) {
  if (!$ResetData) {throw 'Por segurança, -RotateSetupCode requer -ResetData -ConfirmReset.'}
  if (Test-Path 'secrets/setup_code') {Remove-Item -LiteralPath 'secrets/setup_code' -Force}
 }
 & powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\init.ps1
 if ($LASTEXITCODE -ne 0) {throw 'Falha ao gerar/carregar segredos locais.'}
 Invoke-Checked {docker compose config --quiet} 'Validação de Docker Compose'
 Write-Host 'Construindo e inicializando serviços...' -ForegroundColor Cyan
 Invoke-Checked {docker compose up --build -d} 'Build + instalação Docker'
 Write-Host 'Aguardando migração, aplicação e PostgreSQL...' -ForegroundColor Cyan
 $healthy=$false
 for($i=0;$i -lt 90;$i++) {
  try {
   $health=Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 5
   if($health.status -eq 'ok' -and $health.database -eq 'ready' -and $health.analytics -eq 'ready') {$healthy=$true;break}
  } catch {}
  Start-Sleep -Seconds 2
 }
 if (!$healthy) {throw 'API não ficou saudável. Logs do web, migrate e db incluídos abaixo.'}
 $setup=Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/setup-status" -TimeoutSec 10
 if ($null -eq $setup.configured) {throw 'A API de instalação não retornou o estado esperado.'}
 Write-Host "`nINICIALIZAÇÃO APROVADA: http://localhost:$Port" -ForegroundColor Green
 if (!$setup.configured) {
  Write-Host 'Novo banco criado. Configure o primeiro administrador com o código exibido pelo init.ps1.' -ForegroundColor Green
 } else {
  Write-Host 'Banco existente: administrador já configurado.' -ForegroundColor Green
 }
 Write-Host 'Verifique a aplicação pelo navegador. Para teste integrado isolado: .\scripts\acceptance.ps1'
} catch {
 Write-Host "`nINICIALIZAÇÃO FALHOU: $($_.Exception.Message)" -ForegroundColor Red
 & docker compose ps 2>&1 | Out-Host
 & docker compose logs --tail=80 migrate web db 2>&1 | Out-Host
 exit 1
}
