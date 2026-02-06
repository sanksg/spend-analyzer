"""File storage utilities for uploads and artifacts."""

import hashlib
import shutil
from pathlib import Path
from datetime import datetime
from typing import Optional
from dataclasses import dataclass

from app.config import settings


@dataclass
class SavedFile:
    """Result of saving an uploaded file."""

    filename: str
    file_path: Path
    file_hash: str
    file_size: int


def compute_file_hash(file_path: Path) -> str:
    """Compute SHA256 hash of a file."""
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            sha256_hash.update(chunk)
    return sha256_hash.hexdigest()


def save_upload(
    file_content: bytes,
    original_filename: str,
    statement_id: Optional[int] = None,
) -> SavedFile:
    """
    Save an uploaded file to the uploads directory.

    Args:
        file_content: Raw file bytes
        original_filename: Original filename from upload
        statement_id: Optional statement ID for organizing

    Returns:
        SavedFile with path and metadata
    """
    # Compute hash for deduplication
    file_hash = hashlib.sha256(file_content).hexdigest()

    # Create timestamped directory
    date_dir = datetime.now().strftime("%Y/%m")
    upload_dir = settings.upload_dir / date_dir
    upload_dir.mkdir(parents=True, exist_ok=True)

    # Generate unique filename
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_filename = "".join(c for c in original_filename if c.isalnum() or c in "._-")
    if statement_id:
        new_filename = f"{statement_id}_{timestamp}_{safe_filename}"
    else:
        new_filename = f"{timestamp}_{file_hash[:8]}_{safe_filename}"

    file_path = upload_dir / new_filename

    # Write file
    with open(file_path, "wb") as f:
        f.write(file_content)

    return SavedFile(
        filename=original_filename,
        file_path=file_path,
        file_hash=file_hash,
        file_size=len(file_content),
    )


def get_artifact_path(statement_id: int, artifact_type: str, extension: str = "txt") -> Path:
    """
    Get path for storing parsing artifacts.

    Args:
        statement_id: ID of the statement
        artifact_type: Type of artifact (e.g., "extracted_text", "gemini_response")
        extension: File extension

    Returns:
        Path for the artifact file
    """
    artifact_dir = settings.artifacts_dir / str(statement_id)
    artifact_dir.mkdir(parents=True, exist_ok=True)
    return artifact_dir / f"{artifact_type}.{extension}"


def save_artifact(statement_id: int, artifact_type: str, content: str, extension: str = "txt") -> Path:
    """Save a parsing artifact to disk."""
    path = get_artifact_path(statement_id, artifact_type, extension)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    return path


def delete_statement_files(statement_id: int, file_path: Optional[Path] = None) -> None:
    """Delete all files associated with a statement."""
    # Delete uploaded file
    if file_path and file_path.exists():
        file_path.unlink()

    # Delete artifacts directory
    artifact_dir = settings.artifacts_dir / str(statement_id)
    if artifact_dir.exists():
        shutil.rmtree(artifact_dir)
