"""API routes for planning features (bills, cashflow, payoff)."""

import json
import uuid
from datetime import date, timedelta
from decimal import Decimal
from typing import Dict, List

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.schemas import (
    CashflowForecastResponse,
    CashflowPoint,
    PayoffPlanRequest,
    PayoffPlanResponse,
    RecommendationItem,
    RecommendationsResponse,
    SavingsGoalItem,
    SavingsGoalsResponse,
    SavingsGoalUpsertRequest,
    UpcomingBillItem,
    UpcomingBillsResponse,
    WeeklyActionItem,
    WeeklyActionsResponse,
)
from app.db.models import AppSettings, Budget, Subscription, Transaction
from app.db.session import get_db
from app.insights.planner import build_payoff_plan, daterange, next_due_date
from app.insights.fees import analyze_fees

router = APIRouter()
GOALS_SETTING_KEY = "savings_goals"


def _get_setting_decimal(db: Session, key: str, default: Decimal) -> Decimal:
    row = db.query(AppSettings).filter(AppSettings.key == key).first()
    if not row or row.value is None or row.value == "":
        return default
    try:
        return Decimal(str(row.value))
    except Exception:
        return default


def _get_setting_text(db: Session, key: str) -> str | None:
    row = db.query(AppSettings).filter(AppSettings.key == key).first()
    if not row or row.value in (None, ""):
        return None
    return row.value


def _set_setting_text(db: Session, key: str, value: str, value_type: str = "json"):
    row = db.query(AppSettings).filter(AppSettings.key == key).first()
    if row:
        row.value = value
        row.value_type = value_type
    else:
        db.add(AppSettings(key=key, value=value, value_type=value_type))
    db.commit()


def _load_goals(db: Session) -> List[dict]:
    raw = _get_setting_text(db, GOALS_SETTING_KEY)
    if not raw:
        return []
    try:
        payload = json.loads(raw)
        if isinstance(payload, list):
            return payload
    except Exception:
        return []
    return []


def _save_goals(db: Session, goals: List[dict]):
    _set_setting_text(db, GOALS_SETTING_KEY, json.dumps(goals), value_type="json")


@router.get("/upcoming-bills", response_model=UpcomingBillsResponse)
def upcoming_bills(
    days: int = Query(30, ge=7, le=120),
    db: Session = Depends(get_db),
):
    """Get upcoming recurring bills due in the next N days."""
    today = date.today()
    window_end = today + timedelta(days=days)
    subs = db.query(Subscription).filter(Subscription.active == True).all()

    items: List[UpcomingBillItem] = []
    for sub in subs:
        due = next_due_date(sub.last_seen, sub.cadence, today)
        if not due or due > window_end:
            continue

        days_left = (due - today).days
        reminder_level = "soon"
        if days_left <= 3:
            reminder_level = "urgent"
        elif days_left <= 7:
            reminder_level = "upcoming"

        items.append(
            UpcomingBillItem(
                subscription_id=sub.id,
                merchant=sub.merchant or sub.merchant_normalized,
                kind=sub.kind or "subscription",
                cadence=sub.cadence,
                amount=Decimal(str(sub.amount)),
                next_due_date=due,
                days_until_due=days_left,
                reminder_level=reminder_level,
            )
        )

    items.sort(key=lambda i: (i.days_until_due, i.amount))
    total_due = sum((item.amount for item in items), Decimal("0"))
    return UpcomingBillsResponse(window_days=days, total_due=total_due, items=items)


