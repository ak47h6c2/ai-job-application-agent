param(
    [switch]$NoBrowser,
    [switch]$Install
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$FrontendDir = Join-Path $Root "frontend"
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

function Start-HiddenPowerShell([string]$Command) {
    Start-Process powershell -WindowStyle Hidden -ArgumentList @(
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        $Command
    ) | Out-Null
}

Set-Location -LiteralPath $Root

Write-Host "AI Job Application Agent quick start" -ForegroundColor Cyan
Write-Host "Project: $Root"

if ($Install) {
    Write-Host "Installing backend dependencies..." -ForegroundColor Yellow
    python -m pip install -e .
    Write-Host "Installing Playwright browser runtime..." -ForegroundColor Yellow
    python -m playwright install chromium
}

if ($Install -or -not (Test-Path (Join-Path $FrontendDir "node_modules"))) {
    Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
    Push-Location $FrontendDir
    npm install
    Pop-Location
}

$backendPids = Get-PortProcessId 8000
if ($backendPids.Count -eq 0) {
    Write-Host "Starting backend on http://127.0.0.1:8000 ..." -ForegroundColor Yellow
    $rootArg = Quote-PowerShellString $Root
    $backendLogArg = Quote-PowerShellString $BackendLog
    Start-HiddenPowerShell "Set-Location -LiteralPath $rootArg; python -m backend.app.api *> $backendLogArg"
} else {
    Write-Host "Backend already running on port 8000. PID: $($backendPids -join ', ')" -ForegroundColor Green
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
    Write-Host "Backend did not become ready. Check: $BackendLog" -ForegroundColor Red
    exit 1
}

if (-not $frontendReady) {
    Write-Host "Frontend did not become ready. Check: $FrontendLog" -ForegroundColor Red
    exit 1
}

Write-Host "Ready: $FrontendUrl" -ForegroundColor Green

if (-not $NoBrowser) {
    Start-Process $FrontendUrl
}
