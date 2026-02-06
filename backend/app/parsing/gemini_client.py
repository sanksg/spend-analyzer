"""Google Gemini client for parsing credit card statements."""

import json
import re
from typing import Optional
from pathlib import Path
import fitz  # PyMuPDF
from google import genai
from google.genai import types

from app.config import settings
from app.parsing.schemas import ParsedStatement, ParsedTransaction, GeminiParseRequest, GeminiParseResponse

import logging

logger = logging.getLogger(__name__)


# Configure Gemini
def get_gemini_client():
    """Get configured Gemini client."""
    return genai.Client(api_key=settings.gemini_api_key)


SYSTEM_PROMPT = """You are a financial document parser specializing in credit card statements.
Your task is to extract transaction data from the provided statement text.

IMPORTANT RULES:
1. Extract ALL transactions you can find
2. Dates should be in YYYY-MM-DD format
3. Amounts should be positive for debits (money spent), negative for credits (refunds/payments)
4. If currency is not clear, assume INR (Indian Rupees)
5. Set needs_review=true if you're uncertain about any field
6. Set confidence between 0-1 based on how clear the data is
7. Try to identify the merchant name from the description
8. For category_hint, choose ONLY from the provided allowed category list; if nothing fits, use "Other"
9. There might be ads and non-transaction text in the pdf; ignore those

RESPOND WITH VALID JSON ONLY. No markdown, no explanation, just the JSON object."""

USER_PROMPT_TEMPLATE = """Parse the following credit card statement and extract all transactions.

Statement filename: {filename}
Number of pages: {page_count}

Allowed categories (category_hint MUST be one of these EXACT values):
{category_list}

--- STATEMENT TEXT ---
{statement_text}
--- END OF STATEMENT ---

Return a JSON object with this exact structure:
{{
    "source_name": "Bank/Card issuer name or null",
    "period_start": "YYYY-MM-DD or null",
    "period_end": "YYYY-MM-DD or null",
    "account_number_last4": "last 4 digits or null",
    "transactions": [
        {{
            "posted_date": "YYYY-MM-DD",
            "description": "transaction description",
            "amount": 123.45,
            "currency": "INR",
            "merchant": "merchant name or null",
            "category_hint": "suggested category or null",
            "confidence": 0.95,
            "needs_review": false,
            "raw_text": "original line from statement",
            "page_number": 1
        }}
    ],
    "parsing_notes": "any issues encountered or null"
}}"""


def extract_json_from_response(text: str) -> Optional[dict]:
    """Extract JSON from Gemini response, handling markdown code blocks."""
    # Try to find JSON in code blocks
    json_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if json_match:
        text = json_match.group(1)

    # Try direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Try to find JSON object in text
    try:
        start = text.index("{")
        end = text.rindex("}") + 1
        return json.loads(text[start:end])
    except (ValueError, json.JSONDecodeError):
        return None