@router.get("/cashflow-forecast", response_model=CashflowForecastResponse)
def cashflow_forecast(
    days: int = Query(30, ge=14, le=120),
    starting_cash: Decimal = Query(Decimal("0")),
    db: Session = Depends(get_db),
):
    """Forecast projected outflow and ending cash for the next N days."""
    today = date.today()
    window_end = today + timedelta(days=days)

    # Recurring commitments from active subscriptions
    recurring_items = upcoming_bills(days=days, db=db).items
    recurring_total = sum((item.amount for item in recurring_items), Decimal("0"))

    # Variable spending baseline from trailing 60 days
    trail_start = today - timedelta(days=60)
    variable_total = db.query(func.coalesce(func.sum(Transaction.amount), 0)).filter(
        Transaction.posted_date >= trail_start,
        Transaction.posted_date <= today,
        Transaction.amount > 0,
        Transaction.excluded == False,
    ).scalar()
    variable_daily = Decimal(str(variable_total)) / Decimal("60")
    variable_projected = (variable_daily * Decimal(days)).quantize(Decimal("0.01"))

    # Build daily timeline (recurring amount on due date + flat variable daily)
    due_by_day: Dict[date, Decimal] = {}
    for item in recurring_items:
        due_by_day[item.next_due_date] = due_by_day.get(item.next_due_date, Decimal("0")) + item.amount

    cumulative_outflow = Decimal("0")
    points: List[CashflowPoint] = []
    for day in daterange(today, window_end):
        day_outflow = variable_daily + due_by_day.get(day, Decimal("0"))
        cumulative_outflow += day_outflow
        points.append(
            CashflowPoint(
                date=day,
                projected_outflow=float(cumulative_outflow.quantize(Decimal("0.01"))),
                projected_balance=float((starting_cash - cumulative_outflow).quantize(Decimal("0.01"))),
            )
        )

    total_outflow = (recurring_total + variable_projected).quantize(Decimal("0.01"))
    ending_cash = (starting_cash - total_outflow).quantize(Decimal("0.01"))

    return CashflowForecastResponse(
        days=days,
        starting_cash=starting_cash,
        recurring_commitments=recurring_total,
        variable_daily_average=variable_daily.quantize(Decimal("0.01")),
        variable_projected=variable_projected,
        total_projected_outflow=total_outflow,
        projected_ending_cash=ending_cash,
        points=points,
    )


@router.post("/payoff-plan", response_model=PayoffPlanResponse)
def payoff_plan(payload: PayoffPlanRequest, db: Session = Depends(get_db)):
    """Compute a payoff plan for revolving card balance."""
    apr = payload.apr_percentage
    if apr is None:
        apr = _get_setting_decimal(db, "apr_percentage", Decimal("36.0"))

    result = build_payoff_plan(
        current_balance=payload.current_balance,
        monthly_payment=payload.monthly_payment,
        apr_percentage=apr,
        start_date=date.today(),
    )

    return PayoffPlanResponse(
        current_balance=payload.current_balance,
        monthly_payment=payload.monthly_payment,
        apr_percentage=apr,
        months_to_payoff=result["months_to_payoff"],
        total_interest=result["total_interest"],
        total_paid=result["total_paid"],
        payoff_date=result["payoff_date"],
        schedule=result["schedule"],
        status=result["status"],
    )


@router.get("/goals", response_model=SavingsGoalsResponse)
def list_goals(db: Session = Depends(get_db)):
    """List savings goals stored in settings."""
    goals = _load_goals(db)
    return SavingsGoalsResponse(goals=[SavingsGoalItem(**goal) for goal in goals])


@router.post("/goals", response_model=SavingsGoalItem)
def upsert_goal(payload: SavingsGoalUpsertRequest, db: Session = Depends(get_db)):
    """Create or update a savings goal."""
    goals = _load_goals(db)
    goal_id = payload.id or str(uuid.uuid4())
    record = {
        "id": goal_id,
        "name": payload.name.strip(),
        "target_amount": str(payload.target_amount.quantize(Decimal("0.01"))),
        "current_amount": str(payload.current_amount.quantize(Decimal("0.01"))),
        "target_date": payload.target_date.isoformat() if payload.target_date else None,
    }

    existing_idx = next((index for index, goal in enumerate(goals) if goal.get("id") == goal_id), None)
    if existing_idx is None:
        goals.append(record)
    else:
        goals[existing_idx] = record

    _save_goals(db, goals)
    return SavingsGoalItem(**record)


@router.delete("/goals/{goal_id}")
def delete_goal(goal_id: str, db: Session = Depends(get_db)):
    """Delete a savings goal by id."""
    goals = _load_goals(db)
    remaining = [goal for goal in goals if goal.get("id") != goal_id]
    _save_goals(db, remaining)
    return {"ok": True}


