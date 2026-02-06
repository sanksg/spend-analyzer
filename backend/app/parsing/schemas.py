"""Pydantic schemas for transaction parsing."""

from datetime import date
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, Field


class ParsedTransaction(BaseModel):
    """A single transaction extracted by Gemini."""

    posted_date: date = Field(description="Transaction date in YYYY-MM-DD format")
    description: str = Field(description="Transaction description from statement")
    amount: Decimal = Field(
        description="Transaction amount (positive for debits/spending, negative for credits/refunds)"
    )
    currency: str = Field(default="INR", description="Currency code (INR, USD, etc.)")
    merchant: Optional[str] = Field(default=None, description="Merchant/vendor name if identifiable")
    category_hint: Optional[str] = Field(default=None, description="Suggested category based on merchant type")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0, description="Confidence score 0-1")
    needs_review: bool = Field(default=False, description="Flag if transaction needs human review")
    raw_text: Optional[str] = Field(default=None, description="Original text from statement")
    page_number: Optional[int] = Field(default=None, description="Page number where found")


class ParsedStatement(BaseModel):
    """Complete parsed statement from Gemini."""

    source_name: Optional[str] = Field(default=None, description="Bank/card issuer name")
    period_start: Optional[date] = Field(default=None, description="Statement period start")
    period_end: Optional[date] = Field(default=None, description="Statement period end")
    account_number_last4: Optional[str] = Field(default=None, description="Last 4 digits of account")
    transactions: list[ParsedTransaction] = Field(default_factory=list)
    parsing_notes: Optional[str] = Field(default=None, description="Any notes about parsing issues")


class GeminiParseRequest(BaseModel):
    """Request to parse statement text via Gemini."""

    statement_text: str
    filename: Optional[str] = None
    file_path: Optional[str] = None
    password: Optional[str] = None
    page_count: Optional[int] = None
    categories: list[str] = Field(default_factory=list, description="Allowed category names")


class GeminiParseResponse(BaseModel):
    """Response from Gemini parsing."""

    success: bool
    parsed_statement: Optional[ParsedStatement] = None
    error_message: Optional[str] = None
    raw_response: Optional[str] = None
    model_used: str = ""
    tokens_used: Optional[int] = None
