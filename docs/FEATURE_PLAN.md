# Spend Analyzer — Feature Plan (Phased)

This plan sequences features to deliver fast, compounding value while de‑risking complex ML/analytics work.

## Phase 0 — Data Foundations (Prereq)
- **Data completeness**: ensure transactions include `date`, `amount`, `merchant`, `category`, `statement_id`.
- **Category normalization**: store Plaid “primary” + “detailed” strings even if UI merges to single category.
- **Time indexing**: normalize timezone and store derived fields (day_of_week, month, year).
- **Merchant canonicalization**: basic normalization (strip punctuation, normalize casing, remove numeric suffixes).
- **Recurring signatures**: store `(merchant, amount, cadence)` tuples for fast recurring analysis.

## Phase 1 — High‑Impact Visualizations (Core)
1) **Time‑based spending patterns**
   - Day‑of‑week histogram, hour‑of‑day heatmap.
   - Filters by statement, category, and merchant.
   - Notes: use derived fields to avoid expensive runtime computation.

2) **Category distribution with drill‑down**
   - Top‑level category donut.
   - Drill‑down by parsing Plaid hierarchy from stored `category_detailed` string.
   - Notes: implement string split helper to map “FOOD_AND_DRINK > RESTAURANTS”.

3) **Month‑over‑month / year‑over‑year**
   - Line and bar comparisons (MoM, YoY).
   - Notes: rolling 12‑month baseline and seasonality display.

4) **Merchant loyalty & frequency**
   - Top merchants by spend, by count, and by repeat cadence.
   - Notes: merchant normalization quality directly impacts accuracy.

## Phase 2 — Actionable Insights (High Value)
1) **Subscription detector**
   - Detect monthly/quarterly/yearly recurrences.
   - Output: list of subscriptions + total monthly burn.
   - Notes: use tolerance window (±3 days) and amount fuzz (±3–5%).

2) **Anomaly detection**
   - Flag outliers per merchant and per category.
   - Notes: robust z‑score / IQR baseline, explainable reason in UI.

3) **Credit utilization tracking**
   - Compute utilization % from statement balance and credit limit (user input).
   - Zones: excellent/good/average/bad.
   - Notes: needs a new credit‑limit settings UI + stored profile.

4) **Interest cost calculator**
   - Minimum payment vs. full payment cost.
   - Notes: needs APR input and statement cycle dates.

## Phase 3 — Smart Features (Retention Drivers)
1) **Behavioral triggers**
   - Late‑night purchases, weekend spikes, impulse buys.
   - Notes: define local heuristics (time window + high variance).

2) **Budget tracking with alerts**
   - Category and total budget caps with 80/100/120% thresholds.
   - Notes: alert delivery via UI banners + optional email later.

3) **Rewards optimization**
   - Suggest better card usage by category.
   - Notes: requires card‑reward profiles (user input).

4) **EMI burden tracking**
   - Detect EMIs and compute total committed amount.
   - Notes: merchant + “EMI” text match + consistent monthly patterns.

## Phase 4 — User Engagement (Delight)
1) **Cost‑saving recommendations**
   - Examples: family plan suggestions, downgrade prompts.
   - Notes: rule‑based at first, later ML.

2) **Bill predictions**
   - Forecast next cycle based on velocity.
   - Notes: simple moving average; include confidence band.

## Implementation Order (Summary)
1) Phase 0 → Phase 1 visualizations  
2) Phase 2 actionable insights  
3) Phase 3 smart features  
4) Phase 4 engagement features

## Success Metrics
- **Phase 1**: time‑to‑insight < 5s, drill‑down adoption > 25%.  
- **Phase 2**: subscription detection precision > 90%, anomaly CTR > 10%.  
- **Phase 3**: budget alert opt‑in > 20%.  
- **Phase 4**: recommendations saved amount tracked per user.

## Notes on Dependencies
- Many insights require **clean merchant names** and **consistent category hierarchy**.
- Store raw + normalized values to allow re‑processing without data loss.
