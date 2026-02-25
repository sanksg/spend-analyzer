"""
Behavioral Trigger Detection Engine.

Detects spending patterns that may indicate problematic behavior:
- Weekend spending spikes
- Category spikes vs trailing average
- Merchant binges (many txns at same merchant in short window)
- Impulse buys (single txn >> category median)
"""

from datetime import date, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional
from sqlalchemy import func, case
from sqlalchemy.orm import Session

from app.db.models import Transaction, Category


def detect_triggers(
    db: Session,
    months_lookback: int = 3,
    current_month: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Run all trigger detectors and return a unified list.
    Each trigger: { type, title, severity, reason, stats, transaction_ids }
    severity: 'info' | 'warning' | 'alert'
    """
    today = date.today()
    if current_month:
        y, m = int(current_month.split("-")[0]), int(current_month.split("-")[1])
    else:
        y, m = today.year, today.month
        current_month = f"{y:04d}-{m:02d}"

    cur_start = date(y, m, 1)
    if m == 12:
        cur_end = date(y + 1, 1, 1)
    else:
        cur_end = date(y, m + 1, 1)

    # Trailing window for baseline (3 months before current month)
    trail_end = cur_start
    trail_start = date(y if m > months_lookback else y - 1,
                       m - months_lookback if m > months_lookback else 12 + m - months_lookback, 1)

    triggers: List[Dict[str, Any]] = []

    triggers.extend(_weekend_spike(db, cur_start, cur_end, trail_start, trail_end))
    triggers.extend(_category_spike(db, cur_start, cur_end, trail_start, trail_end))
    triggers.extend(_merchant_binge(db, cur_start, cur_end))
    triggers.extend(_impulse_buys(db, cur_start, cur_end))

    # Sort by severity
    sev_order = {"alert": 0, "warning": 1, "info": 2}
    triggers.sort(key=lambda t: sev_order.get(t["severity"], 9))
    return triggers


# ---------------------------------------------------------------------------
# Individual detectors
# ---------------------------------------------------------------------------

def _base_filter(start: date, end: date):
    """Common filters for spend transactions."""
    return [
        Transaction.posted_date >= start,
        Transaction.posted_date < end,
        Transaction.excluded == False,
        Transaction.amount > 0,
    ]


def _weekend_spike(db: Session, cur_start, cur_end, trail_start, trail_end):
    """Compare weekend vs weekday daily average in current month vs trailing."""
    triggers = []

    # Current month weekend / weekday totals
    cur_rows = (
        db.query(
            case((Transaction.posted_day_of_week.in_([5, 6]), "weekend"), else_="weekday").label("bucket"),
            func.sum(Transaction.amount).label("total"),
            func.count(func.distinct(Transaction.posted_date)).label("days"),
        )
        .filter(*_base_filter(cur_start, cur_end))
        .group_by("bucket")
        .all()
    )

    cur = {r.bucket: {"total": float(r.total or 0), "days": r.days or 1} for r in cur_rows}
    wk_avg = cur.get("weekday", {}).get("total", 0) / max(cur.get("weekday", {}).get("days", 1), 1)
    we_avg = cur.get("weekend", {}).get("total", 0) / max(cur.get("weekend", {}).get("days", 1), 1)

    if wk_avg > 0 and we_avg > wk_avg * 1.5:
        ratio = round(we_avg / wk_avg, 1)
        triggers.append({
            "type": "weekend_spike",
            "title": "Weekend Spending Spike",
            "severity": "warning" if ratio < 2.5 else "alert",
            "reason": f"Your weekend daily avg (₹{we_avg:,.0f}) is {ratio}× your weekday avg (₹{wk_avg:,.0f}) this month.",
            "stats": {"weekend_daily_avg": round(we_avg), "weekday_daily_avg": round(wk_avg), "ratio": ratio},
            "transaction_ids": [],
        })

    return triggers


def _category_spike(db: Session, cur_start, cur_end, trail_start, trail_end):
    """Find categories where this month's spend is >1.5× the trailing monthly average."""
    triggers = []

    # Trailing average by category
    trail_months = max(
        1,
        (cur_start.year - trail_start.year) * 12 + cur_start.month - trail_start.month,
    )
    trail = (
        db.query(
            Transaction.category_id,
            func.sum(Transaction.amount).label("total"),
        )
        .filter(*_base_filter(trail_start, trail_end))
        .group_by(Transaction.category_id)
        .all()
    )
    trail_avg = {r.category_id: float(r.total or 0) / trail_months for r in trail}

    # Current month by category
    cur = (
        db.query(
            Transaction.category_id,
            Category.name,
            Category.color,
            func.sum(Transaction.amount).label("total"),
        )
        .outerjoin(Category, Transaction.category_id == Category.id)
        .filter(*_base_filter(cur_start, cur_end))
        .group_by(Transaction.category_id, Category.name, Category.color)
        .all()
    )

    for r in cur:
        avg = trail_avg.get(r.category_id, 0)
        cur_total = float(r.total or 0)
        if avg > 0 and cur_total > avg * 1.5 and cur_total > 500:
            ratio = round(cur_total / avg, 1)
            triggers.append({
                "type": "category_spike",
                "title": f"{r.name or 'Unknown'} Spending Spike",
                "severity": "warning" if ratio < 2.5 else "alert",
                "reason": f"₹{cur_total:,.0f} this month vs ₹{avg:,.0f}/mo average ({ratio}× increase).",
                "stats": {
                    "category": r.name,
                    "color": r.color,
                    "current": round(cur_total),
                    "average": round(avg),
                    "ratio": ratio,
                },
                "transaction_ids": [],
            })

    return triggers


def _merchant_binge(db: Session, cur_start, cur_end, min_txns: int = 5):
    """Flag merchants where user made ≥min_txns transactions in a 7-day window."""
    triggers = []

    # Merchants with many txns this month
    rows = (
        db.query(
            Transaction.merchant_normalized,
            func.count(Transaction.id).label("cnt"),
            func.sum(Transaction.amount).label("total"),
        )
        .filter(*_base_filter(cur_start, cur_end), Transaction.merchant_normalized.isnot(None))
        .group_by(Transaction.merchant_normalized)
        .having(func.count(Transaction.id) >= min_txns)
        .all()
    )

    for r in rows:
        triggers.append({
            "type": "merchant_binge",
            "title": f"Frequent: {r.merchant_normalized}",
            "severity": "info",
            "reason": f"{r.cnt} transactions totalling ₹{float(r.total):,.0f} this month.",
            "stats": {
                "merchant": r.merchant_normalized,
                "count": r.cnt,
                "total": round(float(r.total)),
            },
            "transaction_ids": [],
        })

    return triggers


def _impulse_buys(db: Session, cur_start, cur_end, factor: float = 3.0, min_amount: float = 2000):
    """
    Flag single transactions that are >factor× the category median and above min_amount.
    Uses a simplified approach: category average instead of true median for speed.
    """
    triggers = []

    # Category averages this month
    cat_stats = (
        db.query(
            Transaction.category_id,
            Category.name,
            func.avg(Transaction.amount).label("avg_amt"),
            func.count(Transaction.id).label("cnt"),
        )
        .outerjoin(Category, Transaction.category_id == Category.id)
        .filter(*_base_filter(cur_start, cur_end))
        .group_by(Transaction.category_id, Category.name)
        .having(func.count(Transaction.id) >= 3)  # Need enough data
        .all()
    )
    cat_avg = {r.category_id: (float(r.avg_amt), r.name) for r in cat_stats}

    # Find outlier transactions
    txns = (
        db.query(Transaction)
        .filter(
            *_base_filter(cur_start, cur_end),
            Transaction.amount >= min_amount,
        )
        .all()
    )

    for t in txns:
        avg_info = cat_avg.get(t.category_id)
        if not avg_info:
            continue
        avg, cat_name = avg_info
        if avg > 0 and float(t.amount) > avg * factor:
            triggers.append({
                "type": "impulse_buy",
                "title": f"Unusually Large: {t.merchant_normalized or t.description[:30]}",
                "severity": "warning",
                "reason": f"₹{float(t.amount):,.0f} is {float(t.amount)/avg:.1f}× the avg for {cat_name} (₹{avg:,.0f}).",
                "stats": {
                    "amount": round(float(t.amount)),
                    "category_avg": round(avg),
                    "merchant": t.merchant_normalized,
                },
                "transaction_ids": [t.id],
            })

    return triggers
