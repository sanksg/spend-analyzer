import argparse
import os
import sys
from dotenv import load_dotenv
from pathlib import Path
import pytest

# Load environment variables
load_dotenv()

# Add backend directory to python path so we can import app modules
sys.path.append(os.getcwd())

from app.parsing.pdf_extract import extract_pdf
from app.parsing.gemini_client import parse_statement_with_gemini, GeminiParseRequest
from app.config import settings
from app.utils.plaid_taxonomy import load_plaid_categories


@pytest.mark.skip(reason="Manual parsing harness; run directly with a PDF path.")
def test_parsing(pdf_path: str, force_fallback: bool = False):
    file_path = Path(pdf_path)
    if not file_path.exists():
        print(f"Error: File not found: {pdf_path}")
        return

    # Load categories
    print("Loading taxonomy...")
    try:
        plaid_cats = load_plaid_categories(settings.plaid_taxonomy_path)
        category_names = [c.name for c in plaid_cats]
        if "Other" not in category_names:
            category_names.append("Other")
        print(f"Loaded {len(category_names)} categories.")
    except Exception as e:
        print(f"Warning: Could not load taxonomy ({e}). Defaulting to 'Other'.")
        category_names = ["Other"]

    print(f"\n--- 1. Extraction Phase (pdfplumber) ---")
    print(f"Processing: {file_path.name}")
    try:
        extraction = extract_pdf(file_path)
        print(f"Pages found: {extraction.page_count}")
        print(f"Text length: {len(extraction.total_text)} characters")
        print(f"Extracted Text (first 5000 chars): \n{extraction.total_text}...")
        if extraction.extraction_errors:
            print(f"Warnings: {len(extraction.extraction_errors)} extraction issues occurred.")
    except Exception as e:
        print(f"CRITICAL ERROR: Extraction failed: {e}")
        return

    print(f"\n--- 2. AI Parsing Phase (Gemini: {settings.gemini_model}) ---")
    if force_fallback:
        print("NOTE: Force fallback enabled. Clearing extracted text to trigger PDF-only mode.")
        extraction.total_text = ""

    if not settings.gemini_api_key:
        print("Error: GEMINI_API_KEY is not set in .env")
        return

    req = GeminiParseRequest(
        statement_text=extraction.total_text,
        filename=file_path.name,
        file_path=str(file_path),
        page_count=extraction.page_count,
        categories=category_names,
    )
    try:
        if force_fallback or len(extraction.total_text) < 200:
            print("Sending PDF file to Gemini... (this may take a few seconds)")
        else:
            print("Sending text to Gemini... (this may take a few seconds)")

        response = parse_statement_with_gemini(req, debug=True)

        if response.success and response.parsed_statement:
            stmt = response.parsed_statement
            print("\n--- 3. SUCCESS ---")
            print(f"Bank/Source:  {stmt.source_name}")
            print(f"Period:       {stmt.period_start} to {stmt.period_end}")
            print(f"Transactions: {len(stmt.transactions)} found")

            print("\nSample Transactions:")
            print("-" * 80)
            print(f"{'Date':<12} | {'Amount':<10} | {'Merchant':<30} | {'Category'}")
            print("-" * 80)
            for tx in stmt.transactions[:10]:  # Show first 10
                print(
                    f"{tx.posted_date:<12} | {tx.amount:<10} | {str(tx.merchant or tx.description)[:30]:<30} | {tx.category_hint}"
                )

            remaining = len(stmt.transactions) - 10
            if remaining > 0:
                print(f"... and {remaining} more transactions.")

        else:
            print("\n--- 3. FAILED ---")
            print(f"Error Message: {response.error_message}")
            if response.raw_response:
                print("\nPartial/Raw Response Preview:")
                print(response.raw_response[:500] + "...")

    except Exception as e:
        print(f"CRITICAL ERROR: Parsing logic crashed: {e}")
        import traceback

        traceback.print_exc()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Test separate components of the parsing pipeline")
    parser.add_argument("pdf_path", help="Absolute or relative path to the PDF file")
    parser.add_argument(
        "--force-fallback", action="store_true", help="Force PDF upload fallback by ignoring extracted text"
    )
    args = parser.parse_args()

    test_parsing(args.pdf_path, args.force_fallback)
