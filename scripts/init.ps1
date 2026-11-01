# PowerShell 7+ or Windows PowerShell 5.1; run from project directory.
param([switch]$Quiet)
$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Resolve-Path (Join-Path $scriptDir '..')).Path
if ((Get-Location).Path -match '(?i)\\OneDrive\\') { Write-Warning 'O projeto esta em uma pasta sincronizada com OneDrive. Segredos e backups podem ser enviados para nuvem. Prefira uma pasta local fora de OneDrive para dados financeiros.' }
New-Item -ItemType Directory -Path secrets -Force | Out-Null
New-Item -ItemType Directory -Path backups -Force | Out-Null
function New-Secret([int]$bytes) {
  $data = New-Object byte[] $bytes
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($data) } finally { $rng.Dispose() }
  return [Convert]::ToBase64String($data).TrimEnd('=')
}
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
foreach ($entry in @(@('db_password',36), @('app_password',36), @('master_key',48), @('setup_code',24), @('backup_key',48))) {
  $path = Join-Path 'secrets' $entry[0]
  if (!(Test-Path $path)) {
    [IO.File]::WriteAllText((Join-Path (Get-Location).Path $path),(New-Secret $entry[1]),$utf8NoBom)
    if (!$Quiet) {Write-Host "Generated: $($entry[0])"}
  }
}
if (!$Quiet) {
 Write-Host "`nFinance Hub setup code (keep private):" -ForegroundColor Cyan
 Get-Content secrets/setup_code
 Write-Host "`nNext: docker compose up --build -d" -ForegroundColor Green
 Write-Host "Then open http://localhost:3000 in your browser."
}