@router.get("/weekly-actions", response_model=WeeklyActionsResponse)
def weekly_actions(
    starting_cash: Decimal = Query(Decimal("0")),
    db: Session = Depends(get_db),
):
    """Generate short, actionable items for the next week."""
    actions: List[WeeklyActionItem] = []

    bills = upcoming_bills(days=7, db=db).items
    if bills:
        top_bill = sorted(bills, key=lambda bill: bill.amount, reverse=True)[0]
        actions.append(
            WeeklyActionItem(
                kind="bill",
                title=f"Prepare for {top_bill.merchant}",
                detail=f"{top_bill.days_until_due} day(s) left · {top_bill.amount} due by {top_bill.next_due_date}.",
                priority="high" if top_bill.days_until_due <= 3 else "medium",
            )
        )

    forecast = cashflow_forecast(days=14, starting_cash=starting_cash, db=db)
    if forecast.projected_ending_cash < 0:
        actions.append(
            WeeklyActionItem(
                kind="cashflow",
                title="Prevent negative cashflow",
                detail=f"14-day ending cash projects at {forecast.projected_ending_cash}. Reduce variable spend this week.",
                priority="high",
            )
        )

    possible_emi_count = db.query(Subscription).filter(
        Subscription.active == True,
        Subscription.kind == "possible_installment",
    ).count()
    if possible_emi_count > 0:
        actions.append(
            WeeklyActionItem(
                kind="review",
                title="Review possible EMIs",
                detail=f"{possible_emi_count} recurring charge(s) are unconfirmed possible installments.",
                priority="medium",
            )
        )

    current_month = date.today().month
    current_year = date.today().year
    month_start = date(current_year, current_month, 1)
    month_end = date(current_year + (1 if current_month == 12 else 0), 1 if current_month == 12 else current_month + 1, 1)
    total_budget = db.query(Budget).filter(Budget.scope == "total").first()
    if total_budget:
        spent = Decimal(str(db.query(func.coalesce(func.sum(Transaction.amount), 0)).filter(
            Transaction.posted_date >= month_start,
            Transaction.posted_date < month_end,
            Transaction.amount > 0,
            Transaction.excluded == False,
        ).scalar()))
        pct = float((spent / total_budget.monthly_limit) * 100) if total_budget.monthly_limit > 0 else 0.0
        if pct >= 90:
            actions.append(
                WeeklyActionItem(
                    kind="budget",
                    title="Budget limit is near",
                    detail=f"You are at {pct:.0f}% of your total monthly budget.",
                    priority="high" if pct >= 100 else "medium",
                )
            )

    if not actions:
        actions.append(
            WeeklyActionItem(
                kind="healthy",
                title="No urgent action this week",
                detail="Cashflow and bills look stable for the next 7 days.",
                priority="low",
            )
        )

    priority_order = {"high": 0, "medium": 1, "low": 2}
    actions.sort(key=lambda action: priority_order.get(action.priority, 3))
    return WeeklyActionsResponse(actions=actions)


@router.get("/recommendations", response_model=RecommendationsResponse)
def recommendations(db: Session = Depends(get_db)):
    """Rule-based recommendations for quick savings opportunities."""
    recs: List[RecommendationItem] = []

    monthly_subs = db.query(Subscription).filter(
        Subscription.active == True,
        Subscription.cadence.ilike("monthly"),
    ).all()
    monthly_total = sum((Decimal(str(subscription.amount)) for subscription in monthly_subs), Decimal("0"))
    if monthly_total >= Decimal("5000"):
        recs.append(
            RecommendationItem(
                kind="subscription",
                title="Audit recurring subscriptions",
                detail=f"Monthly recurring spend is {monthly_total}. Cancel low-value plans to reduce fixed burn.",
                potential_savings=(monthly_total * Decimal("0.15")).quantize(Decimal("0.01")),
            )
        )

    by_merchant: Dict[str, int] = {}
    for subscription in monthly_subs:
        key = (subscription.merchant_normalized or "").strip().lower()
        if key:
            by_merchant[key] = by_merchant.get(key, 0) + 1
    duplicate_merchants = [merchant for merchant, count in by_merchant.items() if count > 1]
    if duplicate_merchants:
        recs.append(
            RecommendationItem(
                kind="duplicate",
                title="Check duplicate recurring services",
                detail=f"Found overlaps for {', '.join(duplicate_merchants[:2])}{'...' if len(duplicate_merchants) > 2 else ''}.",
            )
        )

    fees = analyze_fees(db)
    if fees.get("total", 0) > 0:
        fee_amount = Decimal(str(fees["total"]))
        recs.append(
            RecommendationItem(
                kind="fees",
                title="Reduce avoidable card fees",
                detail=f"Detected {fee_amount} in fees/taxes. Consider autopay and lower-forex-fee cards.",
                potential_savings=(fee_amount * Decimal("0.5")).quantize(Decimal("0.01")),
            )
        )

    if not recs:
        recs.append(
            RecommendationItem(
                kind="healthy",
                title="No major savings flags",
                detail="Current recurring and fee patterns look healthy. Keep tracking weekly.",
            )
        )

    return RecommendationsResponse(recommendations=recs)
