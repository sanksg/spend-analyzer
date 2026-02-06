"""PDF text and table extraction using pdfplumber."""

import hashlib
from pathlib import Path
from typing import Optional
from dataclasses import dataclass
import pdfplumber
from pdfminer.pdfdocument import PDFPasswordIncorrect


class PasswordRequiredError(Exception):
    """Raised when PDF is encrypted and requires a password."""

    pass


class IncorrectPasswordError(Exception):
    """Raised when PDF password is incorrect."""

    pass


@dataclass
class ExtractedPage:
    """Extracted content from a single PDF page."""

    page_number: int
    text: str
    tables: list[list[list[str]]]  # List of tables, each table is rows of cells
    width: float
    height: float


@dataclass
class PDFExtraction:
    """Complete extraction result from a PDF."""

    file_path: str
    file_hash: str
    page_count: int
    pages: list[ExtractedPage]
    total_text: str
    extraction_errors: list[str]


def compute_file_hash(file_path: Path) -> str:
    """Compute SHA256 hash of a file."""
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            sha256_hash.update(chunk)
    return sha256_hash.hexdigest()


def verify_pdf_readability(file_path: Path, password: Optional[str] = None):
    """
    Check if PDF can be opened with the provided password.
    Raises PasswordRequiredError or IncorrectPasswordError if not.
    """
    try:
        with pdfplumber.open(file_path, password=password or ""):
            pass
    except PDFPasswordIncorrect:
        if password:
            raise IncorrectPasswordError("The provided password matches, but access is still denied or incorrect.")
        raise PasswordRequiredError("PDF is encrypted and requires a password.")
    except Exception as e:
        # pdfminer sometimes raises generic errors for passwords
        msg = str(e).lower()
        if "password" in msg or "encrypted" in msg:
            if password:
                raise IncorrectPasswordError(f"Password failed: {e}")
            raise PasswordRequiredError(f"PDF appears encrypted: {e}")
        # Re-raise other errors to be handled by caller
        # But for verification, maybe we act permissive? No, if we can't open it now, we can't parse it.
        # But maybe let extract_pdf handle other corruptions.
        if "initialized" in msg:  # 'PDFDocument is not initialized' happens on password fail too
            raise PasswordRequiredError("PDF access failed (likely password protected).")
        raise e


def extract_pdf(file_path: Path, password: Optional[str] = None) -> PDFExtraction:
    """
    Extract text and tables from a PDF file.

    Args:
        file_path: Path to the PDF file
        password: Optional password for opening encrypted PDF

    Returns:
        PDFExtraction with all extracted content
    """
    file_hash = compute_file_hash(file_path)
    pages: list[ExtractedPage] = []
    extraction_errors: list[str] = []
    all_text_parts: list[str] = []

    try:
        with pdfplumber.open(file_path, password=password or "") as pdf:
            page_count = len(pdf.pages)

            for i, page in enumerate(pdf.pages):
                page_num = i + 1

                try:
                    # Extract text
                    text = page.extract_text() or ""
                    all_text_parts.append(f"--- Page {page_num} ---\n{text}")

                    # Extract tables
                    tables = []
                    try:
                        raw_tables = page.extract_tables() or []
                        for table in raw_tables:
                            # Clean up table cells
                            cleaned_table = []
                            for row in table:
                                cleaned_row = [(cell or "").strip() for cell in row]
                                cleaned_table.append(cleaned_row)
                            tables.append(cleaned_table)
                    except Exception as e:
                        extraction_errors.append(f"Page {page_num} table extraction error: {str(e)}")

                    pages.append(
                        ExtractedPage(
                            page_number=page_num,
                            text=text,
                            tables=tables,
                            width=page.width,
                            height=page.height,
                        )
                    )

                except Exception as e:
                    extraction_errors.append(f"Page {page_num} extraction error: {str(e)}")
                    pages.append(
                        ExtractedPage(
                            page_number=page_num,
                            text="",
                            tables=[],
                            width=0,
                            height=0,
                        )
                    )

    except Exception as e:
        extraction_errors.append(f"PDF open error: {str(e)}")
        page_count = 0

    return PDFExtraction(
        file_path=str(file_path),
        file_hash=file_hash,
        page_count=page_count,
        pages=pages,
        total_text="\n\n".join(all_text_parts),
        extraction_errors=extraction_errors,
    )


def save_extracted_text(extraction: PDFExtraction, output_path: Path) -> None:
    """Save extracted text to a file for debugging."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(extraction.total_text)

        if extraction.extraction_errors:
            f.write("\n\n--- EXTRACTION ERRORS ---\n")
            for error in extraction.extraction_errors:
                f.write(f"- {error}\n")
