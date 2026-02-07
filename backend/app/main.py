"""FastAPI application entry point."""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db.session import init_db
from app.api.routes import statements, transactions, categories, analytics, settings as settings_routes, insights

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database on startup."""
    init_db()
    yield


app = FastAPI(
    title="Spend Analyzer API",
    description="Parse credit card statements and analyze spending",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(statements.router, prefix="/api/statements", tags=["statements"])
app.include_router(transactions.router, prefix="/api/transactions", tags=["transactions"])
app.include_router(categories.router, prefix="/api/categories", tags=["categories"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["analytics"])
app.include_router(settings_routes.router, prefix="/api/settings", tags=["settings"])
app.include_router(insights.router, prefix="/api/insights", tags=["insights"])


@app.get("/")
async def root():
    """Health check endpoint."""
    return {"status": "ok", "message": "Spend Analyzer API"}


@app.get("/health")
async def health():
    """Health check for monitoring."""
    return {"status": "healthy"}
