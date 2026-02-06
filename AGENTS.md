# Spend Analyzer - Implementation Guide

## Overview
A local-first web app to upload credit card statement PDFs, parse transactions using Google Gemini Flash, categorize spending, and visualize reports.

## Tech Stack
- **Backend**: Python 3.11+, FastAPI, SQLAlchemy, SQLite, pdfplumber
- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS, Chart.js
- **PDF Parsing**: pdfplumber (text extraction) + Google Gemini Flash API (AI parsing)
- **Taxonomy**: Plaid Transaction Categories (CSV)

## Architecture & Parsing Pipeline

### High-Level Architecture
The system is designed as a **local-first web application**.
- **Frontend**: A React SPA that handles uploads, visualization, and manual corrections.
- **Backend**: A FastAPI server that manages the database, file storage, and the heavy-lifting of parsing.
- **Async Workers**: Parsing tasks are offloaded to background threads (using `FastAPI BackgroundTasks`) to prevent blocking the UI during long-running PDF processing.

### The PDF Processing Pipeline
1. **Ingestion**: User uploads a PDF. File hash is calculated to prevent duplicates.
2. **Text Extraction**: `pdfplumber` extracts raw text from the PDF. We generally prefer raw text extraction over OCR for speed and accuracy on digital-native PDFs.
3. **AI Parsing (Gemini Flash)**: The raw, unstructured text is sent to Google's Gemini 1.5 Flash model.
   - **Why use an LLM?**
     - **Variability**: Bank statement formats change frequently and differ significantly between institutions. Writing regex parsers for every format is brittle and high-maintenance.
     - **Context**: The LLM understands context (ignoring ads, headers, or terms and conditions) better than rule-based systems.
     - **Normalization**: It can handle date formats (DD/MM/YYYY vs MM/DD/YYYY) and merchant name cleanup "for free".
4. **Strict Categorization**: 
   - We inject the *entire list of valid Plaid categories* into the LLM prompt.
   - The LLM is instructed to match transactions to these exact strings or return "Other".
   - This "Constrained Decoding" approach ensures database consistency without hallucinated categories.
5. **Deduplication & Storage**: Transactions are hashed (Date + Desc + Amount) to prevent duplicates if the same statement is re-uploaded.

## Project Structure
```
casparser/
├── backend/
│   ├── app/
│   │   ├── api/routes/        # FastAPI endpoints
│   │   ├── db/                # SQLAlchemy models & session
│   │   ├── parsing/           # PDF extraction & Gemini client
│   │   ├── jobs/              # Background job runner
│   │   ├── storage/           # File storage utilities
│   │   ├── config.py          # Settings
│   │   └── main.py            # FastAPI app
│   ├── data/                  # Uploads & artifacts (gitignored)
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/               # API client
│   │   ├── pages/             # React pages
│   │   ├── App.tsx
│   │   └── types.ts
│   └── package.json
└── README.md
```

## Key Components

### Backend
1. **PDF Parsing Pipeline** (`app/parsing/`)
   - `pdf_extract.py`: Extract text/tables from PDFs using pdfplumber
   - `gemini_client.py`: Send text to Gemini Flash, parse JSON response
   - `schemas.py`: Pydantic schemas for parsed transactions

2. **Categorization & Taxonomy**
   - `app/utils/plaid_taxonomy.py`: Parses the Plaid CSV taxonomy
   - `transactions-personal-finance-category-taxonomy.csv`: Source of truth for categories
   - `app/jobs/runner.py`: Enforces strict category matching (resolved against DB)

3. **Database Models** (`app/db/models.py`)
   - `Statement`: Uploaded PDF metadata
   - `Transaction`: Parsed transaction records
   - `Category`: Spending categories (Synced with Plaid taxonomy)
   - `ParseJob`: Background parsing job status
   - `CategoryRule`: Auto-categorization rules

4. **API Routes** (`app/api/routes/`)
   - `statements.py`: Upload, list, delete statements
   - `transactions.py`: CRUD, bulk categorize, approve
   - `categories.py`: Manage categories, rules, and Plaid import (`POST /import-plaid`)
   - `analytics.py`: Spending summaries and trends

### Scripts
- `scripts/import_plaid_and_reclassify.py`: Utility to reset the DB to Plaid taxonomy and re-process all statements.

### Frontend
1. **Pages** (`src/pages/`)
   - `Dashboard.tsx`: Charts and spending overview
   - `Upload.tsx`: Drag-and-drop PDF upload
   - `Statements.tsx`: List all uploaded statements
   - `StatementDetail.tsx`: View statement transactions
   - `Transactions.tsx`: Filter, search, categorize transactions
   - `Categories.tsx`: Manage spending categories

## Running Locally

### Backend
```bash
cd backend
venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env  # Add your GEMINI_API_KEY
uvicorn app.main:app --reload --port 8000
```
## Python Virtual Environment
**IMPORTANT** Before running any python code, you need to go into the backend folder and activate the venv environment in .venv folder. Use followin commands:
> `cd backend`
> `.venv\Scripts\activate` for windows
> `source .venv/Scripts/activate` for linux
after that you should be able to run any python code in this environment

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Development Notes
- **Strict Categorization**: The system uses a strict "Plaid" taxonomy. The LLM is provided with the list of valid categories during parsing and instructed to match them exactly.
- **Auto-Coloring**: Categories are automatically colored based on their primary group (e.g., INCOME = Green, FOOD_AND_DRINK = Orange) during import.
- **Reclassification Workflow**: Changing the taxonomy (via `POST /import-plaid` or script) triggers a background re-parse of ALL statements to ensure data consistency.
- **Gemini Flash**: Used for parsing—statement data is sent to Google's API.
- **Background Tasks**: Parsing runs as background tasks; check job status for completion.
- **Review System**: Transactions with low confidence or "Other" category are flagged for manual review.
- **Duplicate Detection**: Duplicate statements detected by file hash; duplicate transactions detected by hash of (date + desc + amount).


## Python Virtual Environment
**IMPORTANT** Before running any python code, you need to go into the backend folder and activate the venv environment in .venv folder. Use followin commands:
> `cd backend`
> `.venv\Scripts\activate` for windows
> `source .venv/Scripts/activate` for linux
after that you should be able to run any python code in this environment

**IMPORTANT**: For frontend work and for accessing npm or node, you need to be in the frontend folder.

## Repository

- **Do not commit secrets**: Never commit `.env`, API keys, or credentials. Use the `.env` file locally and ensure it's in `.gitignore`.
- **Avoid large binaries**: Do not add PDF files or uploaded data to the repository. The `.gitignore` excludes `*.pdf`, `backend/data/`, and `uploads/`.
- **Branching**: Create feature branches for Phase 2 work (e.g., `feat/insights-subscriptions`).
- **Initial commit**: The repository contains application code only; run `git status` to verify ignored files before committing.

Quick git commands:

```bash
git init
git add .
git status --ignored
git commit -m "chore: initial import of Spend Analyzer code"
```
