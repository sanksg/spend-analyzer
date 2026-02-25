$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "Docker is not installed."
    exit 1
}

docker compose down
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to stop containers. Run: docker compose ps"
    exit 1
}
Write-Host "Spend Analyzer stopped."
