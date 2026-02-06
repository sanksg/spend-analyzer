"""Utilities for transaction normalization and derived fields."""

from __future__ import annotations

import hashlib
import re
from datetime import date
from decimal import Decimal
from typing import Optional, Tuple


_PREFIX_RE = re.compile(r"^(pos|upi|imps|neft|rtgs)[\s\-/]+", re.IGNORECASE)
_PUNCTUATION_RE = re.compile(r"[^\w\s]")
_NUM_SUFFIX_RE = re.compile(r"\s+\d+$")
_WHITESPACE_RE = re.compile(r"\s+")


def derive_date_parts(posted_date: date) -> Tuple[int, int, int]:
    """Return (day_of_week, month, year) from a date."""
    return posted_date.weekday(), posted_date.month, posted_date.year


def normalize_merchant_name(raw_merchant: Optional[str], description: Optional[str]) -> Optional[str]:
    """Normalize merchant names by stripping punctuation and numeric suffixes."""
    base = (raw_merchant or description or "").strip()
    if not base:
        return None

    text = _PREFIX_RE.sub("", base)
    text = _PUNCTUATION_RE.sub(" ", text)
    text = _NUM_SUFFIX_RE.sub("", text)
    text = _WHITESPACE_RE.sub(" ", text).strip()

    if not text:
        return None

    return text.title()


def compute_recurring_signature(merchant_normalized: Optional[str], amount: Optional[Decimal]) -> Optional[str]:
    """Compute a recurring signature hash from merchant and amount."""
    if not merchant_normalized or amount is None:
        return None

    normalized_amount = f"{Decimal(amount):.2f}"
    payload = f"{merchant_normalized.lower()}|{normalized_amount}"
    return hashlib.sha256(payload.encode()).hexdigest()


def extract_category_parts(category_name: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    """Extract primary/detailed category parts from a category name string."""
    if not category_name:
        return None, None

    if ":" in category_name or ">" in category_name:
        parts = [p.strip() for p in re.split(r"\s*[:>]\s*", category_name) if p.strip()]
        if len(parts) >= 2:
            return parts[0], " > ".join(parts[1:])

    return category_name.strip(), None


def get_category_parts(category) -> Tuple[Optional[str], Optional[str]]:
    """Get primary/detailed values from a Category-like object."""
    if not category:
        return None, None

    primary = getattr(category, "plaid_primary", None)
    detailed = getattr(category, "plaid_detailed", None)

    if primary or detailed:
        return primary, detailed

    return extract_category_parts(getattr(category, "name", None))
