"""
Subscription Detection Logic.
"""

from datetime import datetime, timedelta
from decimal import Decimal
from typing import List, Dict, Optional
from sqlalchemy.orm import Session
from sqlalchemy import select, func

from app.db.models import Transaction, Subscription

def detect_subscriptions(session: Session) -> List[Dict]:
    """
    Scans transactions to identify potential recurring subscriptions.
    Logic:
    1. Group by Merchant + Amount (within 5% tolerance).
    2. Check for periodic intervals (approx 30 days).
    3. Return candidates.
    """
    
    # 1. Get all transactions sorted by merchant and date
    # In a real heavy DB, we'd do this via complex SQL, but for local app, python logic is fine.
    transactions = session.execute(
        select(Transaction)
        .where(Transaction.amount > 0)  # Only spending
        .order_by(Transaction.merchant_normalized, Transaction.posted_date)
    ).scalars().all()

    # Dictionary to track patterns: { "MERCHANT_NAME": [ {date, amount}, ... ] }
    history: Dict[str, List[Transaction]] = {}
    
    for txn in transactions:
        if not txn.merchant_normalized:
            continue
        key = txn.merchant_normalized
        if key not in history:
            history[key] = []
        history[key].append(txn)

    candidates = []

    # 2. Analyze each merchant's history
    for merchant, txns in history.items():
        # --- A. Check for EMI Strings in Description ---
        # Look for "EMI", "Offus", "Prin", "Int" patterns
        for txn in txns:
            desc_upper = (txn.description or "").upper()
            if "EMI" in desc_upper or ("OFFUS" in desc_upper and "PRIN" in desc_upper):
                candidates.append({
                    "merchant_name": merchant,
                    "amount_approx": float(txn.amount),
                    "periodicity": "Monthly",
                    "last_payment_date": txn.posted_date,
                    "confidence": "High",
                    "kind": "installment"
                })
                # Once identified as EMI, we can probably break or continue to find others
                # But simple logic: let's track unique signatures later
    
        if len(txns) < 2:
            continue

        # --- B. Subscription Logic (Intervals) ---
        # Sort by date
        txns.sort(key=lambda x: x.posted_date)
        
        # Check adjacent pairs
        for i in range(len(txns) - 1):
            t1 = txns[i]
            t2 = txns[i+1]
            
            # Amount Similarity Check (within 5%)
            amt1 = float(t1.amount)
            amt2 = float(t2.amount)
            if not (0.95 * amt1 <= amt2 <= 1.05 * amt1):
                continue
            
            # Date Interval Check
            delta = (t2.posted_date - t1.posted_date).days
            
            period = None
            if 25 <= delta <= 35:
                period = "Monthly"
            elif 350 <= delta <= 380:
                period = "Yearly"
            
            if period:
                # Found a candidate pair
                candidates.append({
                    "merchant_name": merchant,
                    "amount_approx": round((amt1 + amt2) / 2, 2),
                    "periodicity": period,
                    "last_payment_date": t2.posted_date,
                    "confidence": "High",
                    "kind": "subscription"
                })

    # Deduplicate candidates (keep most recent)
    unique_map = {}
    for c in candidates:
        # Key includes 'kind' so we can have both Subscription and EMI from same merchant if applicable
        key = f"{c['merchant_name']}_{c['periodicity']}_{c.get('kind', 'subscription')}"
        
        # Update logic: if exists, keep the one with later date
        if key not in unique_map or c['last_payment_date'] > unique_map[key]['last_payment_date']:
            unique_map[key] = c
        
    return list(unique_map.values())


def sync_subscriptions_to_db(session: Session) -> int:
    """
    Runs detection and saves new subscriptions to DB.
    Returns count of new subs found.
    """
    candidates = detect_subscriptions(session)
    count = 0
    
    for cand in candidates:
        # Check if exists
        exists = session.execute(
            select(Subscription).where(
                Subscription.merchant == cand['merchant_name'],
                Subscription.kind == cand['kind'],
                # For EMIs, amount is specific. For subs, amount is approx.
                # Let's just key off merchant + kind for now to avoid duplicates
            )
        ).scalar_one_or_none()
        
        if not exists:
            new_sub = Subscription(
                merchant=cand['merchant_name'],
                amount=cand['amount_approx'],
                cadence=cand['periodicity'],
                last_seen=cand['last_payment_date'],
                kind=cand['kind']
            )
            session.add(new_sub)
            count += 1
        else:
            # Update last payment date
            exists.last_seen = cand['last_payment_date']
            # Update amount to latest detected amount
            exists.amount = cand['amount_approx']
            
    session.commit()
    return count
