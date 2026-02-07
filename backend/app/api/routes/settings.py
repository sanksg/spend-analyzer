"""
API Routes for Application Settings.
"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import AppSettings
from app.api.schemas import AppSettingCreate, AppSettingResponse

router = APIRouter()

@router.get("/", response_model=List[AppSettingResponse])
def get_settings(db: Session = Depends(get_db)):
    """Get all settings."""
    return db.query(AppSettings).all()

@router.get("/{key}", response_model=AppSettingResponse)
def get_setting_by_key(key: str, db: Session = Depends(get_db)):
    """Get a specific setting."""
    setting = db.query(AppSettings).filter(AppSettings.key == key).first()
    if not setting:
        # Return default or 404
        raise HTTPException(status_code=404, detail="Setting not found")
    return setting

@router.post("/", response_model=AppSettingResponse)
def create_or_update_setting(setting_in: AppSettingCreate, db: Session = Depends(get_db)):
    """Create or update a setting."""
    setting = db.query(AppSettings).filter(AppSettings.key == setting_in.key).first()
    
    if setting:
        setting.value = setting_in.value
        setting.value_type = setting_in.value_type
    else:
        setting = AppSettings(
            key=setting_in.key,
            value=setting_in.value,
            value_type=setting_in.value_type
        )
        db.add(setting)
        
    db.commit()
    db.refresh(setting)
    return setting
