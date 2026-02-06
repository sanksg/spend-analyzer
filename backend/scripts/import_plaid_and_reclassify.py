import asyncio
import os
import sys
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Add backend directory to python path
sys.path.insert(0, os.getcwd())

from app.db.session import SessionLocal
from app.api.routes.categories import import_plaid_categories
from app.jobs.runner import create_parse_job, run_parse_job
from app.db.models import Statement, ParseJob, ParseStatus


class DummyBackgroundTasks:
    def add_task(self, func, *args, **kwargs):
        pass


async def main():
    print("Initializing DB session...")
    db = SessionLocal()

    print("----------------------------------------------------------------")
    print("STEP 1: Importing Plaid Taxonomy Categories")
    print("----------------------------------------------------------------")
    # This function resets categories if reset=True and imports from CSV
    result = await import_plaid_categories(
        background_tasks=DummyBackgroundTasks(),
        reset=True,
        reclassify=False,
        db=db,
    )
    print(f"Result: {result}")

    print("\n----------------------------------------------------------------")
    print("STEP 2: Triggering Re-classification for All Statements")
    print("----------------------------------------------------------------")

    # Get all statements
    statements = db.query(Statement).all()
    if not statements:
        print("No statements found to process.")
        return

    print(f"Found {len(statements)} statements. Queuing jobs...")

    for stmt in statements:
        # Check if there's already a running job
        active_job = (
            db.query(ParseJob)
            .filter(
                ParseJob.statement_id == stmt.id,
                ParseJob.status.in_([ParseStatus.PENDING, ParseStatus.PROCESSING]),
            )
            .first()
        )

        if active_job:
            print(f"Statement {stmt.id} ({stmt.filename}): Skipping, job {active_job.id} already active.")
            continue

        # Create new job
        job = create_parse_job(db, stmt.id)
        print(f"Statement {stmt.id} ({stmt.filename}): Created re-parse job {job.id}")

        # Run job synchronously for this script so we can see output/errors immediately
        # In production this would be background_tasks
        try:
            print(f"  > Processing job {job.id}...")
            # Note: run_parse_job is synchronous CPU bound but might call async Gemini?
            # Looking at runner.py, run_parse_job seems to be synchronous wrapper or similar.
            # Wait, `run_parse_job` is NOT async in runner.py I believe. Let me check.
            # If it calls `parse_statement_with_gemini`, that might be sync or async.
            # `gemini_client.py` uses `genai.Client` which is usually sync unless using `aio`.

            run_parse_job(db, job.id)
            print(f"  > Job {job.id} completed with status: {job.status}")

        except Exception as e:
            print(f"  > Job {job.id} FAILED: {e}")

    print("\n----------------------------------------------------------------")
    print("All tasks completed.")


if __name__ == "__main__":
    asyncio.run(main())
