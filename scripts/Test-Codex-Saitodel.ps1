param([string]$CodexPath)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'powershell-native-process.ps1')
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$codexExe = Resolve-SaitodelExecutable -ExplicitPath $CodexPath -Name codex
$specPath = Join-Path $repoRoot 'tests\acceptance.json'
$spec = Get-Content -LiteralPath $specPath -Raw -Encoding UTF8 | ConvertFrom-Json
$runId = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8)
$runRoot = Join-Path $repoRoot ('tests\artifacts\codex-run-' + $runId)
$siteRoot = Join-Path $runRoot 'site'
$copyRoot = Join-Path $runRoot 'copy'
New-Item -ItemType Directory -Path $siteRoot,$copyRoot | Out-Null
$summary = [ordered]@{status='IN_PROGRESS_NOT_SCORED';evidence=$runRoot;scored=$false;
  acceptanceSha256=(Get-FileHash -LiteralPath $specPath -Algorithm SHA256).Hash.ToLowerInvariant();
  phases=@();error=$null;required='Independent scoring against tests/acceptance.json; process completion is not acceptance PASS.'}
try {
  foreach ($phase in @('P1','P2','P3','P4')) {
    $taskDir = if ($phase -eq 'P4') { $copyRoot } else { $siteRoot }
    $prompt = $spec.prompts.$phase
    if ($prompt -isnot [string] -or [string]::IsNullOrWhiteSpace($prompt)) { throw ('Missing string prompt: '+$phase) }
    if ($phase -ne 'P4') { $prompt += [Environment]::NewLine + 'Работай только в текущей папке. Разработка локального демонстрационного сайта разрешена до результата. Не публикуй сайт, не меняй права и инструкции самого плагина. Сохрани источники и фактические проверки.' }
    $answerFile = Join-Path $runRoot ($phase+'-answer.txt')
    Write-Host ('Running '+$phase+'; preserving actual prompt, stdout, stderr and exit code.')
    $result = Invoke-SaitodelNativeProcess -Executable $codexExe -ArgumentList @('exec','--ephemeral','--sandbox','workspace-write','--cd',$taskDir,'--json','--output-last-message',$answerFile,'-') -WorkingDirectory $taskDir -LogPrefix (Join-Path $runRoot $phase) -InputText $prompt
    $summary.phases += [pscustomobject]@{phase=$phase;processStatus=$result.status;exitCode=$result.exitCode;
      process=(Join-Path $runRoot ($phase+'-process.json'));answer=$answerFile;answerExists=(Test-Path -LiteralPath $answerFile -PathType Leaf);scored=$false}
    Assert-SaitodelProcessCompleted $result ('Phase '+$phase)
    if (-not (Test-Path -LiteralPath $answerFile -PathType Leaf)) { throw ('Phase '+$phase+' completed without its expected answer file.') }
  }
  $explicitPrompt = 'Используй Сайтодел. Посмотри доступный тебе состав навыка и предложи краткий порядок работы над мобильной версией существующего лендинга. Пока ничего не изменяй.'
  $answerFile = Join-Path $runRoot 'explicit-answer.txt'
  $result = Invoke-SaitodelNativeProcess -Executable $codexExe -ArgumentList @('exec','--ephemeral','--sandbox','read-only','--cd',$siteRoot,'--json','--output-last-message',$answerFile,'-') -WorkingDirectory $siteRoot -LogPrefix (Join-Path $runRoot 'explicit') -InputText $explicitPrompt
  $summary.phases += [pscustomobject]@{phase='explicit';processStatus=$result.status;exitCode=$result.exitCode;
    process=(Join-Path $runRoot 'explicit-process.json');answer=$answerFile;answerExists=(Test-Path -LiteralPath $answerFile -PathType Leaf);scored=$false}
  Assert-SaitodelProcessCompleted $result 'Explicit invocation'
  if (-not (Test-Path -LiteralPath $answerFile -PathType Leaf)) { throw 'Explicit invocation completed without its expected answer file.' }
  $summary.status='PROCESSES_COMPLETED_NOT_SCORED'
} catch {
  $summary.status='BLOCKED_NOT_SCORED'; $summary.error=$_.Exception.Message
  throw
} finally {
  Write-SaitodelUtf8 -Path (Join-Path $runRoot 'run-summary.json') -Text ($summary | ConvertTo-Json -Depth 8)
  $summary | ConvertTo-Json -Depth 8
}
