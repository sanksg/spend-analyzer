"""
Subscription & EMI Detection Logic.

Handles two common problems with credit-card statement data:
  1. Merchant names are often truncated at different lengths across statements
     (e.g. "Spotify Si" vs "Spotify"), so we merge groups by common prefix.
  2. Recurring charges may span many months with gaps, so we check all pairs
     not just adjacent ones.
"""

import re
import logging
from datetime import date
from typing import List, Dict, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.db.models import Transaction, Subscription

logger = logging.getLogger(__name__)

# ── Helpers ──────────────────────────────────────────────────────────────────

_STRIP_RE = re.compile(r"[^a-z0-9 ]")
_EMI_WORD_RE = re.compile(r"\bEMI\b", re.IGNORECASE)
_EMI_CONFIRMED_RE = re.compile(r"\bEMI[, ]*(PRIN|INT|PRINCIPAL|INTEREST)\b", re.IGNORECASE)

def _canon(name: str) -> str:
    """Lower-case, strip non-alphanum, collapse spaces."""
    return _STRIP_RE.sub("", name.lower()).strip()


def _merge_merchant_groups(
    history: Dict[str, List],
) -> Dict[str, List]:
    """
    Merge merchant groups whose canonical names share a common prefix.
    E.g. "Spotify Si" and "Spotify" both start with "spotify" → merged.
    """
    canon_to_keys: Dict[str, List[str]] = {}
    for key in history:
        canon_to_keys.setdefault(_canon(key), []).append(key)

    # Sort canonical names; then greedily merge prefixes
    canon_names = sorted(canon_to_keys.keys())
    merged: Dict[str, List] = {}   # canonical group name → txns
    used = set()

    for i, ci in enumerate(canon_names):
        if ci in used:
            continue
        group_txns = []
        group_label = canon_to_keys[ci][0]          # original casing for display
        for orig_key in canon_to_keys[ci]:
            group_txns.extend(history[orig_key])
        used.add(ci)

        # Try to absorb other canonical names that share a prefix ≥ 6 chars
        for j in range(i + 1, len(canon_names)):
            cj = canon_names[j]
            if cj in used:
                continue
            prefix_len = _common_prefix_len(ci, cj)
            if prefix_len >= 6 and (prefix_len >= len(ci) or prefix_len >= len(cj)):
                # One is a prefix (or near-prefix) of the other → same merchant
                for orig_key in canon_to_keys[cj]:
                    group_txns.extend(history[orig_key])
                used.add(cj)
                # Keep the shorter original name as display label
                for orig_key in canon_to_keys[cj]:
                    if len(orig_key) < len(group_label):
                        group_label = orig_key

        merged[group_label] = group_txns

    return merged


def _common_prefix_len(a: str, b: str) -> int:
    n = min(len(a), len(b))
    for i in range(n):
        if a[i] != b[i]:
            return i
    return n


