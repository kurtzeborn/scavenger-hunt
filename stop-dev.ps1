<#
.SYNOPSIS
    Stop all local development services.

.DESCRIPTION
    Stops Azurite and Azure Functions running in WSL.
#>

Write-Host "`n🛑 Stopping development services..." -ForegroundColor Yellow

# Kill WSL processes
wsl -d Ubuntu-22.04 -- bash -c "pkill -f azurite 2>/dev/null; pkill -f 'func start' 2>/dev/null" 2>$null

# Stop any PowerShell background jobs
Get-Job | Stop-Job -ErrorAction SilentlyContinue
Get-Job | Remove-Job -ErrorAction SilentlyContinue

Write-Host "   ✓ All services stopped" -ForegroundColor Green
