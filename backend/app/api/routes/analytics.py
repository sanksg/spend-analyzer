"""Analytics and reporting routes."""

from typing import Optional
from decimal import Decimal
from datetime import date
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, extract, and_, case, or_

from app.db.session import get_db
from app.db.models import Transaction, Category
from app.api.schemas import (
    SpendSummary,
    SpendByCategory,
    SpendByMonth,
    SpendByDay,
    SpendByDayOfWeek,
    TopMerchant,
    TimePatternsResponse,
    CategoryHierarchyResponse,
    CategoryDrilldown,
    MerchantFrequencyResponse,
    MerchantFrequency,
)


router = APIRouter()


def build_base_filter(
    start_date: Optional[date],
    end_date: Optional[date],
    category_ids: Optional[str],
    statement_id: Optional[int],
    merchant: Optional[str],
):
    base_filter = and_(
        Transaction.excluded == False,
        Transaction.amount > 0,
    )

    if start_date:
        base_filter = and_(base_filter, Transaction.posted_date >= start_date)
    if end_date:
        base_filter = and_(base_filter, Transaction.posted_date <= end_date)

    if category_ids:
        category_id_list = [int(x) for x in category_ids.split(",") if x.strip()]
        if category_id_list:
            base_filter = and_(base_filter, Transaction.category_id.in_(category_id_list))

    if statement_id:
        base_filter = and_(base_filter, Transaction.statement_id == statement_id)

    if merchant:
        search_pattern = f"%{merchant}%"
        base_filter = and_(
            base_filter,
            or_(
                Transaction.merchant_normalized.ilike(search_pattern),
                Transaction.merchant_raw.ilike(search_pattern),
                Transaction.description.ilike(search_pattern),
            ),
        )

    return base_filter


