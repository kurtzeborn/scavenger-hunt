<#
.SYNOPSIS
    Stop all local development services.

.DESCRIPTION
    Stops Azurite and Azure Functions running in WSL.

.PARAMETER CleanData
    Delete all Azurite data (tables, blobs, queues) for a fresh start.

.EXAMPLE
    .\stop-dev.ps1

.EXAMPLE
    .\stop-dev.ps1 -CleanData
#>

param(
    [switch]$CleanData
)

Write-Host "`nStopping development services..." -ForegroundColor Yellow

# Kill WSL processes
wsl -d Ubuntu-22.04 -- bash -c "pkill -f azurite 2>/dev/null; pkill -f func 2>/dev/null" 2>$null

# Stop any PowerShell background jobs
Get-Job | Stop-Job -ErrorAction SilentlyContinue
Get-Job | Remove-Job -ErrorAction SilentlyContinue

Write-Host "   OK: All services stopped" -ForegroundColor Green

# Clean data if requested
if ($CleanData) {
    Write-Host "`nCleaning Azurite data..." -ForegroundColor Yellow
    wsl -d Ubuntu-22.04 -- bash -c "rm -rf ~/azurite-data/*" 2>$null
    Write-Host "   OK: Data cleaned - next start will be fresh" -ForegroundColor Green
}
