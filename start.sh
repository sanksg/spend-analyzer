#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed. Install Docker Desktop first:"
  echo "https://www.docker.com/products/docker-desktop/"
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker is installed but not running. Start Docker Desktop and try again."
  exit 1
fi

if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    echo "Created .env from .env.example"
    echo "Edit .env and set GEMINI_API_KEY, then run ./start.sh again."
    exit 0
  else
    echo "Missing .env and .env.example"
    exit 1
  fi
fi

docker compose up -d --build

echo ""
echo "Spend Analyzer is starting..."
echo "Frontend: http://localhost:5173"
echo "Backend:  http://localhost:8000"
echo "API Docs: http://localhost:8000/docs"
echo ""
echo "To stop: ./stop.sh"
