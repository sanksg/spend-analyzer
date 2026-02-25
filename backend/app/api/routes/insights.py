"""
API Routes for Phase 2 Insights (Subscriptions, Analysis).
"""

from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.db.session import get_db
from app.db.models import Subscription
from app.api.schemas import SubscriptionResponse, SubscriptionUpdate
from app.insights.subscriptions import sync_subscriptions_to_db
from app.insights.engine import analyze_question
from app.insights.anomalies import detect_anomalies
from app.insights.fees import analyze_fees
from app.insights.triggers import detect_triggers

router = APIRouter()

# --- Subscriptions ---

@router.post("/subscriptions/scan", response_model=Dict[str, int])
def scan_subscriptions(db: Session = Depends(get_db)):
    """Trigger a full rescan for subscriptions based on transaction history."""
    count = sync_subscriptions_to_db(db)
    return {"data": count, "message": f"Found {count} new subscriptions"}

@router.get("/subscriptions", response_model=List[SubscriptionResponse])
def get_subscriptions(db: Session = Depends(get_db)):
    """
    Get all detected subscriptions.
    Auto-runs detection if the table is empty (first visit).
    """
    existing = db.query(Subscription).count()
    if existing == 0:
        sync_subscriptions_to_db(db)
    return db.query(Subscription).order_by(Subscription.kind, Subscription.merchant).all()


@router.patch("/subscriptions/{subscription_id}", response_model=SubscriptionResponse)
def update_subscription(
    subscription_id: int,
    update: SubscriptionUpdate,
    db: Session = Depends(get_db),
):
    """Update a subscription (confirm/dismiss/change kind)."""
    sub = db.query(Subscription).filter(Subscription.id == subscription_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")

    if update.active is not None:
        sub.active = update.active
    if update.kind is not None:
        sub.kind = update.kind
    if update.user_confirmed is not None:
        sub.user_confirmed = update.user_confirmed
    if update.cadence is not None:
        sub.cadence = update.cadence

    db.commit()
    db.refresh(sub)
    return sub


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


@router.get("/triggers")
def get_triggers(month: str = None, db: Session = Depends(get_db)):
    """Get behavioral triggers for a given month (default: current)."""
    return detect_triggers(db, current_month=month)


@router.get("/subscriptions/summary")
def get_subscription_summary(db: Session = Depends(get_db)):
    """Get aggregated subscription + EMI summary."""
    all_subs = db.query(Subscription).filter(Subscription.active == True).all()
    subs = [s for s in all_subs if (s.kind or "subscription") == "subscription"]
    emis = [s for s in all_subs if (s.kind or "subscription") == "installment"]
    possible_emis = [s for s in all_subs if (s.kind or "subscription") == "possible_installment"]
    return {
        "subscription_count": len(subs),
        "subscription_monthly": sum(float(s.amount) for s in subs if (s.cadence or "").lower() == "monthly"),
        "emi_count": len(emis),
        "emi_monthly": sum(float(s.amount) for s in emis if (s.cadence or "").lower() == "monthly"),
        "possible_emi_count": len(possible_emis),
        "possible_emi_monthly": sum(
            float(s.amount) for s in possible_emis if (s.cadence or "").lower() == "monthly"
        ),
        "total_monthly_committed": sum(
            float(s.amount)
            for s in (subs + emis)
            if (s.cadence or "").lower() == "monthly"
        ),
    }


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
