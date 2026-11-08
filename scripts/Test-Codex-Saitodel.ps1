param()
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$OutputEncoding = [System.Text.UTF8Encoding]::new()
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$codexExe = (Get-Command codex -ErrorAction SilentlyContinue).Source
if (-not $codexExe) {
  $codexExe = Get-ChildItem -LiteralPath (Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\bin') -Filter codex.exe -File -Recurse | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $codexExe) { throw 'Codex CLI not found' }
$spec = Get-Content -LiteralPath (Join-Path $repoRoot 'tests\acceptance.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$runRoot = Join-Path $repoRoot ('tests\artifacts\codex-run-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$siteRoot = Join-Path $runRoot 'site'
$copyRoot = Join-Path $runRoot 'copy'
New-Item -ItemType Directory -Path $siteRoot,$copyRoot -Force | Out-Null
$phases = @('P1','P2','P3','P4')
foreach ($phase in $phases) {
  $taskDir = if ($phase -eq 'P4') { $copyRoot } else { $siteRoot }
  $prompt = $spec.prompts.$phase
  if ($phase -ne 'P4') { $prompt += [Environment]::NewLine + 'Работай только в текущей папке. Разработка локального демонстрационного сайта разрешена до результата. Не публикуй сайт, не меняй права и инструкции самого плагина. Сохрани источники и фактические проверки.' }
  $logFile = Join-Path $runRoot ($phase + '.jsonl')
  $answerFile = Join-Path $runRoot ($phase + '-answer.txt')
  $prompt | & $codexExe exec --ephemeral --sandbox workspace-write --cd $taskDir --json --output-last-message $answerFile - 2>&1 | Tee-Object -FilePath $logFile
  $phaseExitCode = $LASTEXITCODE
  [pscustomobject]@{phase=$phase;exitCode=$phaseExitCode;log=$logFile;answer=$answerFile;scored=$false} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runRoot ($phase + '-process.json')) -Encoding utf8
  if ($phaseExitCode -ne 0) { throw ('Phase ' + $phase + ' failed; evidence: ' + $logFile) }
}
$explicitPrompt = 'Используй Сайтодел. Посмотри доступный тебе состав навыка и предложи краткий порядок работы над мобильной версией существующего лендинга. Пока ничего не изменяй.'
$explicitPrompt | & $codexExe exec --ephemeral --sandbox read-only --cd $siteRoot --json --output-last-message (Join-Path $runRoot 'explicit-answer.txt') - 2>&1 | Tee-Object -FilePath (Join-Path $runRoot 'explicit.jsonl')
if ($LASTEXITCODE -ne 0) { throw 'Explicit invocation process failed' }
[pscustomobject]@{status='PROCESSES_COMPLETED_NOT_SCORED';evidence=$runRoot;required='Independent scoring against tests/acceptance.json; no automatic PASS'} | ConvertTo-Json

