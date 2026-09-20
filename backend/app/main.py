from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, dashboard, health, org, reports, status, templates, users
from app.core.config import settings
from app.core.errors import dang_ky_handler

app = FastAPI(title="HSSEQ PTSC", docs_url="/docs")
dang_ky_handler(app)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(health.router, prefix="/api/v1")
app.include_router(auth.router, prefix="/api/v1")
app.include_router(reports.router, prefix="/api/v1")
app.include_router(templates.router, prefix="/api/v1")
app.include_router(org.router, prefix="/api/v1")
app.include_router(status.router, prefix="/api/v1")
app.include_router(dashboard.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
