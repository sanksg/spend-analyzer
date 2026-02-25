# Spend Analyzer (spend-analyzer) — Agent Guide

## What this is
Local-first web app to upload credit card statement PDFs, parse transactions with Google Gemini Flash, categorize spend using Plaid’s taxonomy, and show analytics.

## Stack
- **Backend**: Python 3.11+, FastAPI, SQLAlchemy, SQLite, pdfplumber, `uv` for package management
- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS, Chart.js
- **Taxonomy**: Plaid transaction category CSV (imported and enforced)

## Architecture (high level)
- **Frontend SPA** uploads PDFs and displays jobs/transactions/analytics.
- **FastAPI backend** stores statements + transactions in SQLite and manages file storage.
- **Parsing runs in background tasks** (FastAPI `BackgroundTasks`) so uploads don’t block.

## PDF parsing pipeline
1. **Upload & dedupe**: statement file hash prevents duplicate uploads.
2. **Extract text**: `pdfplumber` extracts raw text (preferred over OCR for digital PDFs).
3. **LLM parse**: extracted text is sent to **Gemini 1.5 Flash** and parsed as structured JSON.
4. **Strict categorization**: the full Plaid category list is injected into the prompt; model must choose an exact category string or fall back to `Other`.
5. **Transaction dedupe**: transaction hash of `(date + description + amount)` prevents re-ingestion.

## Where to look
- Backend entrypoint: `backend/app/main.py`
- API routes: `backend/app/api/routes/`
- DB models/session: `backend/app/db/`
- Parsing code: `backend/app/parsing/`
- Background runner: `backend/app/jobs/runner.py`
- Plaid taxonomy loader: `backend/app/utils/plaid_taxonomy.py`
- Frontend pages: `frontend/src/pages/`
- Frontend API client: `frontend/src/api/`

## Running locally

### Backend (Windows / Linux)
From repo root:
```bash
cd backend

# Activate venv (.venv)
.venv\Scripts\activate        # Windows
# source .venv/Scripts/activate  # Linux

uv pip install -r requirements.txt

# Configure Gemini key (file should remain uncommitted)
# Set GEMINI_API_KEY in backend/.env (or environment)

uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```
Always make sure you're in the frontend folder before running npm commands

## Development rules (important)
- **Python packages**: always activate `backend/.venv` first; use `uv pip install ...` (not `pip`).
- **Frontend commands**: run `npm ...` only from `frontend/`.
- **Secrets**: never commit `.env` / API keys.
- **Large files**: don’t commit PDFs or `backend/data/` artifacts/uploads.

## Behavior guarantees
- **Taxonomy is strict**: categories must match Plaid strings exactly (or `Other`).
- **Reclassification**: changing taxonomy/import triggers re-parse/reclassification to keep DB consistent.
