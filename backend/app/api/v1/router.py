from fastapi import APIRouter
from app.api.v1.endpoints import auth, projects, health, github, overview

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(projects.router)
api_router.include_router(github.router)
api_router.include_router(overview.router)
