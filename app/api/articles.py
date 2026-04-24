from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.schemas.article import (
    ArticleCreate,
    ArticleIndexResponse,
    ArticleListResponse,
    ArticleResponse,
    ArticleUpdate,
)
from app.services import article_service, embedding_service as emb_service

router = APIRouter(prefix="/api/articles", tags=["articles"])


@router.post("", response_model=ArticleResponse, status_code=201)
async def create_article(
    data: ArticleCreate,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
):
    article = await article_service.create_article(session, data, background_tasks)
    return article


@router.get("", response_model=ArticleListResponse)
async def list_articles(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    topic: str | None = Query(None),
    keyword: str | None = Query(None),
    session: AsyncSession = Depends(get_session),
):
    return await article_service.list_articles(session, page, limit, topic=topic, keyword=keyword)


@router.get("/index", response_model=ArticleIndexResponse)
async def articles_index(session: AsyncSession = Depends(get_session)):
    return await article_service.get_articles_index(session)


@router.get("/{article_id}", response_model=ArticleResponse)
async def get_article(
    article_id: str,
    session: AsyncSession = Depends(get_session),
):
    from uuid import UUID

    try:
        uid = UUID(article_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid article ID")

    article = await article_service.get_article(session, uid)
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    return article


@router.put("/{article_id}", response_model=ArticleResponse)
async def update_article(
    article_id: str,
    data: ArticleUpdate,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
):
    from uuid import UUID

    try:
        uid = UUID(article_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid article ID")

    article = await article_service.update_article(session, uid, data, background_tasks)
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    return article


@router.delete("/{article_id}", status_code=204)
async def delete_article(
    article_id: str,
    session: AsyncSession = Depends(get_session),
):
    from uuid import UUID

    try:
        uid = UUID(article_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid article ID")

    deleted = await article_service.delete_article(session, uid)
    if not deleted:
        raise HTTPException(status_code=404, detail="Article not found")
