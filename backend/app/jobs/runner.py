"""Background job runner for parsing statements."""

import hashlib
from datetime import datetime
from typing import Optional
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.models import Statement, ParseJob, Transaction, ParseStatus, CategorySource, Category
from app.parsing.pdf_extract import extract_pdf, save_extracted_text
from app.parsing.gemini_client import parse_statement_with_gemini, GeminiParseRequest
from app.parsing.schemas import ParsedTransaction
from app.storage import save_artifact, get_artifact_path
from app.config import settings
from app.utils.transaction_utils import (
    normalize_merchant_name,
    derive_date_parts,
    compute_recurring_signature,
    get_category_parts,
)


def compute_dedup_hash(posted_date, description: str, amount) -> str:
    """Compute hash for transaction deduplication."""
    normalized = f"{posted_date}|{description.lower().strip()}|{float(amount):.2f}"
    return hashlib.sha256(normalized.encode()).hexdigest()


def resolve_category(db: Session, category_name: Optional[str]) -> Optional[Category]:
    if not category_name:
        category_name = "Other"

    category = db.query(Category).filter(func.lower(Category.name) == category_name.lower()).first()
    if category:
        return category

    return db.query(Category).filter(func.lower(Category.name) == "other").first()


def run_parse_job(db: Session, job_id: int) -> ParseJob:
    """
    Execute a parsing job.

    Args:
        db: Database session
        job_id: ID of the ParseJob to run

    Returns:
        Updated ParseJob
    """
    job = db.query(ParseJob).filter(ParseJob.id == job_id).first()
    if not job:
        raise ValueError(f"ParseJob {job_id} not found")

    statement = job.statement

    # Update job status
    job.status = ParseStatus.PROCESSING
    job.started_at = datetime.utcnow()
    job.attempt_count += 1
    job.gemini_model = settings.gemini_model
    db.commit()

    try:
        print(f"DEBUG: Extracting PDF for job {job_id}...")
        # Step 1: Extract PDF text
        extraction = extract_pdf(statement.file_path, password=statement.password)
        print(f"DEBUG: Extraction complete. Pages: {extraction.page_count}")

        # Update statement with page count
        statement.page_count = extraction.page_count

        # Save extracted text
        text_path = save_artifact(statement.id, "extracted_text", extraction.total_text)
        job.extracted_text_path = str(text_path)
        db.commit()

        print(f"DEBUG: Calling Gemini for job {job_id}...")
        # Step 2: Parse with Gemini
        category_names = [name for (name,) in db.query(Category.name).order_by(Category.name).all()]
        if "Other" not in category_names:
            category_names.append("Other")
        parse_request = GeminiParseRequest(
            statement_text=extraction.total_text,
            filename=statement.filename,
            file_path=statement.file_path,
            password=statement.password,
            page_count=extraction.page_count,
            categories=category_names,
        )

        gemini_response = parse_statement_with_gemini(parse_request)
        print(f"DEBUG: Gemini response received. Success: {gemini_response.success}")

        # Save raw Gemini response
        if gemini_response.raw_response:
            save_artifact(statement.id, "gemini_response", gemini_response.raw_response, "json")
            job.raw_gemini_response = gemini_response.raw_response

        if not gemini_response.success:
            job.status = ParseStatus.FAILED
            job.error_message = gemini_response.error_message
            job.finished_at = datetime.utcnow()
            db.commit()
            return job

        parsed = gemini_response.parsed_statement

        # Update statement metadata
        if parsed.source_name:
            statement.source_name = parsed.source_name
        if parsed.period_start:
            statement.period_start = parsed.period_start
        if parsed.period_end:
            statement.period_end = parsed.period_end

        # Step 3: Create transactions
        transactions_created = 0
        transactions_need_review = 0

        for txn_data in parsed.transactions:
            # Compute dedup hash
            dedup_hash = compute_dedup_hash(
                txn_data.posted_date,
                txn_data.description,
                txn_data.amount,
            )

            # Check for duplicates
            existing = (
                db.query(Transaction)
                .filter(
                    Transaction.statement_id == statement.id,
                    Transaction.dedup_hash == dedup_hash,
                )
                .first()
            )

            if existing:
                # Update category for existing transaction if missing and hint is available
                if existing.category_id is None and not existing.user_edited:
                    category = resolve_category(db, txn_data.category_hint)
                    if category:
                        existing.category_id = category.id
                        existing.category_source = CategorySource.AI
                        existing.category_primary, existing.category_detailed = get_category_parts(category)
                continue  # Skip duplicate

            # Look up category from category_hint
            category = resolve_category(db, txn_data.category_hint)
            category_id = category.id if category else None
            category_source = CategorySource.AI if category_id else None
            category_primary, category_detailed = get_category_parts(category)

            merchant_normalized = normalize_merchant_name(txn_data.merchant, txn_data.description)
            posted_day_of_week, posted_month, posted_year = derive_date_parts(txn_data.posted_date)
            recurring_signature = compute_recurring_signature(merchant_normalized, txn_data.amount)

            # Create transaction
            transaction = Transaction(
                statement_id=statement.id,
                posted_date=txn_data.posted_date,
                posted_day_of_week=posted_day_of_week,
                posted_month=posted_month,
                posted_year=posted_year,
                description=txn_data.description,
                amount=txn_data.amount,
                currency=txn_data.currency,
                merchant_raw=txn_data.merchant,
                merchant_normalized=merchant_normalized,
                category_id=category_id,
                category_source=category_source,
                category_primary=category_primary,
                category_detailed=category_detailed,
                confidence=txn_data.confidence,
                needs_review=txn_data.needs_review or txn_data.confidence < 0.8,
                raw_text=txn_data.raw_text,
                page_number=txn_data.page_number,
                dedup_hash=dedup_hash,
                recurring_signature=recurring_signature,
            )

            db.add(transaction)
            transactions_created += 1

            if transaction.needs_review:
                transactions_need_review += 1

        db.commit()

        # Update job stats
        job.transactions_found = transactions_created
        job.transactions_needs_review = transactions_need_review

        if transactions_need_review > 0:
            job.status = ParseStatus.NEEDS_REVIEW
        else:
            job.status = ParseStatus.COMPLETED

        job.finished_at = datetime.utcnow()
        db.commit()

        return job

    except Exception as e:
        job.status = ParseStatus.FAILED
        job.error_message = str(e)
        job.finished_at = datetime.utcnow()
        db.commit()
        raise


def create_parse_job(db: Session, statement_id: int) -> ParseJob:
    """Create a new parse job for a statement."""
    job = ParseJob(
        statement_id=statement_id,
        status=ParseStatus.PENDING,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def run_parse_job_background(statement_id: int, job_id: int):
    """Run parse job in background task."""
    print(f"DEBUG: Starting background job {job_id} for statement {statement_id}")
    from app.db.session import SessionLocal

    db = SessionLocal()
    try:
        print(f"DEBUG: Executing run_parse_job...")
        run_parse_job(db, job_id)
        print(f"DEBUG: run_parse_job completed.")
    except Exception as e:
        # Log error but don't raise (background task)
        print(f"ERROR: Parse job {job_id} failed: {e}")
        import traceback

        traceback.print_exc()
    finally:
        print(f"DEBUG: Closing DB session for job {job_id}")
        db.close()
