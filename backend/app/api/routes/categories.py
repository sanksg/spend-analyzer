"""Category management routes."""

from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.db.session import get_db
from app.db.models import Category, CategoryRule, Transaction, Statement, ParseJob, ParseStatus
from app.jobs.runner import create_parse_job, run_parse_job_background
from app.config import settings
from app.utils.plaid_taxonomy import load_plaid_categories, unique_category_names
from app.api.schemas import (
    CategoryResponse,
    CategoryListResponse,
    CategoryCreate,
    CategoryUpdate,
    CategoryRuleCreate,
    CategoryRuleResponse,
)


router = APIRouter()

OTHER_CATEGORY_NAME = "Other"

# Plaid Primary Category Color Mapping
PLAID_COLORS = {
    "INCOME": "#10B981",  # Emerald 500
    "TRANSFER": "#9CA3AF",  # Gray 400
    "RECURRING": "#8B5CF6",  # Violet 500
    "LOAN_PAYMENTS": "#6366F1",  # Indigo 500
    "BANK_FEES": "#EF4444",  # Red 500
    "ENTERTAINMENT": "#EC4899",  # Pink 500
    "FOOD_AND_DRINK": "#F97316",  # Orange 500
    "GENERAL_MERCHANDISE": "#F59E0B",  # Amber 500
    "HOME_IMPROVEMENT": "#06B6D4",  # Cyan 500
    "MEDICAL": "#F43F5E",  # Rose 500
    "PERSONAL_CARE": "#14B8A6",  # Teal 500
    "GENERAL_SERVICES": "#3B82F6",  # Blue 500
    "GOVERNMENT_AND_NON_PROFIT": "#64748B",  # Slate 500
    "TRANSPORTATION": "#0EA5E9",  # Sky 500
    "TRAVEL": "#A855F7",  # Purple 500
    "RENT_AND_UTILITIES": "#84CC16",  # Lime 500
}


def get_category_color(category_name: str) -> str:
    """Assign a color based on the primary category group."""
    if ":" in category_name:
        primary = category_name.split(":")[0].strip().upper()
        return PLAID_COLORS.get(primary, "#6B7280")

    if category_name == OTHER_CATEGORY_NAME:
        return "#94A3B8"  # Slate 400

    return "#6B7280"  # Default Gray


def category_to_response(category: Category, db: Session) -> CategoryResponse:
    """Convert Category model to response schema."""
    # Get transaction stats
    stats = (
        db.query(
            func.count(Transaction.id),
            func.coalesce(func.sum(Transaction.amount), 0),
        )
        .filter(
            Transaction.category_id == category.id,
            Transaction.excluded == False,
        )
        .first()
    )

    return CategoryResponse(
        id=category.id,
        name=category.name,
        description=category.description,
        color=category.color,
        icon=category.icon,
        is_default=category.is_default,
        plaid_primary=category.plaid_primary,
        plaid_detailed=category.plaid_detailed,
        transaction_count=stats[0] or 0,
        total_amount=stats[1] or Decimal("0"),
        created_at=category.created_at,
    )


@router.get("", response_model=CategoryListResponse)
async def list_categories(db: Session = Depends(get_db)):
    """List all categories with transaction stats."""
    categories = db.query(Category).order_by(Category.name).all()

    return CategoryListResponse(categories=[category_to_response(c, db) for c in categories])


@router.post("", response_model=CategoryResponse)
async def create_category(
    category: CategoryCreate,
    db: Session = Depends(get_db),
):
    """Create a new category."""
    # Check for duplicate name
    existing = db.query(Category).filter(Category.name == category.name).first()
    if existing:
        raise HTTPException(status_code=409, detail="Category with this name already exists")

    new_category = Category(**category.model_dump())
    db.add(new_category)
    db.commit()
    db.refresh(new_category)

    return category_to_response(new_category, db)


@router.get("/{category_id}", response_model=CategoryResponse)
async def get_category(category_id: int, db: Session = Depends(get_db)):
    """Get a specific category."""
    category = db.query(Category).filter(Category.id == category_id).first()

    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    return category_to_response(category, db)


@router.patch("/{category_id}", response_model=CategoryResponse)
async def update_category(
    category_id: int,
    update: CategoryUpdate,
    db: Session = Depends(get_db),
):
    """Update a category."""
    category = db.query(Category).filter(Category.id == category_id).first()

    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    # Check for duplicate name if name is being changed
    update_data = update.model_dump(exclude_unset=True)
    if "name" in update_data:
        existing = (
            db.query(Category)
            .filter(
                Category.name == update_data["name"],
                Category.id != category_id,
            )
            .first()
        )
        if existing:
            raise HTTPException(status_code=409, detail="Category with this name already exists")

    for field, value in update_data.items():
        setattr(category, field, value)

    db.commit()
    db.refresh(category)

    return category_to_response(category, db)


