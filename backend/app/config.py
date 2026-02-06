"""Application configuration settings."""

from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # API Keys
    gemini_api_key: str = ""

    # Database
    database_url: str = "sqlite:///./data/spend.db"

    # File Storage
    upload_dir: Path = Path("data/uploads")
    artifacts_dir: Path = Path("data/artifacts")

    # Parsing
    gemini_model: str = "gemini-1.5-flash"
    max_pdf_pages: int = 50
    parse_timeout_seconds: int = 120

    # Plaid taxonomy
    plaid_taxonomy_path: Path = Path("transactions-personal-finance-category-taxonomy.csv")

    # Server
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()

# Ensure directories exist
settings.upload_dir.mkdir(parents=True, exist_ok=True)
settings.artifacts_dir.mkdir(parents=True, exist_ok=True)
