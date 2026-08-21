from fastapi import APIRouter
from app.schemas.project import HealthResponse
from app.core.config import get_settings
from app.db.neo4j import get_neo4j_driver
from app.db.qdrant import get_qdrant_client
from app.db.postgres import engine

settings = get_settings()
router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health_check():
    services: dict[str, str] = {}

    # PostgreSQL
    try:
        async with engine.connect() as conn:
            await conn.execute(__import__("sqlalchemy").text("SELECT 1"))
        services["postgres"] = "ok"
    except Exception as e:
        services["postgres"] = f"error: {e}"

    # Neo4j
    try:
        driver = await get_neo4j_driver()
        await driver.verify_connectivity()
        services["neo4j"] = "ok"
    except Exception as e:
        services["neo4j"] = f"error: {e}"

    # Qdrant
    try:
        client = await get_qdrant_client()
        await client.get_collections()
        services["qdrant"] = "ok"
    except Exception as e:
        services["qdrant"] = f"error: {e}"

    overall = "ok" if all(v == "ok" for v in services.values()) else "degraded"
    return HealthResponse(status=overall, version=settings.APP_VERSION, services=services)
