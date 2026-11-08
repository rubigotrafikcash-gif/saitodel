# Windows PowerShell 5.1 compatible. Process completion is not acceptance PASS.
function Resolve-SaitodelExecutable {
  param([string]$ExplicitPath, [ValidateSet('codex','node')][string]$Name)
  if ($ExplicitPath) {
    $candidate = [IO.Path]::GetFullPath($ExplicitPath)
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf) -or [IO.Path]::GetExtension($candidate) -ne '.exe') { throw ('Supply an existing .exe for -' + $Name + 'Path: ' + $candidate) }
    return $candidate
  }
  $command = Get-Command ($Name + '.exe') -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($command -and (Test-Path -LiteralPath $command.Source -PathType Leaf)) { return $command.Source }
  if ($Name -eq 'codex' -and $env:LOCALAPPDATA) {
    $searchRoot = Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\bin'
    if (Test-Path -LiteralPath $searchRoot -PathType Container) {
      $candidate = Get-ChildItem -LiteralPath $searchRoot -Filter codex.exe -File -Recurse -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
      if ($candidate) { return $candidate }
    }
  }
  if ($Name -eq 'node') {
    foreach ($candidate in @($env:CODEX_PRIMARY_RUNTIME_NODE, (Join-Path $env:ProgramFiles 'nodejs\node.exe'))) {
      if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) { return [IO.Path]::GetFullPath($candidate) }
    }
  }
  throw ('Executable not found. Supply -' + $Name + 'Path with the full path to ' + $Name + '.exe.')
}

function ConvertTo-SaitodelWindowsArgument {
  param([AllowEmptyString()][string]$Value)
  # Quote every Windows CRT argument, escaping quotes and trailing backslashes.
  $escaped = [regex]::Replace($Value, '(\\*)"', { param($match) return ('\' * ($match.Groups[1].Value.Length * 2 + 1)) + '"' })
  $escaped = [regex]::Replace($escaped, '\\+$', { param($match) return '\' * ($match.Value.Length * 2) })
  return '"' + $escaped + '"'
}

function Write-SaitodelUtf8 {
  param([string]$Path, [AllowEmptyString()][string]$Text)
  [IO.File]::WriteAllText($Path, $Text, (New-Object Text.UTF8Encoding($false)))
}

function Invoke-SaitodelNativeProcess {
  param(
    [Parameter(Mandatory=$true)][string]$Executable,
    [Parameter(Mandatory=$true)][AllowEmptyCollection()][AllowEmptyString()][string[]]$ArgumentList,
    [Parameter(Mandatory=$true)][string]$WorkingDirectory,
    [Parameter(Mandatory=$true)][string]$LogPrefix,
    [AllowEmptyString()][string]$InputText = ''
  )
  if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) { throw ('Executable missing: ' + $Executable) }
  if (-not (Test-Path -LiteralPath $WorkingDirectory -PathType Container)) { throw ('Working directory missing: ' + $WorkingDirectory) }
  New-Item -ItemType Directory -Path (Split-Path -Parent $LogPrefix) -Force | Out-Null
  $paths = [ordered]@{ stdout=$LogPrefix+'-stdout.log'; stderr=$LogPrefix+'-stderr.log'; prompt=$LogPrefix+'-prompt.txt'; process=$LogPrefix+'-process.json' }
  foreach ($target in $paths.Values) { if (Test-Path -LiteralPath $target) { throw ('Refusing to overwrite evidence: ' + $target) } }
  Write-SaitodelUtf8 -Path $paths.prompt -Text $InputText
  $record = [ordered]@{ executable=$Executable; arguments=@($ArgumentList); cwd=$WorkingDirectory;
    startedAt=[DateTime]::UtcNow.ToString('o'); completedAt=$null; exitCode=$null; status='NOT_STARTED'; scored=$false;
    stdout=$paths.stdout; stderr=$paths.stderr; prompt=$paths.prompt;
    promptSha256=(Get-FileHash -LiteralPath $paths.prompt -Algorithm SHA256).Hash.ToLowerInvariant(); error=$null; inputError=$null }
  Write-SaitodelUtf8 -Path $paths.process -Text ($record | ConvertTo-Json -Depth 6)
  $stdoutText = ''; $stderrText = ''
  $process = New-Object Diagnostics.Process
  try {
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = [IO.Path]::GetFullPath($Executable)
    $quoted = foreach ($argument in $ArgumentList) { ConvertTo-SaitodelWindowsArgument -Value $argument }
    $start.Arguments = $quoted -join ' '
    $start.WorkingDirectory = [IO.Path]::GetFullPath($WorkingDirectory)
    $start.UseShellExecute=$false; $start.CreateNoWindow=$true
    $start.RedirectStandardInput=$true; $start.RedirectStandardOutput=$true; $start.RedirectStandardError=$true
    $start.StandardOutputEncoding = New-Object Text.UTF8Encoding($false)
    $start.StandardErrorEncoding = New-Object Text.UTF8Encoding($false)
    $process.StartInfo = $start
    if (-not $process.Start()) { throw 'Process did not start' }
    $record.status = 'RUNNING'
    Write-SaitodelUtf8 -Path $paths.process -Text ($record | ConvertTo-Json -Depth 6)
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    try {
      # Send exact UTF-8 bytes, without native-pipeline OEM/ANSI conversion.
      $bytes = (New-Object Text.UTF8Encoding($false)).GetBytes($InputText)
      $process.StandardInput.BaseStream.Write($bytes,0,$bytes.Length)
      $process.StandardInput.BaseStream.Flush()
    } catch { $record.inputError = $_.Exception.Message }
    finally { $process.StandardInput.BaseStream.Close() }
    $process.WaitForExit()
    $record.exitCode = $process.ExitCode
    $stdoutText = $stdoutTask.GetAwaiter().GetResult()
    $stderrText = $stderrTask.GetAwaiter().GetResult()
    if ($record.exitCode -eq 0 -and -not $record.inputError) { $record.status='PROCESS_COMPLETED_NOT_SCORED' } else { $record.status='PROCESS_FAILED' }
  } catch {
    $record.error=$_.Exception.Message; $record.status='PROCESS_FAILED'
    try { if ($process.HasExited) { $record.exitCode=$process.ExitCode } } catch { }
  } finally {
    $record.completedAt=[DateTime]::UtcNow.ToString('o')
    Write-SaitodelUtf8 -Path $paths.stdout -Text $stdoutText
    Write-SaitodelUtf8 -Path $paths.stderr -Text $stderrText
    Write-SaitodelUtf8 -Path $paths.process -Text ($record | ConvertTo-Json -Depth 6)
    $process.Dispose()
  }
  return [pscustomobject]$record
}

function Assert-SaitodelProcessCompleted {
  param($Result,[string]$Action)
  if ($Result.status -ne 'PROCESS_COMPLETED_NOT_SCORED' -or $Result.exitCode -ne 0) {
    throw ($Action + ' failed; exit=' + $Result.exitCode + '; stderr=' + $Result.stderr + '; error=' + $Result.error)
  }
}
