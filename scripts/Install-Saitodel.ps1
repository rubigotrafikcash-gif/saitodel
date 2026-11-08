param([string]$CodexPath,[string]$NodePath,[switch]$RunTests)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'powershell-native-process.ps1')
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$codexExe = Resolve-SaitodelExecutable -ExplicitPath $CodexPath -Name codex
$nodeExe = Resolve-SaitodelExecutable -ExplicitPath $NodePath -Name node
$manifest = Get-Content -LiteralPath (Join-Path $repoRoot 'plugin.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$packageRoot = Join-Path $repoRoot ('build\v' + $manifest.version + '\saitodel')
$runId = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8)
$runRoot = Join-Path $repoRoot ('build\install-evidence-' + $runId)
New-Item -ItemType Directory -Path $runRoot | Out-Null
$summary = [ordered]@{status='IN_PROGRESS';version=$manifest.version;package=$packageRoot;evidence=$runRoot;
  installation='NOT_RUN';discovery='NOT_RUN';runtimeAcceptance='NOT_CHECKED';testsRequested=[bool]$RunTests;
  historicalPersonalSkill='IDENTITY_UNRESOLVED_NOT_UPDATED';backup=$null;error=$null}

function Assert-CurrentSaitodelPayload {
  param([string]$CandidateRoot)
  $payloadRoot = Join-Path $CandidateRoot 'skills\saitodel'
  if (-not (Test-Path -LiteralPath $payloadRoot -PathType Container)) { throw ('Installed payload is not accessible: '+$payloadRoot) }
  $expected = @{}
  foreach ($item in @('SKILL.md','agents','assets','references','vendor','sources.lock.json','scripts\source-manager.mjs')) {
    $source = Join-Path $repoRoot $item
    if (-not (Test-Path -LiteralPath $source)) { throw ('Missing source payload: '+$source) }
    $files = if (Test-Path -LiteralPath $source -PathType Container) { @(Get-ChildItem -LiteralPath $source -Recurse -File) } else { @(Get-Item -LiteralPath $source) }
    foreach ($file in $files) { $expected[$file.FullName.Substring($repoRoot.Length+1)] = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash }
  }
  $actualFiles = @(Get-ChildItem -LiteralPath $payloadRoot -Recurse -File)
  if ($actualFiles.Count -ne $expected.Count) { throw 'Package inventory differs from current source; use a fresh version.' }
  foreach ($file in $actualFiles) {
    $relative = $file.FullName.Substring($payloadRoot.Length+1)
    if (-not $expected.ContainsKey($relative) -or (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash -ne $expected[$relative]) { throw ('Package/source mismatch: '+$relative) }
  }
  if ((Get-FileHash -LiteralPath (Join-Path $CandidateRoot 'plugin.json') -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath (Join-Path $repoRoot 'plugin.json') -Algorithm SHA256).Hash) { throw 'Package manifest differs from current source.' }
  return $expected
}

function Read-InstalledSaitodel {
  param($Result)
  Assert-SaitodelProcessCompleted $Result 'Read-only plugin listing'
  $listing = Get-Content -LiteralPath $Result.stdout -Raw -Encoding UTF8 | ConvertFrom-Json
  if (-not ($listing.PSObject.Properties.Name -contains 'installed')) { throw 'Unknown plugin list schema; inspect preserved JSON.' }
  return @($listing.installed | Where-Object { $_.name -eq 'saitodel' -or $_.pluginId -match '^saitodel@' })
}

try {
  # Check every marketplace before any registration, avoiding duplicate channels.
  $result = Invoke-SaitodelNativeProcess -Executable $codexExe -ArgumentList @('plugin','list','--json') -WorkingDirectory $repoRoot -LogPrefix (Join-Path $runRoot 'preflight-plugin-list')
  $candidates = @(Read-InstalledSaitodel $result)
  $needsInstall = $true
  if ($candidates.Count -gt 0) {
    Write-SaitodelUtf8 -Path (Join-Path $runRoot 'existing-candidates.json') -Text (ConvertTo-Json -InputObject $candidates -Depth 8)
    if ($candidates.Count -ne 1) { throw 'Multiple installed Saitodel candidates found; no installation or removal was attempted.' }
    $candidate = $candidates[0]
    if ($candidate.version -ne $manifest.version -or $candidate.installed -ne $true -or $candidate.enabled -ne $true) { throw 'Existing Saitodel version/state differs; no duplicate installation was attempted.' }
    if ($candidate.source.source -ne 'local' -or -not $candidate.source.path) { throw 'Existing Saitodel found but its payload path is unverified; no duplicate installation was attempted.' }
    $existingRoot = [IO.Path]::GetFullPath($candidate.source.path)
    $hashes = Assert-CurrentSaitodelPayload $existingRoot
    Write-SaitodelUtf8 -Path (Join-Path $runRoot 'existing-payload-hashes.json') -Text ($hashes | ConvertTo-Json -Depth 4)
    $needsInstall = $false
    $summary.installation = 'EXISTING_INSTALLATION_AND_PAYLOAD_CONFIRMED'
    $summary.discovery = 'CLI_REGISTRY_CONFIRMED_NEW_SESSION_NOT_CHECKED'
    $summary.package = $existingRoot
  }
  if ($needsInstall) {
    if (-not (Test-Path -LiteralPath (Join-Path $packageRoot 'plugin.json') -PathType Leaf)) {
      $result = Invoke-SaitodelNativeProcess -Executable $nodeExe -ArgumentList @((Join-Path $repoRoot 'scripts\package.mjs'),$packageRoot) -WorkingDirectory $repoRoot -LogPrefix (Join-Path $runRoot 'package')
      Assert-SaitodelProcessCompleted $result 'Package creation'
    }
    $hashes = Assert-CurrentSaitodelPayload $packageRoot
    Write-SaitodelUtf8 -Path (Join-Path $runRoot 'payload-hashes.json') -Text ($hashes | ConvertTo-Json -Depth 4)
    $payloadRoot = Join-Path $packageRoot 'skills\saitodel'
    $result = Invoke-SaitodelNativeProcess -Executable $nodeExe -ArgumentList @((Join-Path $payloadRoot 'scripts\source-manager.mjs'),'verify',$payloadRoot,'--lock',(Join-Path $payloadRoot 'sources.lock.json')) -WorkingDirectory $repoRoot -LogPrefix (Join-Path $runRoot 'integrity')
    Assert-SaitodelProcessCompleted $result 'Source integrity check'
    $integrity = Get-Content -LiteralPath $result.stdout -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($integrity.status -ne 'PASS' -or $integrity.failed -ne 0 -or $integrity.checked -le 0) { throw 'Integrity evidence did not confirm bundled sources.' }
    $market = Get-Content -LiteralPath (Join-Path $repoRoot '.agents\plugins\marketplace.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $entry = @($market.plugins | Where-Object { $_.name -eq 'saitodel' })
    if ($market.name -ne 'personal-saitodel' -or $entry.Count -ne 1 -or $entry[0].source.source -ne 'local') { throw 'Unexpected marketplace identity/source.' }
    if ([IO.Path]::GetFullPath((Join-Path $repoRoot $entry[0].source.path)) -ne $packageRoot) { throw 'Marketplace points to a different package.' }
    $configRoot = if ($env:CODEX_HOME) { [IO.Path]::GetFullPath($env:CODEX_HOME) } else { Join-Path $env:USERPROFILE '.codex' }
    $configPath = Join-Path $configRoot 'config.toml'
    if (Test-Path -LiteralPath $configPath -PathType Leaf) {
      $backupDir = Join-Path $runRoot 'backup'
      New-Item -ItemType Directory -Path $backupDir | Out-Null
      Copy-Item -LiteralPath $configPath -Destination (Join-Path $backupDir 'config.toml')
      $summary.backup = Join-Path $backupDir 'config.toml'
    }
    # This installs the authorized local Codex channel; it is not an update of an unidentified historical personal skill.
    $result = Invoke-SaitodelNativeProcess -Executable $codexExe -ArgumentList @('plugin','marketplace','add',$repoRoot,'--json') -WorkingDirectory $repoRoot -LogPrefix (Join-Path $runRoot 'marketplace-add')
    Assert-SaitodelProcessCompleted $result 'Marketplace registration'
    $result = Invoke-SaitodelNativeProcess -Executable $codexExe -ArgumentList @('plugin','add','saitodel@personal-saitodel','--json') -WorkingDirectory $repoRoot -LogPrefix (Join-Path $runRoot 'plugin-add')
    Assert-SaitodelProcessCompleted $result 'Plugin installation'
    $summary.installation = 'COMMAND_COMPLETED_UNVERIFIED'
    $result = Invoke-SaitodelNativeProcess -Executable $codexExe -ArgumentList @('plugin','list','--json') -WorkingDirectory $repoRoot -LogPrefix (Join-Path $runRoot 'postflight-plugin-list')
    $installed = @(Read-InstalledSaitodel $result)
    if ($installed.Count -ne 1 -or $installed[0].pluginId -ne 'saitodel@personal-saitodel' -or $installed[0].version -ne $manifest.version -or $installed[0].installed -ne $true -or $installed[0].enabled -ne $true) { throw 'Exact installed/enabled plugin version was not confirmed; inspect preserved JSON.' }
    $summary.installation = 'LOCAL_CODEX_CHANNEL_CONFIRMED_BY_CLI_LIST'
    $summary.discovery = 'CLI_REGISTRY_CONFIRMED_NEW_SESSION_NOT_CHECKED'
  }
  $summary.status = 'INSTALLATION_CONFIRMED_RUNTIME_NOT_CHECKED'
} catch {
  $summary.status='BLOCKED'; $summary.error=$_.Exception.Message
  throw
} finally {
  Write-SaitodelUtf8 -Path (Join-Path $runRoot 'installation-summary.json') -Text ($summary | ConvertTo-Json -Depth 6)
  $summary | ConvertTo-Json -Depth 6
}
if ($RunTests) { & (Join-Path $PSScriptRoot 'Test-Codex-Saitodel.ps1') -CodexPath $codexExe }
