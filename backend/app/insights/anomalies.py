"""
Anomaly Detection Logic.
Uses basic statistical methods (Z-Score) to flag unusual transactions.
"""

from typing import List, Dict, Any
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import select, func
import statistics

from app.db.models import Transaction, Category

def detect_anomalies(session: Session, min_amount: float = 0) -> List[Dict[str, Any]]:
    """
    Detects transactions that are statistical outliers.
    Method:
    1. Group transactions by Category.
    2. Calculate Mean and StdDev for amounts in each category.
    3. Flag transactions with Z-Score > 2.5 (and amount > min_amount).
    """
    
    # 1. Fetch all transactions with category info
    txns = session.execute(
        select(Transaction, Category.name)
        .join(Category, Transaction.category_id == Category.id)
        .where(Transaction.amount > 0) # spending only
    ).all()
    
    # Group by category
    by_category: Dict[str, List[Transaction]] = {}
    for txn, cat_name in txns:
        if cat_name not in by_category:
            by_category[cat_name] = []
        by_category[cat_name].append(txn)
        
    anomalies = []
    
    for cat_name, items in by_category.items():
        if len(items) < 5: # Need minimum sample size
            continue
            
        amounts = [float(t.amount) for t in items]
        mean = statistics.mean(amounts)
        stdev = statistics.stdev(amounts) if len(amounts) > 1 else 0
        
        if stdev == 0:
            continue
            
        for t in items:
            val = float(t.amount)
            if val < min_amount:
                continue
                
            z_score = (val - mean) / stdev
            
            # Threshold: 2.5 standard deviations
            if z_score > 2.5:
                # Also check merchant-specific history? 
                # For now, category-based anomaly is a good start.
                anomalies.append({
                    "id": t.id,
                    "date": t.posted_date,
                    "merchant": t.merchant_normalized or t.merchant_raw or "Unknown",
                    "amount": val,
                    "category": cat_name,
                    "severity": f"{z_score:.1f}x (Avg: {mean:.0f})",
                    "type": "High Category Spend"
                })
                
    # Sort by amount desc
    anomalies.sort(key=lambda x: x['amount'], reverse=True)
    return anomalies
