"""Utilities for loading Plaid transaction category taxonomy."""

from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


@dataclass(frozen=True)
class PlaidCategory:
    primary: str
    detailed: str
    description: str

    @property
    def name(self) -> str:
        return f"{self.primary}: {self.detailed}"


def load_plaid_categories(csv_path: Path) -> list[PlaidCategory]:
    if not csv_path.exists():
        raise FileNotFoundError(f"Plaid taxonomy CSV not found: {csv_path}")

    categories: list[PlaidCategory] = []
    with csv_path.open("r", newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            primary = (row.get("PRIMARY") or "").strip()
            detailed = (row.get("DETAILED") or "").strip()
            description = (row.get("DESCRIPTION") or "").strip()
            if not primary or not detailed:
                continue
            categories.append(PlaidCategory(primary=primary, detailed=detailed, description=description))

    return categories


def unique_category_names(categories: Iterable[PlaidCategory]) -> list[PlaidCategory]:
    seen = set()
    unique: list[PlaidCategory] = []
    for category in categories:
        if category.name.lower() in seen:
            continue
        seen.add(category.name.lower())
        unique.append(category)
    return unique
