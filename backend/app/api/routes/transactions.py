"""Transaction management routes."""

from typing import Optional
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from datetime import date

from app.db.session import get_db
from app.db.models import Transaction, Category, CategorySource
from app.utils.transaction_utils import (
    normalize_merchant_name,
    derive_date_parts,
    compute_recurring_signature,
    get_category_parts,
)
from app.api.schemas import (
    TransactionResponse,
    TransactionListResponse,
    TransactionUpdate,
    BulkCategorizeRequest,
)


router = APIRouter()


def transaction_to_response(txn: Transaction) -> TransactionResponse:
    """Convert Transaction model to response schema."""
    return TransactionResponse(
        id=txn.id,
        statement_id=txn.statement_id,
        posted_date=txn.posted_date,
        posted_day_of_week=txn.posted_day_of_week,
        posted_month=txn.posted_month,
        posted_year=txn.posted_year,
        description=txn.description,
        amount=txn.amount,
        currency=txn.currency,
        merchant_raw=txn.merchant_raw,
        merchant_normalized=txn.merchant_normalized,
        category_id=txn.category_id,
        category_name=txn.category.name if txn.category else None,
        category_color=txn.category.color if txn.category else None,
        category_primary=txn.category_primary,
        category_detailed=txn.category_detailed,
        confidence=float(txn.confidence) if txn.confidence else 1.0,
        needs_review=txn.needs_review,
        user_edited=txn.user_edited,
        excluded=txn.excluded,
        category_source=txn.category_source,
        raw_text=txn.raw_text,
        page_number=txn.page_number,
        recurring_signature=txn.recurring_signature,
        recurring_cadence=txn.recurring_cadence,
        created_at=txn.created_at,
    )


@router.get("", response_model=TransactionListResponse)
async def list_transactions(
    statement_id: Optional[int] = None,
    category_id: Optional[int] = None,
    needs_review: Optional[bool] = None,
    excluded: Optional[bool] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    """
    List transactions with filtering options.
    """
    query = db.query(Transaction)

    # Apply filters
    if statement_id is not None:
        query = query.filter(Transaction.statement_id == statement_id)

    if category_id is not None:
        if category_id == 0:  # Uncategorized
            query = query.filter(Transaction.category_id.is_(None))
        else:
            query = query.filter(Transaction.category_id == category_id)

    if needs_review is not None:
        query = query.filter(Transaction.needs_review == needs_review)

    if excluded is not None:
        query = query.filter(Transaction.excluded == excluded)

    if start_date:
        query = query.filter(Transaction.posted_date >= start_date)

    if end_date:
        query = query.filter(Transaction.posted_date <= end_date)

    if search:
        search_pattern = f"%{search}%"
        query = query.filter(
            (Transaction.description.ilike(search_pattern))
            | (Transaction.merchant_normalized.ilike(search_pattern))
            | (Transaction.merchant_raw.ilike(search_pattern))
        )

    # Get total count and sum
    total = query.count()
    total_amount = query.with_entities(func.sum(Transaction.amount)).scalar() or Decimal("0")

    # Apply pagination
    transactions = (
        query.order_by(
            Transaction.posted_date.desc(),
            Transaction.id.desc(),
        )
        .offset(skip)
        .limit(limit)
        .all()
    )

    return TransactionListResponse(
        transactions=[transaction_to_response(t) for t in transactions],
        total=total,
        total_amount=total_amount,
    )


@router.get("/{transaction_id}", response_model=TransactionResponse)
async def get_transaction(transaction_id: int, db: Session = Depends(get_db)):
    """Get a specific transaction."""
    txn = db.query(Transaction).filter(Transaction.id == transaction_id).first()

    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")

    return transaction_to_response(txn)


@router.patch("/{transaction_id}", response_model=TransactionResponse)
async def update_transaction(
    transaction_id: int,
    update: TransactionUpdate,
    db: Session = Depends(get_db),
):
    """Update a transaction."""
    txn = db.query(Transaction).filter(Transaction.id == transaction_id).first()

    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # Apply updates
    update_data = update.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        setattr(txn, field, value)

    # Re-normalize merchant if description changed and merchant_normalized not explicitly set
    if "merchant_normalized" not in update_data and "description" in update_data:
        txn.merchant_normalized = normalize_merchant_name(txn.merchant_raw, txn.description)

    # Derive date parts if posted_date changed or missing
    if "posted_date" in update_data or txn.posted_day_of_week is None or txn.posted_month is None:
        day_of_week, month, year = derive_date_parts(txn.posted_date)
        txn.posted_day_of_week = day_of_week
        txn.posted_month = month
        txn.posted_year = year

    # Update category parts if category changed
    if "category_id" in update_data:
        if txn.category_id is None:
            txn.category_primary = None
            txn.category_detailed = None
        else:
            category = db.query(Category).filter(Category.id == txn.category_id).first()
            txn.category_primary, txn.category_detailed = get_category_parts(category)

    # Update recurring signature if merchant or amount changed
    if "merchant_normalized" in update_data or "amount" in update_data or txn.recurring_signature is None:
        txn.recurring_signature = compute_recurring_signature(txn.merchant_normalized, txn.amount)

    # Mark as user-edited
    txn.user_edited = True

    # Set category source if category changed
    if "category_id" in update_data:
        txn.category_source = CategorySource.MANUAL

    # Clear needs_review if explicitly set or if user edited
    if "needs_review" not in update_data:
        txn.needs_review = False

    db.commit()
    db.refresh(txn)

    return transaction_to_response(txn)


@router.post("/bulk-categorize")
async def bulk_categorize(
    request: BulkCategorizeRequest,
    db: Session = Depends(get_db),
):
    """Categorize multiple transactions at once."""
    # Verify category exists
    category = db.query(Category).filter(Category.id == request.category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    # Update transactions
    category_primary, category_detailed = get_category_parts(category)
    updated = (
        db.query(Transaction)
        .filter(Transaction.id.in_(request.transaction_ids))
        .update(
            {
                Transaction.category_id: request.category_id,
                Transaction.category_source: CategorySource.MANUAL,
                Transaction.needs_review: False,
                Transaction.category_primary: category_primary,
                Transaction.category_detailed: category_detailed,
            },
            synchronize_session=False,
        )
    )

    db.commit()

    return {"message": f"Updated {updated} transactions"}


@router.post("/{transaction_id}/approve", response_model=TransactionResponse)
async def approve_transaction(transaction_id: int, db: Session = Depends(get_db)):
    """Approve a transaction that needs review."""
    txn = db.query(Transaction).filter(Transaction.id == transaction_id).first()

    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")

    txn.needs_review = False
    txn.confidence = Decimal("1.0")
    db.commit()
    db.refresh(txn)

    return transaction_to_response(txn)


@router.delete("/{transaction_id}")
async def delete_transaction(transaction_id: int, db: Session = Depends(get_db)):
    """Delete a transaction."""
    txn = db.query(Transaction).filter(Transaction.id == transaction_id).first()

    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")

    db.delete(txn)
    db.commit()

    return {"message": "Transaction deleted"}
