# Local development backend: builds and runs the game daemon `ted` from a private copy of
# the backend sources, so the client has a server to talk to.
#
#   powershell -File tools\dev-backend.ps1 sync    # refresh the source copy, write SNAPSHOT.txt
#   powershell -File tools\dev-backend.ps1 build   # cargo build --release -j 8 (ted, tedctl)
#   powershell -File tools\dev-backend.ps1 start   # start ted in the background, wait for /v2/health
#   powershell -File tools\dev-backend.ps1 stop    # stop the instance named in ted.pid
#   powershell -File tools\dev-backend.ps1 status  # running? port, /v2/health, SNAPSHOT.txt
#   powershell -File tools\dev-backend.ps1 reset   # stop, then empty the data directory (new world)
#
# API: http://127.0.0.1:18080    admin endpoint: 127.0.0.1:18081, used by
#   .local-backend\target\release\tedctl.exe --data-dir .local-backend\data status
# Everything lives under <repo>\.local-backend\ : src, target, data, ted.log, ted.pid, SNAPSHOT.txt.
# The backend repo is only read: files are copied out of it and git is asked for HEAD and status.
#
# Exit code: 0 = ok (status: running and healthy), 1 = failed or not running, 2 = usage.
param(
    [Parameter(Position = 0)]
    [string]$Command = ''
)

$ErrorActionPreference = 'Stop'

$backendRepo = 'F:\Trade Empire\Backend-V2'
$apiPort = 18080
$adminPort = 18081
$buildJobs = 8
$startTimeoutSec = 60

$repoRoot = Split-Path -Parent $PSScriptRoot
$localRoot = Join-Path $repoRoot '.local-backend'
$srcDir = Join-Path $localRoot 'src'
$targetDir = Join-Path $localRoot 'target'
$dataDir = Join-Path $localRoot 'data'
$logFile = Join-Path $localRoot 'ted.log'
$pidFile = Join-Path $localRoot 'ted.pid'
$snapshotFile = Join-Path $localRoot 'SNAPSHOT.txt'
$tedExe = Join-Path $targetDir 'release\ted.exe'
$gameData = Join-Path $srcDir 'data\gamedata.json'
$healthUrl = "http://127.0.0.1:$apiPort/v2/health"

function Test-ReparsePoint([string]$path) {
    $item = Get-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
    return ($null -ne $item) -and (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0)
}

