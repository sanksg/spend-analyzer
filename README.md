# Spend Analyzer

Local-first app to upload credit card statement PDFs, parse transactions with Gemini, categorize spend, and view analytics.

## Fastest Way to Run (Recommended)

Use Docker + one-click scripts.

1. Install Docker Desktop (one-time):
	- https://www.docker.com/products/docker-desktop/
2. Create `.env` from `.env.example` and set `GEMINI_API_KEY`.
3. Start the app:
	- Windows: `./start.ps1`
	- macOS: `./start.sh`

Open:
- Frontend: http://localhost:5173
- Backend: http://localhost:8000
- API Docs: http://localhost:8000/docs

Stop the app:
- Windows: `./stop.ps1`
- macOS: `./stop.sh`

## Detailed Step-by-Step Instructions

For dead-simple setup instructions (including Docker installation and troubleshooting), see:

- [INSTRUCTIONS.md](INSTRUCTIONS.md)

## Manual Dev Setup (Optional)

If you prefer local Python/Node setup instead of Docker, see the project guide in [AGENTS.md](AGENTS.md).

## Environment Variable

| Variable | Description | Required |
|----------|-------------|----------|
| `GEMINI_API_KEY` | Google Gemini API key for parsing + Ask-Data | Yes |

