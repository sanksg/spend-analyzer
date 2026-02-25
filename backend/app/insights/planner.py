"""Planning helpers for bills, cashflow forecasts, and credit payoff."""

from __future__ import annotations

import calendar
from datetime import date, timedelta
from decimal import Decimal
from typing import Optional


CADENCE_MONTHS = {
    "monthly": 1,
    "bimonthly": 2,
    "quarterly": 3,
    "yearly": 12,
}


def add_months(base_date: date, months: int) -> date:
    """Add months to a date while clamping invalid day numbers."""
    month_index = (base_date.month - 1) + months
    year = base_date.year + month_index // 12
    month = month_index % 12 + 1
    max_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(base_date.day, max_day))


def next_due_date(last_seen: Optional[date], cadence: Optional[str], today: date) -> Optional[date]:
    """Compute the next due date for a recurring charge based on cadence."""
    if not last_seen or not cadence:
        return None
    months = CADENCE_MONTHS.get(cadence.lower())
    if not months:
        return None

    candidate = add_months(last_seen, months)
    while candidate < today:
        candidate = add_months(candidate, months)
    return candidate


def build_payoff_plan(
    current_balance: Decimal,
    monthly_payment: Decimal,
    apr_percentage: Decimal,
    start_date: date,
    max_months: int = 600,
) -> dict:
    """Build a month-wise credit payoff plan with compound monthly interest."""
    if current_balance <= 0:
        return {
            "months_to_payoff": 0,
            "total_interest": Decimal("0"),
            "total_paid": Decimal("0"),
            "payoff_date": start_date,
            "schedule": [],
            "status": "paid",
        }

    monthly_rate = (apr_percentage / Decimal("100")) / Decimal("12")
    if monthly_payment <= Decimal("0"):
        return {
            "months_to_payoff": None,
            "total_interest": None,
            "total_paid": None,
            "payoff_date": None,
            "schedule": [],
            "status": "invalid_payment",
        }

    if monthly_rate > 0:
        monthly_interest_now = (current_balance * monthly_rate).quantize(Decimal("0.01"))
        if monthly_payment <= monthly_interest_now:
            return {
                "months_to_payoff": None,
                "total_interest": None,
                "total_paid": None,
                "payoff_date": None,
                "schedule": [],
                "status": "payment_too_low",
            }

    balance = current_balance
    total_interest = Decimal("0")
    total_paid = Decimal("0")
    schedule = []
    current_date = start_date

    for month_num in range(1, max_months + 1):
        interest = (balance * monthly_rate).quantize(Decimal("0.01"))
        balance_after_interest = balance + interest
        payment = min(monthly_payment, balance_after_interest).quantize(Decimal("0.01"))
        principal = (payment - interest).quantize(Decimal("0.01"))
        ending_balance = (balance_after_interest - payment).quantize(Decimal("0.01"))

        total_interest += interest
        total_paid += payment

        schedule.append(
            {
                "month": month_num,
                "date": current_date.isoformat(),
                "starting_balance": float(balance),
                "interest": float(interest),
                "payment": float(payment),
                "principal": float(principal),
                "ending_balance": float(max(ending_balance, Decimal("0"))),
            }
        )

        balance = ending_balance
        if balance <= Decimal("0.00"):
            return {
                "months_to_payoff": month_num,
                "total_interest": total_interest.quantize(Decimal("0.01")),
                "total_paid": total_paid.quantize(Decimal("0.01")),
                "payoff_date": current_date,
                "schedule": schedule,
                "status": "ok",
            }

        current_date = add_months(current_date, 1)

    return {
        "months_to_payoff": None,
        "total_interest": None,
        "total_paid": None,
        "payoff_date": None,
        "schedule": schedule,
        "status": "max_months_exceeded",
    }


def daterange(start_date: date, end_date: date):
    """Yield each date from start_date to end_date inclusive."""
    day = start_date
    while day <= end_date:
        yield day
        day += timedelta(days=1)
