"""
Fees and Tax analysis logic.
Identifies wasted money on taxes, fees, and markups.
"""

from typing import List, Dict, Any
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.db.models import Transaction

# Keywords to identify fees
FEE_KEYWORDS = [
    "IGST", "CGST", "SGST", "GST",
    "MARKUP FEE", "CONSOLIDATED FCY", "FOREX MARKUP",
    "LATE FEE", "INTEREST CHARGE", "FINANCE CHARGE",
    "ANNUAL FEE", "RENEWAL FEE", "PROCESSING FEE"
]

def analyze_fees(session: Session) -> Dict[str, Any]:
    """
    Scans for transactions that look like taxes or fees.
    """
    
    # Fetch all debit transactions
    txns = session.execute(
        select(Transaction).where(Transaction.amount > 0)
    ).scalars().all()
    
    fee_txns = []
    total_fees = 0.0
    
    for t in txns:
        desc = (t.description or "").upper()
        # Check against keywords
        if any(k in desc for k in FEE_KEYWORDS):
            fee_txns.append({
                "id": t.id,
                "date": t.posted_date,
                "description": t.description,
                "amount": float(t.amount),
                "category": "Fees & Taxes"
            })
            total_fees += float(t.amount)
            
    # Group by type for a chart?
    # Simple breakdown
    breakdown = {
        "Forex/Markup": 0.0,
        "GST/Taxes": 0.0,
        "Late/Interest": 0.0,
        "Other": 0.0
    }
    
    for f in fee_txns:
        d = f['description'].upper()
        if "MARKUP" in d or "FCY" in d:
            breakdown["Forex/Markup"] += f['amount']
        elif "GST" in d:
            breakdown["GST/Taxes"] += f['amount']
        elif "LATE" in d or "INTEREST" in d:
            breakdown["Late/Interest"] += f['amount']
        else:
            breakdown["Other"] += f['amount']

    return {
        "total": total_fees,
        "count": len(fee_txns),
        "transactions": sorted(fee_txns, key=lambda x: x['date'], reverse=True),
        "breakdown": breakdown
    }
