"""Statement upload and management routes."""

from pathlib import Path
import os
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.db.session import get_db
from app.db.models import Statement, ParseJob, Transaction, ParseStatus
from app.api.schemas import (
    StatementResponse,
    StatementListResponse,
    ParseJobResponse,
)
from app.storage import save_upload
from app.jobs.runner import create_parse_job, run_parse_job, run_parse_job_background
from app.parsing.pdf_extract import verify_pdf_readability, PasswordRequiredError, IncorrectPasswordError


router = APIRouter()


def statement_to_response(statement: Statement, db: Session) -> StatementResponse:
    """Convert Statement model to response schema."""
    # Get transaction counts
    txn_count = db.query(func.count(Transaction.id)).filter(Transaction.statement_id == statement.id).scalar() or 0

    review_count = (
        db.query(func.count(Transaction.id))
        .filter(
            Transaction.statement_id == statement.id,
            Transaction.needs_review == True,
        )
        .scalar()
        or 0
    )

    # Get latest parse status
    # We want the most recent job
    latest_job = (
        db.query(ParseJob)
        .filter(ParseJob.statement_id == statement.id)
        .order_by(ParseJob.id.desc())
        .first()
    )
    status = latest_job.status if latest_job else ParseStatus.PENDING

    return StatementResponse(
        id=statement.id,
        filename=statement.filename,
        file_hash=statement.file_hash,
        file_size=statement.file_size,
        issuing_bank=statement.issuing_bank,
        file_path=statement.file_path,
        source_name=statement.source_name,
        page_count=statement.page_count,
        period_start=statement.period_start,
        period_end=statement.period_end,
        uploaded_at=statement.uploaded_at,
        transaction_count=txn_count,
        needs_review_count=review_count,
        status=status,
    )


@router.post("/upload", response_model=StatementResponse)
async def upload_statement(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    password: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    """
    Upload a credit card statement PDF.

    The file will be saved and a background parse job will be created.
    """
    # Validate file type
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    # Read file content
    content = await file.read()

    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    if len(content) > 50 * 1024 * 1024:  # 50MB limit
        raise HTTPException(status_code=400, detail="File too large (max 50MB)")

    # Save file temporarily to check password/hash
    saved = save_upload(content, file.filename)

    # Check for duplicate
    existing = db.query(Statement).filter(Statement.file_hash == saved.file_hash).first()
    if existing:
        # Cleanup uploaded file since it's a duplicate
        try:
            os.remove(saved.file_path)
        except OSError:
            pass
            
        raise HTTPException(
            status_code=409, detail=f"This file has already been uploaded (Statement ID: {existing.id})"
        )

    # Verify password / PDF readability
    try:
        verify_pdf_readability(saved.file_path, password)
    except PasswordRequiredError:
        # Require password
        try:
            os.remove(saved.file_path)
        except OSError:
            pass
        raise HTTPException(status_code=422, detail="PASSWORD_REQUIRED")
    except IncorrectPasswordError:
        try:
            os.remove(saved.file_path)
        except OSError:
            pass
        raise HTTPException(status_code=422, detail="INVALID_PASSWORD")
    except Exception as e:
         # Corrupt or other error?
        print(f"PDF verification error: {e}")
        # We might want to let it pass and fail in job, OR fail early.
        # Let's fail early for clear corruption
        if "pdf" in str(e).lower() and "header" in str(e).lower():
            try:
                os.remove(saved.file_path)
            except OSError:
                pass
            raise HTTPException(status_code=400, detail="Invalid PDF file")

    # Create statement record
    statement = Statement(
        filename=saved.filename,
        file_hash=saved.file_hash,
        file_path=str(saved.file_path),
        file_size=saved.file_size,
        password=password,
    )
    db.add(statement)
    db.commit()
    db.refresh(statement)

    # Create and run parse job in background
    job = create_parse_job(db, statement.id)
    background_tasks.add_task(run_parse_job_background, statement.id, job.id)

    return statement_to_response(statement, db)


@router.get("", response_model=StatementListResponse)
async def list_statements(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    """List all uploaded statements."""
    total = db.query(func.count(Statement.id)).scalar() or 0

    statements = db.query(Statement).order_by(Statement.uploaded_at.desc()).offset(skip).limit(limit).all()

    return StatementListResponse(
        statements=[statement_to_response(s, db) for s in statements],
        total=total,
    )


@router.get("/{statement_id}", response_model=StatementResponse)
async def get_statement(statement_id: int, db: Session = Depends(get_db)):
    """Get a specific statement by ID."""
    statement = db.query(Statement).filter(Statement.id == statement_id).first()

    if not statement:
        raise HTTPException(status_code=404, detail="Statement not found")

    return statement_to_response(statement, db)


@router.get("/{statement_id}/jobs", response_model=list[ParseJobResponse])
async def get_statement_jobs(statement_id: int, db: Session = Depends(get_db)):
    """Get parse jobs for a statement."""
    statement = db.query(Statement).filter(Statement.id == statement_id).first()

    if not statement:
        raise HTTPException(status_code=404, detail="Statement not found")

    jobs = db.query(ParseJob).filter(ParseJob.statement_id == statement_id).order_by(ParseJob.id.desc()).all()

    return [ParseJobResponse.model_validate(j) for j in jobs]


@router.post("/{statement_id}/reparse", response_model=ParseJobResponse)
async def reparse_statement(
    statement_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Trigger a re-parse of a statement."""
    statement = db.query(Statement).filter(Statement.id == statement_id).first()

    if not statement:
        raise HTTPException(status_code=404, detail="Statement not found")

    # Check if there's already a pending/processing job
    active_job = (
        db.query(ParseJob)
        .filter(
            ParseJob.statement_id == statement_id,
            ParseJob.status.in_([ParseStatus.PENDING, ParseStatus.PROCESSING]),
        )
        .first()
    )

    if active_job:
        raise HTTPException(status_code=409, detail="A parse job is already in progress")

    # Create new job
    job = create_parse_job(db, statement_id)
    background_tasks.add_task(run_parse_job_background, statement_id, job.id)

    return ParseJobResponse.model_validate(job)


@router.delete("/{statement_id}")
async def delete_statement(statement_id: int, db: Session = Depends(get_db)):
    """Delete a statement and all associated data."""
    statement = db.query(Statement).filter(Statement.id == statement_id).first()

    if not statement:
        raise HTTPException(status_code=404, detail="Statement not found")

    # Delete file from disk
    from app.storage import delete_statement_files

    delete_statement_files(statement_id, Path(statement.file_path) if statement.file_path else None)

    # Delete from database (cascades to transactions and jobs)
    db.delete(statement)
    db.commit()

    return {"message": "Statement deleted"}
