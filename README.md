# Spend Analyzer

A local-first web app to upload credit card statement PDFs, parse transactions using Google Gemini Flash, categorize spending, and visualize reports.

## Features

- 📄 Upload credit card statement PDFs
- 🤖 AI-powered transaction extraction (Gemini Flash)
- 🗄️ SQLite database for historical data
- 🏷️ Customizable spending categories
- 📊 Visual spending reports and dashboards

## Tech Stack

- **Backend**: Python 3.11+, FastAPI, SQLAlchemy, SQLite
- **Frontend**: React 18, Vite, TypeScript, Chart.js
- **PDF Parsing**: pdfplumber + Google Gemini Flash API

## Project Structure

```
casparser/
├── backend/
│   ├── app/
│   │   ├── api/           # FastAPI routes
│   │   ├── db/            # Database models & session
│   │   ├── parsing/       # PDF extraction & Gemini client
│   │   ├── jobs/          # Background job runner
│   │   └── main.py        # FastAPI app entry
│   ├── data/
│   │   ├── uploads/       # Uploaded PDF files
│   │   └── artifacts/     # Extracted text & images
│   ├── tests/             # pytest tests
│   ├── alembic/           # DB migrations
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── pages/         # React pages
│   │   ├── components/    # Reusable components
│   │   ├── api/           # API client
│   │   └── App.tsx
│   └── package.json
└── README.md
```

## Setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- Google Cloud API key with Gemini API enabled

### Backend Setup

```bash
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
pip install -r requirements.txt

# Set environment variable for Gemini API
set GEMINI_API_KEY=your-api-key-here

# Run database migrations
alembic upgrade head

# Start server
uvicorn app.main:app --reload --port 8000
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The app will be available at:
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

## Usage

1. Open http://localhost:5173
2. Upload a credit card statement PDF
3. Review and confirm extracted transactions
4. Assign categories to transactions
5. View spending analytics on the dashboard

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GEMINI_API_KEY` | Google Gemini API key | Yes |
| `DATABASE_URL` | SQLite path (default: `sqlite:///./data/spend.db`) | No |

## License

MIT
