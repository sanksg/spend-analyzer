from datetime import date
from decimal import Decimal

from app.insights.planner import build_payoff_plan, next_due_date


def test_next_due_date_monthly_rolls_forward():
    today = date(2026, 2, 20)
    due = next_due_date(date(2025, 12, 5), "monthly", today)
    assert due == date(2026, 3, 5)


def test_payoff_plan_converges_with_valid_payment():
    plan = build_payoff_plan(
        current_balance=Decimal("12000"),
        monthly_payment=Decimal("1500"),
        apr_percentage=Decimal("24"),
        start_date=date(2026, 2, 20),
    )
    assert plan["status"] == "ok"
    assert plan["months_to_payoff"] is not None
    assert plan["total_interest"] is not None
    assert plan["months_to_payoff"] > 0


def test_payoff_plan_rejects_too_low_payment():
    plan = build_payoff_plan(
        current_balance=Decimal("100000"),
        monthly_payment=Decimal("100"),
        apr_percentage=Decimal("36"),
        start_date=date(2026, 2, 20),
    )
    assert plan["status"] == "payment_too_low"
    assert plan["months_to_payoff"] is None
