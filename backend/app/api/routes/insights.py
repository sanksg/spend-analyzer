"""
API Routes for Phase 2 Insights (Subscriptions, Analysis).
"""

from typing import List, Dict, Any
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.db.session import get_db
from app.db.models import Subscription
from app.api.schemas import SubscriptionResponse
from app.insights.subscriptions import sync_subscriptions_to_db
from app.insights.engine import analyze_question
from app.insights.anomalies import detect_anomalies
from app.insights.fees import analyze_fees

router = APIRouter()

# --- Subscriptions ---

@router.post("/subscriptions/scan", response_model=Dict[str, int])
def scan_subscriptions(db: Session = Depends(get_db)):
    """Trigger a scan for subscriptions based on transaction history."""
    count = sync_subscriptions_to_db(db)
    return {"data": count, "message": f"Found {count} new subscriptions"}

@router.get("/subscriptions", response_model=List[SubscriptionResponse])
def get_subscriptions(db: Session = Depends(get_db)):
    """Get all detected subscriptions."""
    # Filter by kind if needed, or return all
    return db.query(Subscription).all()


# --- Fees & Taxes ---

@router.get("/fees")
def get_fees_analysis(db: Session = Depends(get_db)):
    """Get analysis of fees and taxes."""
    return analyze_fees(db)


# --- Anomalies ---

@router.get("/anomalies")
def get_anomalies_analysis(min_amount: float = 0, db: Session = Depends(get_db)):
    """Get detected anomalies."""
    return detect_anomalies(db, min_amount)


# --- Analysis (Ask your data) ---

class AnalysisRequest(BaseModel):
    question: str

class AnalysisResponse(BaseModel):
    answer: str
    generated_sql: str
    raw_data: List[Dict[str, Any]]

@router.post("/analyze", response_model=AnalysisResponse)
async def ask_data(request: AnalysisRequest, db: Session = Depends(get_db)):
    """
    Ask a natural language question about your financial data.
    Uses LLM (Text-to-SQL) to query the database.
    """
    result = await analyze_question(db, request.question)
    return result
