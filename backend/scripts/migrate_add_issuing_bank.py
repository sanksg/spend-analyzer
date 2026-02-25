"""Add issuing_bank column to statements table if missing."""
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parents[1] / "data" / "spend.db"


def column_exists(conn: sqlite3.Connection, table: str, column: str) -> bool:
    cursor = conn.execute(f"PRAGMA table_info({table})")
    cols = [row[1] for row in cursor.fetchall()]
    return column in cols


def main() -> None:
    if not DB_PATH.exists():
        print(f"Database not found at {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    try:
        if not column_exists(conn, "statements", "issuing_bank"):
            conn.execute("ALTER TABLE statements ADD COLUMN issuing_bank VARCHAR(100)")
            conn.commit()
            print("Added issuing_bank column to statements")
        else:
            print("issuing_bank column already exists")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
