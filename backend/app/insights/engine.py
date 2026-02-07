"""
Generic Data Analysis Engine.
Abstracts the LLM provider (using LiteLLM) to perform Text-to-SQL tasks.
"""

import logging
from typing import Any, Dict, List, Optional
from sqlalchemy import text, inspect
from sqlalchemy.orm import Session
from decimal import Decimal
from datetime import date, datetime

# We use litellm to be provider-agnostic
from litellm import completion
from app.config import settings

logger = logging.getLogger(__name__)

# --- 1. Schema Context Generator ---

def get_database_schema(session: Session) -> str:
    """
    Generates a minimal text representation of the database schema for the LLM.
    Focuses on Transactions, Statements, and Categories.
    """
    inspector = inspect(session.bind)
    schema_text = []

    # Whitelist tables to expose to LLM for analysis
    allowed_tables = ["transactions", "statements", "categories", "subscriptions"]

    for table_name in allowed_tables:
        columns = inspector.get_columns(table_name)
        col_desc = []
        for col in columns:
            col_name = col["name"]
            col_type = str(col["type"])
            # Simplify types for LLM understanding
            if "VARCHAR" in col_type or "TEXT" in col_type:
                col_type = "TEXT"
            elif "INTEGER" in col_type:
                col_type = "INT"
            elif "NUMERIC" in col_type or "FLOAT" in col_type:
                col_type = "DECIMAL"
            elif "DATE" in col_type:
                col_type = "DATE"
            
            col_desc.append(f"{col_name} ({col_type})")
        
        schema_text.append(f"Table: {table_name}")
        schema_text.append(f"Columns: {', '.join(col_desc)}")
        schema_text.append("")

    return "\n".join(schema_text)


# --- 2. SQL Generation & Execution ---

SYSTEM_PROMPT_SQL = """You are an expert SQL analyst using SQLite. 
Your task is to convert natural language financial questions into a valid SQL query.

Rules:
1. ONLY return the raw SQL query. Do not wrap in markdown blocks like ```sql ... ```.
2. Use SQLite syntax.
3. The table names are: transactions, statements, categories, subscriptions.
4. For amounts, 'transactions.amount' is positive for debits (spend) and negative for credits (returns/payments).
   - If asking for "spending", filter for amount > 0.
   - If asking for "income" or "payments", filter for amount < 0.
5. Dates are in 'YYYY-MM-DD' format.
   - If user asks for a specific year (e.g. "2024"), filter ONLY by `posted_year = 2024`. Do NOT infer a month.
   - If user asks for a month (e.g. "Jan 2024"), filter by `posted_month = 1 AND posted_year = 2024`.
6. Do NOT perform any INSERT, UPDATE, DELETE, or DROP operations. SELECT only.
7. If the answer requires joining Categories, join on 'transactions.category_id = categories.id'.
8. String Matching:
   - For merchants, prefer `merchant_normalized LIKE '%Name%'` OR `description LIKE '%Name%'`.
   - Never use exact equality (=) for names unless completely sure.
"""

def generate_sql_query(user_question: str, schema_context: str, model: str = None) -> str:
    """
    Asks the LLM to generate a SQL query for the question.
    Using litellm for provider abstraction.
    """
    if model is None:
        model = settings.analysis_model

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT_SQL},
        {"role": "user", "content": f"Schema:\n{schema_context}\n\nQuestion: {user_question}"}
    ]

    try:
        # Pass api_key explicitly if needed, or rely on env vars
        response = completion(
            model=model, 
            messages=messages,
            api_key=settings.gemini_api_key
        )
        content = response.choices[0].message.content
        
        # Clean up markdown if the LLM ignored instructions
        clean_sql = content.replace("```sql", "").replace("```", "").strip()
        return clean_sql
    except Exception as e:
        logger.error(f"LLM generation failed: {e}")
        raise ValueError("Could not understand the question.")


def execute_safe_query(session: Session, sql_query: str) -> List[Dict[str, Any]]:
    """
    Executes the SQL query safely (Read-Only).
    """
    # basic injection/safety check
    forbidden = ["DROP", "DELETE", "UPDATE", "INSERT", "ALTER", "TRUNCATE", "GRANT"]
    if any(word in sql_query.upper() for word in forbidden):
        raise ValueError("Unsafe query detected. Read-only access allowed.")

    try:
        result = session.execute(text(sql_query))
        # Convert to list of dicts
        rows = []
        for row in result:
            rows.append(dict(row._mapping))
        return rows
    except Exception as e:
        logger.error(f"SQL execution failed: {e}")
        raise ValueError(f"Could not execute query: {str(e)}")


# --- 3. Result Summarization ---

def summarize_results(user_question: str, data: List[Dict], model: str = "gemini/gemini-1.5-flash") -> str:
    """
    Converts the raw data back into a natural language response.
    """
    if str(data) == "[]":
        return "I couldn't find any data matching your request."

    messages = [
        {"role": "system", "content": "You are a helpful financial assistant. Visualize and summarize the provided data query results for the user in a concise, friendly way."},
        {"role": "user", "content": f"Question: {user_question}\n\nData Results:\n{str(data)}"}
    ]

    try:
        response = completion(
            model=model,
            messages=messages,
            api_key=settings.gemini_api_key
        )
        return response.choices[0].message.content
    except Exception as e:
        return "Here is the data I found: " + str(data)


# --- Public Interface ---

async def analyze_question(session: Session, question: str) -> Dict[str, Any]:
    """
    Main entry point for "Ask your Data".
    Returns { "answer": str, "sql": str, "data": list }
    """
    # 1. Get Schema
    schema = get_database_schema(session)
    
    # 2. Generate SQL
    sql = generate_sql_query(question, schema)
    
    # 3. Execute
    data = execute_safe_query(session, sql)
    
    # 4. Summarize
    answer = summarize_results(question, data)
    
    return {
        "answer": answer,
        "generated_sql": sql,
        "raw_data": data
    }