def parse_statement_with_gemini(request: GeminiParseRequest, debug: bool = False) -> GeminiParseResponse:
    """
    Parse a credit card statement using Google Gemini.

    Args:
        request: The parse request with statement text

    Returns:
        GeminiParseResponse with parsed transactions or error
    """
    if not settings.gemini_api_key:
        return GeminiParseResponse(
            success=False,
            error_message="GEMINI_API_KEY not configured",
            model_used=settings.gemini_model,
        )

    try:
        client = get_gemini_client()

        category_list = request.categories or ["Other"]
        category_list_text = "\n".join(f"- {name}" for name in category_list)

        contents = [SYSTEM_PROMPT]

        # Check for fallback or direct file mode: if text is too short (< 100 chars per page approx, or just absolutely short < 200 chars total)
        use_file_fallback = request.file_path and (
            not request.statement_text or len(request.statement_text.strip()) < 200
        )

        if use_file_fallback:
            logger.info(f"Using PDF fallback for {request.filename or 'document'}")
            file_prompt = f"""Parse the attached credit card statement document and extract all transactions.

Statement filename: {request.filename or "unknown"}
Number of pages: {request.page_count or "unknown"}

Allowed categories (category_hint MUST be one of these EXACT values):
{category_list_text}

Return a JSON object with this exact structure:
{{
    "source_name": "Bank/Card issuer name or null",
    "period_start": "YYYY-MM-DD or null",
    "period_end": "YYYY-MM-DD or null",
    "account_number_last4": "last 4 digits or null",
    "transactions": [
        {{
            "posted_date": "YYYY-MM-DD",
            "description": "transaction description",
            "amount": 123.45,
            "currency": "INR",
            "merchant": "merchant name or null",
            "category_hint": "suggested category or null",
            "confidence": 0.95,
            "needs_review": false,
            "raw_text": "original line from statement",
            "page_number": 1
        }}
    ],
    "parsing_notes": "any issues encountered or null"
}}"""
            contents.append(file_prompt)

            # Read file and append as part
            file_bytes = None
            if request.password:
                try:
                    logger.info("Decrypting PDF for Gemini...")
                    doc = fitz.open(request.file_path)
                    doc.authenticate(request.password)
                    # Create a decrypted copy in memory
                    file_bytes = doc.tobytes()
                    doc.close()
                except Exception as e:
                    logger.error(f"Failed to decrypt PDF for Gemini: {e}")

            if not file_bytes:
                with open(request.file_path, "rb") as f:
                    file_bytes = f.read()

            contents.append(types.Part.from_bytes(data=file_bytes, mime_type="application/pdf"))

        else:
            # Text mode
            user_prompt = USER_PROMPT_TEMPLATE.format(
                filename=request.filename or "unknown",
                page_count=request.page_count or "unknown",
                category_list=category_list_text,
                statement_text=request.statement_text[:50000],  # Limit text length
            )
            contents.append(user_prompt)

        if debug:
            print("System Prompt:", SYSTEM_PROMPT)
            print(f"Contents length: {len(contents)}")

        # Call Gemini
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=contents,
            config=types.GenerateContentConfig(
                temperature=0.1,  # Low temperature for consistent parsing
                response_mime_type="application/json",
            ),
        )

        raw_response = response.text
        # Extract JSON from response
        parsed_json = extract_json_from_response(raw_response)

        if debug:
            print("Raw Gemini Response:", raw_response)
            print("Extracted JSON:", parsed_json)

        if not parsed_json:
            logger.info("Direct JSON extraction failed. Attempting repair...")
            # Try to repair the JSON
            parsed_json = repair_json_with_gemini(raw_response)

        if not parsed_json:
            return GeminiParseResponse(
                success=False,
                error_message="Failed to extract valid JSON from Gemini response",
                raw_response=raw_response,
                model_used=settings.gemini_model,
            )

        # Validate and parse with Pydantic
        try:
            parsed_statement = ParsedStatement(**parsed_json)
        except Exception as e:
            return GeminiParseResponse(
                success=False,
                error_message=f"JSON validation failed: {str(e)}",
                raw_response=raw_response,
                model_used=settings.gemini_model,
            )

        return GeminiParseResponse(
            success=True,
            parsed_statement=parsed_statement,
            raw_response=raw_response,
            model_used=settings.gemini_model,
        )

    except Exception as e:
        return GeminiParseResponse(
            success=False,
            error_message=f"Gemini API error: {str(e)}",
            model_used=settings.gemini_model,
        )


def repair_json_with_gemini(broken_json: str) -> Optional[dict]:
    """
    Use Gemini to repair malformed JSON.

    Args:
        broken_json: The malformed JSON string

    Returns:
        Repaired JSON dict or None
    """
    if not settings.gemini_api_key:
        return None

    try:
        client = get_gemini_client()

        # If JSON is truncated (common case check)
        is_truncated = not broken_json.strip().endswith("}")

        instruction = "The following JSON is malformed."
        if is_truncated:
            instruction += " It appears to be truncated. Please complete the JSON structure, closing all arrays and objects. Ensure the JSON is valid."
        else:
            instruction += " Fix syntax errors and return ONLY valid JSON."

        prompt = f"""{instruction}

RETURN ONLY VALID JSON.

{broken_json[-30000:]}"""
        # We only send the last 30k chars to context to avoid token limits if we want to just close it?
        # WAIT: If we send only tail, we lose the start.
        # If we send everything, we might hit input limits or confuse it?
        # Gemini 1.5 Flash has huge context window (1M tokens). Input is fine.
        # The OUTPUT limit is the problem.

        # If output was truncated, asking to "complete" it might mean outputting the REST.
        # But we need the FULL JSON to parse it.
        # If the full JSON > 8kb, we can't get it in one shot.

        # Strategy: Ask to "Close the JSON gracefully so it is valid, even if it means cutting off the last incomplete item."

        prompt = f"""The following JSON output was truncated.
        
Please repair it by:
1. Identifying the last complete transaction object.
2. Closing the 'transactions' array and the main object properly.
3. discarding the incomplete tail.

Return the valid JSON string.

--- BROKEN JSON ---
{broken_json}
"""

        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0,
                max_output_tokens=8192,
            ),
        )

        return extract_json_from_response(response.text)

    except Exception as e:
        logger.error(f"JSON repair failed: {e}")
        return None
