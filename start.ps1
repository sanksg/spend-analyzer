$ErrorActionPreference = 'Stop'

Set-Location -Path $PSScriptRoot

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "Docker is not installed. Install Docker Desktop first:"
    Write-Host "https://www.docker.com/products/docker-desktop/"
    exit 1
}

try {
    docker info | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Docker is installed but not running. Start Docker Desktop and try again."
        exit 1
    }
} catch {
    Write-Host "Docker is installed but not running. Start Docker Desktop and try again."
    exit 1
}

if (-not (Test-Path ".env")) {
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        Write-Host "Created .env from .env.example"
        Write-Host "Please edit .env and set GEMINI_API_KEY, then run ./start.ps1 again."
        exit 0
    } else {
        Write-Host "Missing .env and .env.example"
        exit 1
    }
}

docker compose up -d --build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to start containers. Check Docker Desktop and run: docker compose logs"
    exit 1
}

Write-Host ""
Write-Host "Spend Analyzer is starting..."
Write-Host "Frontend: http://localhost:5173"
Write-Host "Backend:  http://localhost:8000"
Write-Host "API Docs: http://localhost:8000/docs"
Write-Host ""
Write-Host "To stop: ./stop.ps1"