@router.get("/summary", response_model=SpendSummary)
async def get_spend_summary(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    category_ids: Optional[str] = None,  # Comma-separated
    statement_id: Optional[int] = None,
    merchant: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Get comprehensive spending summary with breakdowns.
    """
    base_filter = build_base_filter(start_date, end_date, category_ids, statement_id, merchant)

    # Total stats
    total_stats = (
        db.query(
            func.sum(Transaction.amount),
            func.count(Transaction.id),
            func.min(Transaction.posted_date),
            func.max(Transaction.posted_date),
        )
        .filter(base_filter)
        .first()
    )

    total_spend = total_stats[0] or Decimal("0")
    total_transactions = total_stats[1] or 0
    date_range_start = total_stats[2]
    date_range_end = total_stats[3]

    average_transaction = total_spend / total_transactions if total_transactions > 0 else Decimal("0")

    # By category
    category_stats = (
        db.query(
            Transaction.category_id,
            Category.name,
            Category.color,
            func.sum(Transaction.amount).label("total"),
            func.count(Transaction.id).label("count"),
        )
        .outerjoin(Category, Transaction.category_id == Category.id)
        .filter(base_filter)
        .group_by(
            Transaction.category_id,
            Category.name,
            Category.color,
        )
        .order_by(func.sum(Transaction.amount).desc())
        .all()
    )

    by_category = []
    for row in category_stats:
        amount = row.total or Decimal("0")
        percentage = float(amount / total_spend * 100) if total_spend > 0 else 0
        by_category.append(
            SpendByCategory(
                category_id=row.category_id,
                category_name=row.name or "Uncategorized",
                category_color=row.color or "#9CA3AF",
                total_amount=amount,
                transaction_count=row.count,
                percentage=round(percentage, 1),
            )
        )

    # By month
    month_stats = (
        db.query(
            func.strftime("%Y-%m", Transaction.posted_date).label("month"),
            func.sum(Transaction.amount).label("total"),
            func.count(Transaction.id).label("count"),
        )
        .filter(base_filter)
        .group_by(func.strftime("%Y-%m", Transaction.posted_date))
        .order_by("month")
        .all()
    )

    by_month = []
    for row in month_stats:
        # Get category breakdown for this month
        month_filter = and_(
            base_filter,
            func.strftime("%Y-%m", Transaction.posted_date) == row.month,
        )

        month_categories = (
            db.query(
                Transaction.category_id,
                Category.name,
                Category.color,
                func.sum(Transaction.amount).label("total"),
                func.count(Transaction.id).label("count"),
            )
            .outerjoin(Category, Transaction.category_id == Category.id)
            .filter(month_filter)
            .group_by(
                Transaction.category_id,
                Category.name,
                Category.color,
            )
            .all()
        )

        month_total = row.total or Decimal("0")
        month_by_cat = []
        for cat_row in month_categories:
            cat_amount = cat_row.total or Decimal("0")
            cat_pct = float(cat_amount / month_total * 100) if month_total > 0 else 0
            month_by_cat.append(
                SpendByCategory(
                    category_id=cat_row.category_id,
                    category_name=cat_row.name or "Uncategorized",
                    category_color=cat_row.color or "#9CA3AF",
                    total_amount=cat_amount,
                    transaction_count=cat_row.count,
                    percentage=round(cat_pct, 1),
                )
            )

        by_month.append(
            SpendByMonth(
                month=row.month,
                total_amount=month_total,
                transaction_count=row.count,
                by_category=month_by_cat,
            )
        )

    # By day
    day_stats = (
        db.query(
            func.strftime("%Y-%m-%d", Transaction.posted_date).label("day"),
            func.sum(Transaction.amount).label("total"),
            func.count(Transaction.id).label("count"),
        )
        .filter(base_filter)
        .group_by(func.strftime("%Y-%m-%d", Transaction.posted_date))
        .order_by("day")
        .all()
    )

    by_day = [
        SpendByDay(
            day=row.day,
            total_amount=row.total or Decimal("0"),
            transaction_count=row.count,
        )
        for row in day_stats
    ]

    # Top merchants
    merchant_stats = (
        db.query(
            Transaction.merchant_normalized,
            Category.name,
            func.sum(Transaction.amount).label("total"),
            func.count(Transaction.id).label("count"),
        )
        .outerjoin(Category, Transaction.category_id == Category.id)
        .filter(
            base_filter,
            Transaction.merchant_normalized.isnot(None),
        )
        .group_by(
            Transaction.merchant_normalized,
            Category.name,
        )
        .order_by(func.sum(Transaction.amount).desc())
        .limit(20)
        .all()
    )

    top_merchants = [
        TopMerchant(
            merchant=row.merchant_normalized,
            total_amount=row.total or Decimal("0"),
            transaction_count=row.count,
            category_name=row.name,
        )
        for row in merchant_stats
    ]

    return SpendSummary(
        total_spend=total_spend,
        total_transactions=total_transactions,
        average_transaction=average_transaction,
        date_range_start=date_range_start,
        date_range_end=date_range_end,
        by_category=by_category,
        by_month=by_month,
        by_day=by_day,
        top_merchants=top_merchants,
    )


@router.get("/trends")
async def get_spending_trends(
    months: int = Query(default=6, ge=1, le=24),
    db: Session = Depends(get_db),
):
    """
    Get spending trends over time.
    """
    # Monthly totals
    monthly = (
        db.query(
            func.strftime("%Y-%m", Transaction.posted_date).label("month"),
            func.sum(Transaction.amount).label("total"),
            func.count(Transaction.id).label("count"),
        )
        .filter(
            Transaction.excluded == False,
            Transaction.amount > 0,
        )
        .group_by(func.strftime("%Y-%m", Transaction.posted_date))
        .order_by("month")
        .limit(months)
        .all()
    )

    return {
        "months": [
            {
                "month": row.month,
                "total": float(row.total or 0),
                "count": row.count,
            }
            for row in monthly
        ]
    }


@router.get("/time-patterns", response_model=TimePatternsResponse)
async def get_time_patterns(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    category_ids: Optional[str] = None,
    statement_id: Optional[int] = None,
    merchant: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Get day-of-week spending patterns."""
    base_filter = build_base_filter(start_date, end_date, category_ids, statement_id, merchant)

    day_stats = (
        db.query(
            Transaction.posted_day_of_week,
            func.sum(Transaction.amount).label("total"),
            func.count(Transaction.id).label("count"),
        )
        .filter(
            base_filter,
            Transaction.posted_day_of_week.isnot(None),
        )
        .group_by(Transaction.posted_day_of_week)
        .order_by(Transaction.posted_day_of_week)
        .all()
    )

    totals_by_day = {row.posted_day_of_week: row for row in day_stats}
    by_day_of_week = []
    for day in range(7):
        row = totals_by_day.get(day)
        by_day_of_week.append(
            SpendByDayOfWeek(
                day_of_week=day,
                total_amount=row.total if row else Decimal("0"),
                transaction_count=row.count if row else 0,
            )
        )

    return TimePatternsResponse(by_day_of_week=by_day_of_week)


@router.get("/category-hierarchy", response_model=CategoryHierarchyResponse)
async def get_category_hierarchy(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    category_ids: Optional[str] = None,
    statement_id: Optional[int] = None,
    merchant: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Get category distribution with drill-down by detailed categories."""
    base_filter = build_base_filter(start_date, end_date, category_ids, statement_id, merchant)

    rows = (
        db.query(
            Transaction.category_primary,
            Transaction.category_detailed,
            Category.color,
            func.sum(Transaction.amount).label("total"),
            func.count(Transaction.id).label("count"),
        )
        .outerjoin(Category, Transaction.category_id == Category.id)
        .filter(base_filter)
        .group_by(
            Transaction.category_primary,
            Transaction.category_detailed,
            Category.color,
        )
        .all()
    )

    grouped: dict[str, CategoryDrilldown] = {}
    for row in rows:
        primary_name = row.category_primary or "Uncategorized"
        detailed_name = row.category_detailed or primary_name
        color = row.color or "#9CA3AF"

        if primary_name not in grouped:
            grouped[primary_name] = CategoryDrilldown(
                primary=primary_name,
                total_amount=Decimal("0"),
                transaction_count=0,
                color=color,
                detailed=[],
            )

        group = grouped[primary_name]
        group.total_amount += row.total or Decimal("0")
        group.transaction_count += row.count or 0

        group.detailed.append(
            SpendByCategory(
                category_id=None,
                category_name=detailed_name,
                category_color=color,
                total_amount=row.total or Decimal("0"),
                transaction_count=row.count or 0,
                percentage=0,
            )
        )

    categories = list(grouped.values())
    categories.sort(key=lambda item: item.total_amount, reverse=True)

    for group in categories:
        total = group.total_amount
        for item in group.detailed:
            item.percentage = float(item.total_amount / total * 100) if total > 0 else 0
        group.detailed.sort(key=lambda item: item.total_amount, reverse=True)

    return CategoryHierarchyResponse(categories=categories)


@router.get("/merchant-frequency", response_model=MerchantFrequencyResponse)
async def get_merchant_frequency(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    category_ids: Optional[str] = None,
    statement_id: Optional[int] = None,
    merchant: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Get merchant loyalty and frequency metrics."""
    base_filter = build_base_filter(start_date, end_date, category_ids, statement_id, merchant)

    rows = (
        db.query(
            Transaction.merchant_normalized,
            func.sum(Transaction.amount).label("total"),
            func.count(Transaction.id).label("count"),
            func.count(func.distinct(func.strftime("%Y-%m", Transaction.posted_date))).label("months"),
        )
        .filter(
            base_filter,
            Transaction.merchant_normalized.isnot(None),
        )
        .group_by(Transaction.merchant_normalized)
        .order_by(func.count(Transaction.id).desc())
        .limit(50)
        .all()
    )

    merchants = []
    for row in rows:
        months = row.months or 0
        average_monthly = float(row.count / months) if months else float(row.count or 0)
        merchants.append(
            MerchantFrequency(
                merchant=row.merchant_normalized,
                total_amount=row.total or Decimal("0"),
                transaction_count=row.count or 0,
                distinct_months=months,
                average_monthly_count=round(average_monthly, 2),
            )
        )

    return MerchantFrequencyResponse(merchants=merchants)


@router.get("/category-trends")
async def get_category_trends(
    category_id: int,
    months: int = Query(default=6, ge=1, le=24),
    db: Session = Depends(get_db),
):
    """
    Get spending trends for a specific category.
    """
    monthly = (
        db.query(
            func.strftime("%Y-%m", Transaction.posted_date).label("month"),
            func.sum(Transaction.amount).label("total"),
            func.count(Transaction.id).label("count"),
        )
        .filter(
            Transaction.excluded == False,
            Transaction.amount > 0,
            Transaction.category_id == category_id,
        )
        .group_by(func.strftime("%Y-%m", Transaction.posted_date))
        .order_by("month")
        .limit(months)
        .all()
    )

    return {
        "category_id": category_id,
        "months": [
            {
                "month": row.month,
                "total": float(row.total or 0),
                "count": row.count,
            }
            for row in monthly
        ],
    }
