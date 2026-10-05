param(
    [switch]$NoBrowser,
    [switch]$Install
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$FrontendDir = Join-Path $Root "frontend"
$ExtensionDir = Join-Path $Root "extension"
$BackendLog = Join-Path $Root "backend-dev.log"
$FrontendLog = Join-Path $Root "frontend-dev.log"
$BackendUrl = "http://127.0.0.1:8000/api/health"
$FrontendUrl = "http://127.0.0.1:5173/"

function Quote-PowerShellString([string]$Value) {
    return "'" + $Value.Replace("'", "''") + "'"
}

function Get-PortProcessId([int]$Port) {
    $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    return @($connections | Where-Object { $_.OwningProcess -gt 0 } | Select-Object -ExpandProperty OwningProcess -Unique)
}

function Wait-HttpOk([string]$Url, [int]$Seconds) {
    for ($i = 0; $i -lt $Seconds; $i++) {
        try {
            Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 | Out-Null
            return $true
        } catch {
            Start-Sleep -Seconds 1
        }
    }
    return $false
}

function Invoke-Step([string]$Title, [scriptblock]$Command) {
    & $Command
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "$Title failed (exit code $LASTEXITCODE)." -ForegroundColor Red
        Write-Host "If downloads time out, switch npm to a mirror and run this script again:" -ForegroundColor Yellow
        Write-Host "  npm config set registry https://registry.npmmirror.com" -ForegroundColor Yellow
        exit 1
    }
}

function Start-HiddenPowerShell([string]$Command) {
    Start-Process powershell -WindowStyle Hidden -ArgumentList @(
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        $Command
    ) | Out-Null
}

function Test-PythonHasBackend([string]$Python) {
    $ErrorActionPreference = "Continue"
    try {
        & $Python -c "import fastapi, uvicorn" 2>$null | Out-Null
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    }
}

# Double-clicking the .bat does not activate conda, so `python` may be missing or a different Python.
# Look for a Python that has the backend's packages, and remember it for next time.
function Find-Python {
    $saved = Join-Path $Root ".python-path"
    $candidates = @()
    if ($env:JOB_AGENT_PYTHON) { $candidates += $env:JOB_AGENT_PYTHON }
    if (Test-Path $saved) { $candidates += (Get-Content $saved -Raw).Trim() }
    if ($env:CONDA_PREFIX) { $candidates += (Join-Path $env:CONDA_PREFIX "python.exe") }
    foreach ($name in @("python", "python3", "py")) {
        foreach ($command in @(Get-Command $name -All -ErrorAction SilentlyContinue)) { $candidates += $command.Source }
    }
    $bases = @(
        "$env:USERPROFILE\anaconda3", "$env:USERPROFILE\miniconda3", "$env:LOCALAPPDATA\anaconda3", "$env:LOCALAPPDATA\miniconda3",
        "$env:ProgramData\anaconda3", "$env:ProgramData\miniconda3", "C:\anaconda3", "C:\miniconda3", "D:\anaconda3", "D:\miniconda3", "E:\anaconda3", "E:\miniconda3"
    )
    foreach ($base in $bases) { $candidates += (Join-Path $base "python.exe") }
    foreach ($version in @("313", "312", "311")) { $candidates += "$env:LOCALAPPDATA\Programs\Python\Python$version\python.exe" }

    $existing = @($candidates | Where-Object { $_ -and ($_ -notlike "*WindowsApps*") -and (Test-Path $_) } | Select-Object -Unique)
    foreach ($candidate in $existing) {
        if (Test-PythonHasBackend $candidate) {
            Set-Content -Path $saved -Value $candidate -Encoding UTF8
            return $candidate
        }
    }
    # A Python without the packages: install them once.
    if ($existing.Count -gt 0) {
        $python = $existing[0]
        Write-Host "Installing backend dependencies into $python ..." -ForegroundColor Yellow
        & $python -m pip install -e $Root | Out-Host
        if (Test-PythonHasBackend $python) {
            Set-Content -Path $saved -Value $python -Encoding UTF8
            return $python
        }
    }
    return $null
}

Set-Location -LiteralPath $Root

Write-Host "AI Job Application Agent quick start" -ForegroundColor Cyan
Write-Host "Project: $Root"

if ($Install) {
    Write-Host "Installing backend dependencies..." -ForegroundColor Yellow
    $installPython = Find-Python
    if ($installPython) { Invoke-Step "Installing backend dependencies" { & $installPython -m pip install -e . } }
}

if ($Install -or -not (Test-Path (Join-Path $FrontendDir "node_modules"))) {
    Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
    Push-Location $FrontendDir
    Invoke-Step "Installing frontend dependencies" { npm install }
    Pop-Location
}

