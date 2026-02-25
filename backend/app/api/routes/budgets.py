"""
API Routes for Budget management and status.
"""

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.db.session import get_db
from app.db.models import Budget, Transaction, Category
from app.api.schemas import (
    BudgetCreate,
    BudgetResponse,
    BudgetStatusItem,
    BudgetStatusResponse,
)

router = APIRouter()

THRESHOLDS = [80, 100, 120]


def _budget_to_response(budget: Budget) -> BudgetResponse:
    cat = budget.category
    return BudgetResponse(
        id=budget.id,
        scope=budget.scope,
        category_id=budget.category_id,
        category_name=cat.name if cat else None,
        category_color=cat.color if cat else None,
        monthly_limit=budget.monthly_limit,
        created_at=budget.created_at or datetime.utcnow(),
        updated_at=budget.updated_at or datetime.utcnow(),
    )


@router.get("/", response_model=List[BudgetResponse])
def list_budgets(db: Session = Depends(get_db)):
    """List all configured budgets."""
    budgets = db.query(Budget).all()
    return [_budget_to_response(b) for b in budgets]


@router.post("/", response_model=BudgetResponse)
def create_or_update_budget(body: BudgetCreate, db: Session = Depends(get_db)):
    """Create or update a budget.  Upsert on (scope, category_id)."""
    existing = (
        db.query(Budget)
        .filter(Budget.scope == body.scope, Budget.category_id == body.category_id)
        .first()
    )
    if existing:
        existing.monthly_limit = body.monthly_limit
        existing.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(existing)
        return _budget_to_response(existing)

    budget = Budget(
        scope=body.scope,
        category_id=body.category_id,
        monthly_limit=body.monthly_limit,
    )
    db.add(budget)
    db.commit()
    db.refresh(budget)
    return _budget_to_response(budget)


@router.delete("/{budget_id}")
def delete_budget(budget_id: int, db: Session = Depends(get_db)):
    """Delete a budget."""
    budget = db.query(Budget).filter(Budget.id == budget_id).first()
    if not budget:
        raise HTTPException(status_code=404, detail="Budget not found")
    db.delete(budget)
    db.commit()
    return {"ok": True}


@router.get("/status", response_model=BudgetStatusResponse)
def budget_status(
    month: Optional[str] = Query(None, description="YYYY-MM, defaults to current month"),
    db: Session = Depends(get_db),
):
    """
    Compute budget progress for a given month.
    Returns each budget with spent amount, percentage, and which thresholds are crossed.
    """
    if month:
        year, mon = int(month.split("-")[0]), int(month.split("-")[1])
    else:
        today = date.today()
        year, mon = today.year, today.month
        month = f"{year:04d}-{mon:02d}"

    # Month boundaries
    month_start = date(year, mon, 1)
    if mon == 12:
        month_end = date(year + 1, 1, 1)
    else:
        month_end = date(year, mon + 1, 1)

    budgets = db.query(Budget).all()
    items: List[BudgetStatusItem] = []

    for b in budgets:
        q = db.query(func.coalesce(func.sum(Transaction.amount), 0)).filter(
            Transaction.posted_date >= month_start,
            Transaction.posted_date < month_end,
            Transaction.excluded == False,
            Transaction.amount > 0,
        )
        if b.scope == "category" and b.category_id:
            q = q.filter(Transaction.category_id == b.category_id)

        spent = Decimal(str(q.scalar()))
        limit = b.monthly_limit or Decimal("1")
        pct = float(spent / limit * 100) if limit > 0 else 0.0
        crossed = [t for t in THRESHOLDS if pct >= t]

        cat = b.category
        items.append(
            BudgetStatusItem(
                budget_id=b.id,
                scope=b.scope,
                category_id=b.category_id,
                category_name=cat.name if cat else None,
                category_color=cat.color if cat else None,
                monthly_limit=b.monthly_limit,
                spent=spent,
                percent=round(pct, 1),
                thresholds_crossed=crossed,
            )
        )

    # Sort: over-budget first, then by percent descending
    items.sort(key=lambda i: -i.percent)

    return BudgetStatusResponse(month=month, items=items)
