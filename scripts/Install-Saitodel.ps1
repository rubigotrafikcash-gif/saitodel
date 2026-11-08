param()
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$codexExe = (Get-Command codex -ErrorAction SilentlyContinue).Source
if (-not $codexExe) {
  $codexExe = Get-ChildItem -LiteralPath (Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\bin') -Filter codex.exe -File -Recurse -ErrorAction Stop | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $codexExe) { throw 'Codex CLI not found' }
$manifest = Get-Content -LiteralPath (Join-Path $repoRoot 'plugin.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$packageRoot = Join-Path $repoRoot ('build\v' + $manifest.version + '\saitodel')
Push-Location -LiteralPath $repoRoot
try {
  if (-not (Test-Path -LiteralPath (Join-Path $packageRoot 'plugin.json'))) {
    & node scripts/package.mjs $packageRoot
    if ($LASTEXITCODE -ne 0) { throw 'Package creation failed' }
  }
  $integrity = & node scripts/source-manager.mjs verify (Join-Path $packageRoot 'skills\saitodel')
  if ($LASTEXITCODE -ne 0) { throw 'Source integrity check failed' }
  $configPath = Join-Path $env:USERPROFILE '.codex\config.toml'
  if (Test-Path -LiteralPath $configPath) {
    $backupDir = Join-Path $repoRoot ('build\install-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    Copy-Item -LiteralPath $configPath -Destination (Join-Path $backupDir 'config.toml')
  }
  & $codexExe plugin marketplace add $repoRoot --json
  if ($LASTEXITCODE -ne 0) { throw 'Marketplace registration failed' }
  & $codexExe plugin add saitodel@personal-saitodel --json
  if ($LASTEXITCODE -ne 0) { throw 'Plugin installation failed' }
  & $codexExe plugin list --marketplace personal-saitodel --json
  if ($LASTEXITCODE -ne 0) { throw 'Plugin discovery failed' }
} finally { Pop-Location }