def _looks_like_monthly_series(txns: List[Transaction]) -> bool:
    """Return True if transactions repeat roughly monthly with similar amounts."""
    if len(txns) < 2:
        return False

    txns_sorted = sorted(txns, key=lambda t: t.posted_date)
    amounts = [float(t.amount) for t in txns_sorted]
    median_amt = sorted(amounts)[len(amounts) // 2]
    similar = [a for a in amounts if median_amt == 0 or (0.90 * median_amt <= a <= 1.10 * median_amt)]
    if len(similar) < 2:
        return False

    for i in range(len(txns_sorted) - 1):
        gap = (txns_sorted[i + 1].posted_date - txns_sorted[i].posted_date).days
        if 25 <= gap <= 38:
            return True
        if gap > 38 and (gap % 30) <= 8:
            return True

    return False


def _build_candidate_from_txns(
    merchant_label: str,
    txns: List[Transaction],
    kind: str,
    confidence: str,
) -> Dict:
    txns_sorted = sorted(txns, key=lambda t: t.posted_date)
    avg_amount = round(sum(float(t.amount) for t in txns_sorted) / len(txns_sorted), 2)
    return {
        "merchant_name": merchant_label,
        "amount_approx": avg_amount,
        "periodicity": "Monthly",
        "last_payment_date": txns_sorted[-1].posted_date,
        "confidence": confidence,
        "kind": kind,
        "transaction_count": len(txns_sorted),
        "first_seen": txns_sorted[0].posted_date,
    }


# ── Known recurring services (keyword → display name) ───────────────────────

KNOWN_SUBSCRIPTIONS: Dict[str, str] = {
    "spotify": "Spotify",
    "netflix": "Netflix",
    "youtube": "YouTube Premium",
    "disney": "Disney+ Hotstar",
    "hotstar": "Disney+ Hotstar",
    "jiocinema": "JioCinema",
    "prime video": "Amazon Prime Video",
    "amazon prime": "Amazon Prime",
    "apple.com/bill": "Apple Subscription",
    "google play": "Google Play",
    "google storage": "Google One",
    "github": "GitHub",
    "chatgpt": "ChatGPT Plus",
    "openai": "OpenAI",
    "notion": "Notion",
    "figma": "Figma",
    "canva": "Canva",
    "zoom": "Zoom",
    "icloud": "iCloud",
    "dropbox": "Dropbox",
    "microsoft 365": "Microsoft 365",
    "linkedin": "LinkedIn Premium",
    "leetcode": "LeetCode",
    "surfshark": "Surfshark VPN",
    "nordvpn": "NordVPN",
    "expressvpn": "ExpressVPN",
    "audible": "Audible",
    "kindle": "Kindle Unlimited",
    "jio": "Jio Recharge",
    "airtel": "Airtel Recharge",
    "vi ": "Vi Recharge",
    "swiggy one": "Swiggy One",
    "zomato gold": "Zomato Gold",
    "zomato pro": "Zomato Pro",
    "google cloud": "Google Cloud",
}


# ── Core Detection ───────────────────────────────────────────────────────────

def detect_subscriptions(session: Session) -> List[Dict]:
    """
    Scans all debit transactions and returns candidate recurring charges:
      - EMIs detected by description keywords (EMI, OFFUS PRIN/INT)
      - Subscriptions detected by periodic interval + similar amount at same merchant
      - Known services detected by keyword match in description
    """

    transactions = session.execute(
        select(Transaction)
        .where(Transaction.amount > 0)
        .order_by(Transaction.posted_date)
    ).scalars().all()

    # ── Step 1: group by merchant_normalized ─────────────────────────────────
    raw_groups: Dict[str, List[Transaction]] = {}
    for txn in transactions:
        key = (txn.merchant_normalized or "").strip()
        if not key:
            continue
        raw_groups.setdefault(key, []).append(txn)

    # ── Step 2: merge groups with similar / truncated merchant names ─────────
    groups = _merge_merchant_groups(raw_groups)

    candidates: List[Dict] = []

    for merchant_label, txns in groups.items():
        # --- A. EMI detection (keyword in description) ---
        _detect_emis(merchant_label, txns, candidates)

        # --- B. Interval-based subscription detection ---
        _detect_by_interval(merchant_label, txns, candidates)

    # --- C. Known-service keyword detection (catches anything missed) ---
    _detect_known_services(transactions, candidates)

    # ── Step 3: deduplicate (keep most recent per merchant+kind) ─────────────
    unique: Dict[str, Dict] = {}
    for c in candidates:
        key = f"{_canon(c['merchant_name'])}|{c['kind']}"
        prev = unique.get(key)
        if prev is None or c["last_payment_date"] > prev["last_payment_date"]:
            unique[key] = c

    return list(unique.values())


def _detect_emis(
    merchant_label: str,
    txns: List[Transaction],
    out: List[Dict],
) -> None:
    """
    Detect EMI installments conservatively.
    - Confirmed EMI when PRIN/INT markers exist (e.g. OFFUS EMI,PRIN).
    - Otherwise, mark as possible_installment and promote to installment only
      if it repeats monthly with similar amounts.
    """
    confirmed_txns: List[Transaction] = []
    possible_txns: List[Transaction] = []

    for txn in txns:
        desc = (txn.description or "")
        desc_upper = desc.upper()

        is_confirmed = bool(_EMI_CONFIRMED_RE.search(desc)) or (
            "OFFUS" in desc_upper and ("PRIN" in desc_upper or "INT" in desc_upper)
        )
        is_possible = bool(_EMI_WORD_RE.search(desc))

        if is_confirmed:
            confirmed_txns.append(txn)
        elif is_possible:
            possible_txns.append(txn)

    if confirmed_txns:
        out.append(
            _build_candidate_from_txns(
                merchant_label,
                confirmed_txns,
                kind="installment",
                confidence="High",
            )
        )

    if possible_txns:
        if _looks_like_monthly_series(possible_txns):
            out.append(
                _build_candidate_from_txns(
                    merchant_label,
                    possible_txns,
                    kind="installment",
                    confidence="Medium",
                )
            )
        else:
            out.append(
                _build_candidate_from_txns(
                    merchant_label,
                    possible_txns,
                    kind="possible_installment",
                    confidence="Low",
                )
            )


def _detect_by_interval(
    merchant_label: str,
    txns: List[Transaction],
    out: List[Dict],
) -> None:
    """
    Look for pairs of transactions at the same (merged) merchant with
    similar amounts and a periodic date gap.  We check ALL pairs, not just
    adjacent ones, because months may be missing in the data.
    """
    if len(txns) < 2:
        return

    txns_sorted = sorted(txns, key=lambda t: t.posted_date)

    # Collect matching pairs, then pick the strongest evidence
    best_period = None
    best_pair: Tuple = ()
    matching_txn_ids = set()
    total_amount = 0.0
    pair_count = 0

    for i in range(len(txns_sorted)):
        for j in range(i + 1, len(txns_sorted)):
            t1, t2 = txns_sorted[i], txns_sorted[j]
            amt1, amt2 = float(t1.amount), float(t2.amount)

            # Amount tolerance: within 10% (slightly relaxed for rounding)
            if amt1 == 0:
                continue
            ratio = amt2 / amt1
            if not (0.90 <= ratio <= 1.10):
                continue

            delta = (t2.posted_date - t1.posted_date).days
            period = None
            if 25 <= delta <= 38:
                period = "Monthly"
            elif 55 <= delta <= 70:
                period = "Bimonthly"
            elif 80 <= delta <= 100:
                period = "Quarterly"
            elif 170 <= delta <= 200:
                period = "Half-yearly"
            elif 350 <= delta <= 395:
                period = "Yearly"
            # Heuristic: if amounts are very similar and the gap is a
            # rough multiple of 30 days, treat as Monthly with missing months.
            # This handles sparse data (e.g. only Jan + Nov statements).
            elif delta > 38 and (delta % 30) <= 8:
                period = "Monthly"

            if period:
                matching_txn_ids.add(t1.id)
                matching_txn_ids.add(t2.id)
                total_amount += amt2
                pair_count += 1
                if best_pair == () or t2.posted_date > best_pair[1].posted_date:
                    best_period = period
                    best_pair = (t1, t2)

    if best_pair:
        avg = round(total_amount / pair_count, 2) if pair_count else float(best_pair[1].amount)
        out.append({
            "merchant_name": merchant_label,
            "amount_approx": avg,
            "periodicity": best_period,
            "last_payment_date": best_pair[1].posted_date,
            "confidence": "High" if pair_count >= 2 else "Medium",
            "kind": "subscription",
            "transaction_count": len(matching_txn_ids),
            "first_seen": best_pair[0].posted_date,
        })


def _detect_known_services(
    transactions: List[Transaction],
    out: List[Dict],
) -> None:
    """
    Catch subscriptions by matching description/merchant against a known
    services list.  Only adds if not already present in `out`.
    """
    already = {_canon(c["merchant_name"]) for c in out}

    # bucket transactions by which known keyword they match
    service_txns: Dict[str, List[Transaction]] = {}
    for txn in transactions:
        text = ((txn.description or "") + " " + (txn.merchant_normalized or "")).lower()
        for keyword, display in KNOWN_SUBSCRIPTIONS.items():
            if keyword in text:
                canon_display = _canon(display)
                # skip if we already found this merchant via other detectors
                if any(canon_display in a or a in canon_display for a in already):
                    break
                service_txns.setdefault(display, []).append(txn)
                break  # first match wins

    for display, txns in service_txns.items():
        txns_sorted = sorted(txns, key=lambda t: t.posted_date)
        amounts = [float(t.amount) for t in txns_sorted]
        avg_amt = round(sum(amounts) / len(amounts), 2)

        # Try to guess cadence from date gaps.
        # Default Monthly for known services; override only with strong evidence.
        cadence = "Monthly"
        if len(txns_sorted) >= 2:
            gaps = [
                (txns_sorted[i + 1].posted_date - txns_sorted[i].posted_date).days
                for i in range(len(txns_sorted) - 1)
            ]
            median_gap = sorted(gaps)[len(gaps) // 2]
            # A gap that's a rough multiple of 30 is likely monthly
            # with missing months in between (sparse statement data).
            if median_gap > 38 and (median_gap % 30) <= 8:
                cadence = "Monthly"
            elif median_gap > 300:
                cadence = "Yearly"
            elif median_gap > 80:
                cadence = "Quarterly"

        out.append({
            "merchant_name": display,
            "amount_approx": avg_amt,
            "periodicity": cadence,
            "last_payment_date": txns_sorted[-1].posted_date,
            "confidence": "High" if len(txns_sorted) >= 2 else "Medium",
            "kind": "subscription",
            "transaction_count": len(txns_sorted),
            "first_seen": txns_sorted[0].posted_date,
        })


# ── DB Sync ──────────────────────────────────────────────────────────────────

def sync_subscriptions_to_db(session: Session) -> int:
    """
    Runs detection and upserts results into the subscriptions table.
    Returns count of *new* subscriptions added.
    """
    candidates = detect_subscriptions(session)
    candidate_keys = {
        f"{_canon(c['merchant_name'])}|{c['kind']}" for c in candidates
    }
    new_count = 0

    # Deactivate stale auto-detected subscriptions
    existing_all = session.execute(select(Subscription)).scalars().all()
    for sub in existing_all:
        merchant_label = sub.merchant or sub.merchant_normalized or ""
        key = f"{_canon(merchant_label)}|{sub.kind}"
        if key not in candidate_keys and not sub.user_confirmed:
            sub.active = False

    for cand in candidates:
        merchant_name = cand["merchant_name"]
        kind = cand["kind"]

        existing = session.execute(
            select(Subscription).where(
                Subscription.merchant == merchant_name,
                Subscription.kind == kind,
            )
        ).scalar_one_or_none()

        if existing is None:
            sub = Subscription(
                recurring_signature=f"{_canon(merchant_name)}:{kind}",
                merchant_normalized=_canon(merchant_name),
                merchant=merchant_name,
                amount=cand["amount_approx"],
                cadence=cand["periodicity"],
                kind=kind,
                first_seen=cand.get("first_seen", cand["last_payment_date"]),
                last_seen=cand["last_payment_date"],
                transaction_count=cand.get("transaction_count", 1),
                active=True,
            )
            session.add(sub)
            new_count += 1
        else:
            # Update fields that may have changed
            existing.last_seen = cand["last_payment_date"]
            existing.amount = cand["amount_approx"]
            existing.cadence = cand["periodicity"]
            existing.active = True
            if cand.get("transaction_count"):
                existing.transaction_count = cand["transaction_count"]

    session.commit()
    logger.info("Subscription sync complete: %d new, %d total candidates", new_count, len(candidates))
    return new_count