# Guard for every delete and mirror. Returns the full path, or throws unless the path lies
# strictly inside .local-backend and is not reached through a junction or symlink.
function Assert-InsideLocal([string]$path) {
    $root = [System.IO.Path]::GetFullPath($localRoot).TrimEnd('\')
    $full = [System.IO.Path]::GetFullPath($path).TrimEnd('\')
    if (-not $full.StartsWith($root + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "refusing to touch '$full': not inside '$root\'"
    }
    $probe = $full
    while ($probe.Length -ge $root.Length) {
        if (Test-ReparsePoint $probe) {
            throw "refusing to touch '$full': '$probe' is a junction or symlink"
        }
        $probe = Split-Path -Parent $probe
    }
    return $full
}

function Initialize-LocalRoot {
    if (-not (Test-Path -LiteralPath $localRoot)) {
        New-Item -ItemType Directory -Path $localRoot | Out-Null
    }
    # Keeps the Godot editor from importing the backend sources and the build output.
    $gdignore = Join-Path $localRoot '.gdignore'
    if (-not (Test-Path -LiteralPath $gdignore)) {
        New-Item -ItemType File -Path $gdignore | Out-Null
    }
}

# The process named in ted.pid, or $null. A PID that is gone or that belongs to any other
# executable than our own ted.exe is not ours and is never touched.
function Get-OwnInstance {
    if (-not (Test-Path -LiteralPath $pidFile)) { return $null }
    $id = 0
    if (-not [int]::TryParse([System.IO.File]::ReadAllText($pidFile).Trim(), [ref]$id)) { return $null }
    $process = Get-Process -Id $id -ErrorAction SilentlyContinue
    if (-not $process) { return $null }
    if (-not [string]::Equals($process.Path, $tedExe, [System.StringComparison]::OrdinalIgnoreCase)) { return $null }
    return $process
}

function Remove-PidFile {
    if (Test-Path -LiteralPath $pidFile) {
        Remove-Item -LiteralPath (Assert-InsideLocal $pidFile) -Force
    }
}

# GET /v2/health, bypassing any system proxy. Returns @{ Ok; Text }.
function Get-Health {
    $request = [System.Net.WebRequest]::Create($healthUrl)
    $request.Proxy = $null
    $request.Timeout = 3000
    try {
        $response = $request.GetResponse()
        try {
            $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
            return @{ Ok = $true; Text = "$([int]$response.StatusCode) $($reader.ReadToEnd())" }
        } finally {
            $response.Close()
        }
    } catch {
        return @{ Ok = $false; Text = "no answer ($($_.Exception.GetBaseException().Message))" }
    }
}

function Test-PortListening([int]$port) {
    $listeners = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
    return [bool]($listeners | Where-Object { $_.Port -eq $port })
}

function Write-LogTail {
    if (Test-Path -LiteralPath $logFile) {
        Write-Host "--- last lines of $logFile"
        Get-Content -LiteralPath $logFile -Tail 20 | ForEach-Object { Write-Host $_ }
    }
}

# HEAD and uncommitted paths of the backend repo. Read only: --no-optional-locks keeps
# `git status` from refreshing (that is: writing) the index over there.
function Get-BackendState {
    $state = @{ Head = 'unknown'; Dirty = @() }
    if (Get-Command git.exe -ErrorAction SilentlyContinue) {
        $head = & git.exe --no-optional-locks -C $backendRepo rev-parse HEAD
        if ($LASTEXITCODE -eq 0 -and $head) { $state.Head = ([string]$head).Trim() }
        $state.Dirty = @(& git.exe --no-optional-locks -C $backendRepo status --porcelain)
    }
    return $state
}

# info.version of an OpenAPI file, without a YAML parser.
function Get-SpecVersion([string]$file) {
    $inInfo = $false
    foreach ($line in [System.IO.File]::ReadAllLines($file)) {
        if ($line -match '^info:') { $inInfo = $true; continue }
        if (-not $inInfo) { continue }
        if ($line -match '^\S') { break }
        if ($line -match '^\s+version:\s*(\S+)') { return $Matches[1].Trim('"', "'") }
    }
    return 'unknown'
}

function Invoke-Sync {
    $source = [System.IO.Path]::GetFullPath($backendRepo).TrimEnd('\')
    if (-not (Test-Path -LiteralPath (Join-Path $source 'Cargo.toml'))) {
        throw "backend repo not found: $source"
    }
    Initialize-LocalRoot
    $destination = Assert-InsideLocal $srcDir
    if (($source + '\').StartsWith([System.IO.Path]::GetFullPath($repoRoot).TrimEnd('\') + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "refusing to sync: the source '$source' lies inside this repo"
    }
    $before = Get-BackendState

    # robocopy <source> <destination>. /MIR deletes only below <destination>, which the guard
    # above pinned to .local-backend\src. Never add /MOV or /MOVE: they delete from the source.
    # Left out: build output, git data and what the backend .gitignore lists as runtime files.
    $options = @(
        '/MIR', '/XJ', '/R:2', '/W:1', '/NP', '/NFL', '/NDL', '/NJH',
        '/XD', (Join-Path $source 'target'), (Join-Path $source '.git'), (Join-Path $source 'run'), 'node_modules'
    )
    & robocopy.exe $source $destination @options
    $code = $LASTEXITCODE
    if ($code -ge 8) {
        throw "robocopy failed (exit code $code); SNAPSHOT.txt not updated"
    }

    $after = Get-BackendState
    $moved = ($before.Head -ne $after.Head) -or (($before.Dirty -join "`n") -ne ($after.Dirty -join "`n"))
    $lines = @(
        "backend_repo:        $source",
        "backend_commit:      $($after.Head)",
        "worktree_dirty:      $(if ($after.Dirty.Count -gt 0) { "yes ($($after.Dirty.Count) uncommitted paths)" } else { 'no' })",
        "changed_during_copy: $(if ($moved) { 'yes (commit or status changed while copying: sync again)' } else { 'no' })",
        "openapi_version:     $(Get-SpecVersion (Join-Path $destination 'openapi.yaml'))",
        "synced_at:           $((Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz'))"
    )
    if ($after.Dirty.Count -gt 0) {
        $lines += 'uncommitted paths (git status --porcelain, first 20):'
        $lines += $after.Dirty | Select-Object -First 20 | ForEach-Object { "  $_" }
    }
    [System.IO.File]::WriteAllLines($snapshotFile, [string[]]$lines)
    Write-Host "--- $snapshotFile"
    $lines | ForEach-Object { Write-Host $_ }
}

function Invoke-Build {
    if (-not (Test-Path -LiteralPath (Join-Path $srcDir 'Cargo.toml'))) {
        throw "no source copy yet: run 'sync' first"
    }
    if (Get-OwnInstance) {
        throw "the instance is running and Windows locks its ted.exe: run 'stop' first"
    }
    # PATH addition from the backend CLAUDE.md. A missing toolchain stops the build; nothing gets installed.
    $cargoBin = Join-Path $env:USERPROFILE '.cargo\bin'
    $mingwBin = Join-Path $env:LOCALAPPDATA 'Programs\winlibs\mingw64\bin'
    foreach ($tool in @((Join-Path $cargoBin 'cargo.exe'), (Join-Path $mingwBin 'gcc.exe'))) {
        if (-not (Test-Path -LiteralPath $tool)) {
            throw "toolchain missing: $tool (see the backend CLAUDE.md; this script installs nothing)"
        }
    }
    $env:Path = "$cargoBin;$mingwBin;$env:Path"
    $env:CARGO_TARGET_DIR = $targetDir
    $env:RUSTUP_AUTO_INSTALL = '0'

    $watch = [System.Diagnostics.Stopwatch]::StartNew()
    Push-Location -LiteralPath $srcDir
    try {
        # cargo reports progress on stderr; with 'Stop' a caller's 2>&1 would abort on its first line.
        $ErrorActionPreference = 'Continue'
        & cargo.exe build --release --locked -j $buildJobs -p ted -p tedctl
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = 'Stop'
        Pop-Location
    }
    $watch.Stop()
    $elapsed = '{0:mm\:ss} ({1} s)' -f $watch.Elapsed, [int]$watch.Elapsed.TotalSeconds
    if ($code -ne 0) {
        throw "cargo build failed (exit code $code) after $elapsed"
    }
    Write-Host "build ok in $elapsed -> $tedExe"
}

function Invoke-Start {
    Initialize-LocalRoot
    $own = Get-OwnInstance
    if ($own) {
        Write-Host "already running (PID $($own.Id)) on http://127.0.0.1:$apiPort - not starting a second one"
        Write-Host "health: $((Get-Health).Text)"
        return
    }
    if (-not (Test-Path -LiteralPath $tedExe)) { throw "ted.exe not built yet: run 'build' first" }
    if (-not (Test-Path -LiteralPath $gameData)) { throw "game data missing: $gameData (run 'sync')" }
    foreach ($port in @($apiPort, $adminPort)) {
        if (Test-PortListening $port) {
            throw "port $port is already in use by another process; nothing started"
        }
    }
    foreach ($path in @($tedExe, $dataDir, $gameData, $logFile)) {
        if ($path -match '[%&^!<>|"]') { throw "path contains a character cmd.exe would misread: $path" }
    }
    if (-not (Test-Path -LiteralPath $dataDir)) {
        New-Item -ItemType Directory -Path $dataDir | Out-Null
    }

    # Started through a hidden cmd.exe that redirects into the log. Start-Process with its own
    # redirection would hand ted the caller's pipes, and a tool call that started it would hang.
    $tedArgs = "--listen 127.0.0.1:$apiPort --data-dir `"$dataDir`" --gamedata `"$gameData`" --admin-listen 127.0.0.1:$adminPort"
    $shellArgs = "/d /c `"`"$tedExe`" $tedArgs > `"$logFile`" 2>&1`""
    $shell = Start-Process -FilePath $env:ComSpec -ArgumentList $shellArgs -WorkingDirectory $localRoot -WindowStyle Hidden -PassThru
    $null = $shell.Handle

    $ted = $null
    for ($i = 0; $i -lt 50 -and -not $ted -and -not $shell.HasExited; $i++) {
        Start-Sleep -Milliseconds 100
        $ted = Get-CimInstance Win32_Process -Filter "ParentProcessId = $($shell.Id) AND Name = 'ted.exe'" |
            Select-Object -First 1
    }
    if (-not $ted) {
        Write-LogTail
        throw 'ted did not start (see the log lines above)'
    }
    [System.IO.File]::WriteAllText($pidFile, "$($ted.ProcessId)`r`n")

    $deadline = (Get-Date).AddSeconds($startTimeoutSec)
    $health = @{ Ok = $false; Text = 'not asked yet' }
    while (-not $health.Ok -and (Get-Date) -lt $deadline) {
        if (-not (Get-OwnInstance)) {
            Remove-PidFile
            Write-LogTail
            $null = $shell.WaitForExit(2000)
            throw "ted exited during start-up (exit code $($shell.ExitCode); see the log lines above)"
        }
        $health = Get-Health
        if (-not $health.Ok) { Start-Sleep -Milliseconds 500 }
    }
    if (-not $health.Ok) {
        throw "$healthUrl gave $($health.Text) for $startTimeoutSec s; ted (PID $($ted.ProcessId)) is left running, see $logFile"
    }
    Write-Host "started (PID $($ted.ProcessId)) on http://127.0.0.1:$apiPort, admin endpoint 127.0.0.1:$adminPort"
    Write-Host "health: $($health.Text)"
    Write-Host "log: $logFile"
}

function Invoke-Stop {
    $own = Get-OwnInstance
    if (-not $own) {
        Remove-PidFile
        Write-Host 'not running'
        return
    }
    # Hard kill of exactly this PID, so no final snapshot. Answered commands survive (ted journals
    # before it answers); the game clock falls back to the last journal record (idle tick: 30 s).
    Stop-Process -Id $own.Id -Force
    if (-not $own.WaitForExit(10000)) {
        throw "PID $($own.Id) did not exit within 10 s"
    }
    Remove-PidFile
    Write-Host "stopped (PID $($own.Id))"
}

function Invoke-Status {
    $own = Get-OwnInstance
    if ($own) {
        Write-Host "running: yes (PID $($own.Id), since $($own.StartTime.ToString('yyyy-MM-dd HH:mm:ss')))"
    } else {
        Write-Host 'running: no'
    }
    Write-Host "api:     http://127.0.0.1:$apiPort   (admin endpoint for tedctl: 127.0.0.1:$adminPort)"
    $health = Get-Health
    Write-Host "health:  $($health.Text)"
    Write-Host "--- $snapshotFile"
    if (Test-Path -LiteralPath $snapshotFile) {
        Write-Host ([System.IO.File]::ReadAllText($snapshotFile).TrimEnd())
    } else {
        Write-Host "(none yet: run 'sync')"
    }
    if (-not ($own -and $health.Ok)) { exit 1 }
}

function Invoke-Reset {
    Invoke-Stop
    $directory = Assert-InsideLocal $dataDir
    if (Test-Path -LiteralPath $directory) {
        $links = @(Get-ChildItem -LiteralPath $directory -Recurse -Force |
                Where-Object { ($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0 })
        if ($links.Count -gt 0) {
            throw "refusing to empty '$directory': it contains a junction or symlink ($($links[0].FullName))"
        }
        foreach ($entry in @(Get-ChildItem -LiteralPath $directory -Force)) {
            Remove-Item -LiteralPath (Assert-InsideLocal $entry.FullName) -Recurse -Force
        }
    }
    Write-Host "data directory emptied: $directory (the next 'start' creates a new world)"
}

try {
    switch ($Command) {
        'sync' { Invoke-Sync }
        'build' { Invoke-Build }
        'start' { Invoke-Start }
        'stop' { Invoke-Stop }
        'status' { Invoke-Status }
        'reset' { Invoke-Reset }
        default {
            Write-Host 'usage: dev-backend.ps1 sync|build|start|stop|status|reset'
            exit 2
        }
    }
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
    exit 1
}
exit 0
