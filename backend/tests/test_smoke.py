import os
import sys
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from pathlib import Path

# Add backend directory to path
sys.path.append(os.getcwd())

from app.db.models import Base, Category
from app.config import settings
from app.utils.plaid_taxonomy import load_plaid_categories, unique_category_names
from app.parsing.gemini_client import USER_PROMPT_TEMPLATE

# Use an in-memory DB for this smoke test
TEST_DB_URL = "sqlite:///:memory:"


@pytest.fixture(scope="module")
def db_session():
    engine = create_engine(TEST_DB_URL)
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    yield session
    session.close()


def test_plaid_taxonomy_file_exists():
    """Verify that the Plaid CSV exists where config expects it."""
    path = settings.plaid_taxonomy_path
    print(f"Checking for CSV at: {path.absolute()}")
    assert path.exists(), f"Plaid taxonomy CSV not found at {path.absolute()}"


def test_plaid_parsing():
    """Verify that we can parse the Plaid CSV."""
    path = settings.plaid_taxonomy_path
    if not path.exists():
        pytest.skip("CSV not found")

    categories = list(load_plaid_categories(path))
    assert len(categories) > 0, "No categories loaded from CSV"

    # Check structure
    first = categories[0]
    assert hasattr(first, "primary")
    assert hasattr(first, "detailed")
    assert hasattr(first, "description")

    # Check deduplication
    unique = list(unique_category_names(categories))
    assert len(unique) > 0
    assert len(unique) <= len(categories)

    # Check a specific known category if possible, or just format
    print(f"Loaded {len(unique)} unique categories")


def test_gemini_prompt_updated():
    """Verify that the Gemini prompt was updated to include valid categories."""
    assert "{category_list}" in USER_PROMPT_TEMPLATE, "Prompt template missing {category_list} placeholder"


def test_db_category_insertion(db_session):
    """Test inserting a category into the DB."""
    cat = Category(name="Test Category", description="Test Desc")
    db_session.add(cat)
    db_session.commit()

    stored = db_session.query(Category).first()
    assert stored.name == "Test Category"