# Rebuild the extension on every start (takes about a second), so a `git pull` is picked up.
Write-Host "Building the browser extension..." -ForegroundColor Yellow
Push-Location $ExtensionDir
if ($Install -or -not (Test-Path (Join-Path $ExtensionDir "node_modules"))) {
    Invoke-Step "Installing extension build tools" { npm install }
}
Invoke-Step "Building the browser extension" { npm run build }
Pop-Location
if (-not (Test-Path (Join-Path $ExtensionDir "dist\manifest.json"))) {
    Write-Host "The extension was not built: extension\dist\manifest.json is missing." -ForegroundColor Red
    exit 1
}

# Restart our own backend so updated code is used (it runs hidden, so there is no window to close).
foreach ($procId in Get-PortProcessId 8000) {
    $commandLine = (Get-CimInstance Win32_Process -Filter "ProcessId = $procId" -ErrorAction SilentlyContinue).CommandLine
    if ($commandLine -and $commandLine -match "backend\.app\.api") {
        Write-Host "Restarting the backend (PID $procId) to load the latest code..." -ForegroundColor Yellow
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
}
for ($i = 0; $i -lt 10 -and (Get-PortProcessId 8000).Count -gt 0; $i++) { Start-Sleep -Milliseconds 500 }

$backendPids = Get-PortProcessId 8000
if ($backendPids.Count -eq 0) {
    $python = Find-Python
    if (-not $python) {
        Write-Host "No Python with the backend packages was found." -ForegroundColor Red
        Write-Host "Open 'Anaconda Prompt' (or a terminal where python works), then run:" -ForegroundColor Yellow
        Write-Host "  cd /d `"$Root`"" -ForegroundColor Yellow
        Write-Host "  python -m pip install -e ." -ForegroundColor Yellow
        Write-Host "  python -c `"import sys; print(sys.executable)`" > .python-path" -ForegroundColor Yellow
        Write-Host "and double-click start-webui.bat again." -ForegroundColor Yellow
        exit 1
    }
    Write-Host "Starting backend on http://127.0.0.1:8000 (Python: $python) ..." -ForegroundColor Yellow
    $rootArg = Quote-PowerShellString $Root
    $backendLogArg = Quote-PowerShellString $BackendLog
    $pythonDir = Split-Path -Parent $python
    # Conda Pythons need their Library\bin on PATH (ssl and other DLLs) when not activated.
    $pathArg = Quote-PowerShellString "$pythonDir;$pythonDir\Library\bin;$pythonDir\Scripts;$env:PATH"
    $pythonArg = Quote-PowerShellString $python
    Start-HiddenPowerShell "Set-Location -LiteralPath $rootArg; `$env:PATH = $pathArg; & $pythonArg -m backend.app.api *> $backendLogArg"
} else {
    Write-Host "Port 8000 is used by another program (PID: $($backendPids -join ', ')). Close it and run this script again." -ForegroundColor Red
}

$frontendPids = Get-PortProcessId 5173
if ($frontendPids.Count -eq 0) {
    Write-Host "Starting frontend on http://127.0.0.1:5173 ..." -ForegroundColor Yellow
    $frontendArg = Quote-PowerShellString $FrontendDir
    $frontendLogArg = Quote-PowerShellString $FrontendLog
    Start-HiddenPowerShell "Set-Location -LiteralPath $frontendArg; npm run dev -- --host 127.0.0.1 *> $frontendLogArg"
} else {
    Write-Host "Frontend already running on port 5173. PID: $($frontendPids -join ', ')" -ForegroundColor Green
}

$backendReady = Wait-HttpOk $BackendUrl 30
$frontendReady = Wait-HttpOk $FrontendUrl 30

if (-not $backendReady) {
    Write-Host "Backend did not become ready. Last lines of $BackendLog :" -ForegroundColor Red
    if (Test-Path $BackendLog) { Get-Content $BackendLog -Tail 25 | ForEach-Object { Write-Host "  $_" } }
    Write-Host "Take a screenshot of this window and send it to the developer." -ForegroundColor Yellow
    exit 1
}

if (-not $frontendReady) {
    Write-Host "Frontend did not become ready. Check: $FrontendLog" -ForegroundColor Red
    exit 1
}

Write-Host "Ready: $FrontendUrl" -ForegroundColor Green
Write-Host "Browser extension folder (load unpacked in chrome://extensions or edge://extensions):" -ForegroundColor Cyan
Write-Host "  $(Join-Path $ExtensionDir 'dist')"
Write-Host "After an update, click the reload button on the extension card in chrome://extensions, then refresh the application page." -ForegroundColor Cyan

if (-not $NoBrowser) {
    Start-Process $FrontendUrl
}
