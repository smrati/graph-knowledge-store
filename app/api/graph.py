import asyncio
import uuid

from concurrent.futures import ThreadPoolExecutor
from fastapi import APIRouter, HTTPException

from app.services.graph_service import get_article_neighbors, get_article_subgraph, get_full_graph, get_graph_stats

router = APIRouter(prefix="/api/graph", tags=["graph"])
_executor = ThreadPoolExecutor(max_workers=4)


@router.get("/article/{article_id}/neighbors")
async def article_neighbors(article_id: str, limit: int = 10):
    try:
        uid = uuid.UUID(article_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid article ID")
    loop = asyncio.get_event_loop()
    neighbors = await loop.run_in_executor(_executor, get_article_neighbors, uid, limit)
    return {"article_id": article_id, "neighbors": neighbors}


@router.get("/article/{article_id}/subgraph")
async def article_subgraph(article_id: str, depth: int = 2):
    try:
        uid = uuid.UUID(article_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid article ID")
    loop = asyncio.get_event_loop()
    subgraph = await loop.run_in_executor(_executor, get_article_subgraph, uid, depth)
    return {"article_id": article_id, "subgraph": subgraph}


@router.get("/full")
async def full_graph():
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, get_full_graph)


@router.get("/stats")
async def graph_stats():
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, get_graph_stats)