@router.delete("/{category_id}")
async def delete_category(category_id: int, db: Session = Depends(get_db)):
    """Delete a category."""
    category = db.query(Category).filter(Category.id == category_id).first()

    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    if category.is_default:
        raise HTTPException(status_code=400, detail="Cannot delete default categories")

    # Clear category from transactions
    db.query(Transaction).filter(Transaction.category_id == category_id).update(
        {Transaction.category_id: None, Transaction.category_source: None},
        synchronize_session=False,
    )

    db.delete(category)
    db.commit()

    return {"message": "Category deleted"}


# --- Category Rules ---


@router.get("/{category_id}/rules", response_model=list[CategoryRuleResponse])
async def list_category_rules(category_id: int, db: Session = Depends(get_db)):
    """List rules for a category."""
    category = db.query(Category).filter(Category.id == category_id).first()

    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    rules = db.query(CategoryRule).filter(CategoryRule.category_id == category_id).order_by(CategoryRule.priority).all()

    return [
        CategoryRuleResponse(
            id=r.id,
            category_id=r.category_id,
            category_name=category.name,
            pattern=r.pattern,
            is_regex=r.is_regex,
            match_field=r.match_field,
            priority=r.priority,
            enabled=r.enabled,
            created_at=r.created_at,
        )
        for r in rules
    ]


@router.post("/rules", response_model=CategoryRuleResponse)
async def create_category_rule(
    rule: CategoryRuleCreate,
    db: Session = Depends(get_db),
):
    """Create a new category rule."""
    category = db.query(Category).filter(Category.id == rule.category_id).first()

    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    new_rule = CategoryRule(**rule.model_dump())
    db.add(new_rule)
    db.commit()
    db.refresh(new_rule)

    return CategoryRuleResponse(
        id=new_rule.id,
        category_id=new_rule.category_id,
        category_name=category.name,
        pattern=new_rule.pattern,
        is_regex=new_rule.is_regex,
        match_field=new_rule.match_field,
        priority=new_rule.priority,
        enabled=new_rule.enabled,
        created_at=new_rule.created_at,
    )


@router.delete("/rules/{rule_id}")
async def delete_category_rule(rule_id: int, db: Session = Depends(get_db)):
    """Delete a category rule."""
    rule = db.query(CategoryRule).filter(CategoryRule.id == rule_id).first()

    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    db.delete(rule)
    db.commit()

    return {"message": "Rule deleted"}


@router.post("/import-plaid")
async def import_plaid_categories(
    background_tasks: BackgroundTasks,
    reset: bool = True,
    reclassify: bool = True,
    db: Session = Depends(get_db),
):
    """Import Plaid taxonomy categories from CSV.

    If reset=True, existing categories and rules are removed and
    transactions are uncategorized before importing.

    If reclassify=True, triggers re-parsing of ALL statements
    to apply new categories.
    """
    plaid_categories = unique_category_names(load_plaid_categories(settings.plaid_taxonomy_path))

    if reset:
        db.query(Transaction).update(
            {Transaction.category_id: None, Transaction.category_source: None},
            synchronize_session=False,
        )
        db.query(CategoryRule).delete()
        db.query(Category).delete()
        db.commit()

    existing_categories = {category.name.lower(): category for category in db.query(Category).all()}

    created = 0
    for category in plaid_categories:
        existing = existing_categories.get(category.name.lower())
        if existing:
            if not existing.plaid_primary or not existing.plaid_detailed:
                existing.plaid_primary = category.primary
                existing.plaid_detailed = category.detailed
            continue
        db.add(
            Category(
                name=category.name,
                description=category.description or None,
                plaid_primary=category.primary,
                plaid_detailed=category.detailed,
                color=get_category_color(category.name),
                is_default=False,
            )
        )
        existing_categories[category.name.lower()] = None
        created += 1

    if OTHER_CATEGORY_NAME.lower() not in existing_categories:
        db.add(
            Category(
                name=OTHER_CATEGORY_NAME,
                description="Fallback category",
                plaid_primary=None,
                plaid_detailed=None,
                color=get_category_color(OTHER_CATEGORY_NAME),
                is_default=False,
            )
        )
        created += 1

    db.commit()

    if reclassify:
        statements = db.query(Statement).all()
        jobs_started = 0
        for stmt in statements:
            # Skip if already running
            active = (
                db.query(ParseJob)
                .filter(
                    ParseJob.statement_id == stmt.id, ParseJob.status.in_([ParseStatus.PENDING, ParseStatus.PROCESSING])
                )
                .first()
            )

            if not active:
                job = create_parse_job(db, stmt.id)
                background_tasks.add_task(run_parse_job_background, stmt.id, job.id)
                jobs_started += 1

        return {
            "message": "Plaid categories imported and re-classification started",
            "created": created,
            "jobs_started": jobs_started,
        }

    return {"message": "Plaid categories imported", "created": created}
