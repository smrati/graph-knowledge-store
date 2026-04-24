import logging
import uuid
from asyncio import get_running_loop
from concurrent.futures import ThreadPoolExecutor
from functools import partial

from fastapi import BackgroundTasks
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.article import Article
from app.schemas.article import ArticleCreate, ArticleIndexResponse, ArticleListResponse, ArticleListItem, ArticleUpdate
from app.services.embedding_service import generate_and_store_embeddings
from app.services.extraction_service import extract_metadata

logger = logging.getLogger(__name__)

_executor = ThreadPoolExecutor(max_workers=4)


async def create_article(
    session: AsyncSession, data: ArticleCreate, background_tasks: BackgroundTasks
) -> Article:
    loop = get_running_loop()
    from app.services.llm_service import generate_title, normalize_markdown_equations

    title = data.title
    if not title or not title.strip():
        title = await loop.run_in_executor(_executor, generate_title, data.content)

    content = data.content
    if data.fix_equations:
        content = await loop.run_in_executor(_executor, normalize_markdown_equations, content)

    article = Article(title=title, content=content)
    session.add(article)
    await session.commit()
    await session.refresh(article)

    background_tasks.add_task(_enrich_article, article.id, article.title, article.content)
    return article


async def get_article(session: AsyncSession, article_id: uuid.UUID) -> Article | None:
    result = await session.execute(select(Article).where(Article.id == article_id))
    return result.scalar_one_or_none()


async def list_articles(
    session: AsyncSession, page: int = 1, limit: int = 20
) -> ArticleListResponse:
    offset = (page - 1) * limit
    total_result = await session.execute(select(func.count()).select_from(Article))
    total = total_result.scalar() or 0

    result = await session.execute(
        select(Article).order_by(Article.updated_at.desc()).offset(offset).limit(limit)
    )
    articles = result.scalars().all()

    return ArticleListResponse(
        articles=[ArticleListItem.model_validate(a) for a in articles],
        total=total,
        page=page,
        limit=limit,
    )


async def get_articles_index(session: AsyncSession) -> ArticleIndexResponse:
    from app.schemas.article import ArticleIndexItem

    result = await session.execute(
        select(Article.id, Article.title, Article.summary, Article.keywords)
        .order_by(Article.updated_at.desc())
    )
    rows = result.all()
    articles = [
        ArticleIndexItem(id=r[0], title=r[1], summary=r[2], keywords=r[3] or [])
        for r in rows
    ]
    return ArticleIndexResponse(articles=articles)


async def update_article(
    session: AsyncSession,
    article_id: uuid.UUID,
    data: ArticleUpdate,
    background_tasks: BackgroundTasks,
) -> Article | None:
    article = await get_article(session, article_id)
    if not article:
        return None

    re_enrich = False
    if data.title is not None:
        article.title = data.title
    if data.content is not None:
        content = data.content
        if data.fix_equations:
            loop = get_running_loop()
            from app.services.llm_service import normalize_markdown_equations
            content = await loop.run_in_executor(_executor, normalize_markdown_equations, content)
        article.content = content
        re_enrich = True

    await session.commit()
    await session.refresh(article)

    if re_enrich:
        background_tasks.add_task(_enrich_article, article.id, article.title, article.content)

    return article


async def delete_article(session: AsyncSession, article_id: uuid.UUID) -> bool:
    article = await get_article(session, article_id)
    if not article:
        return False

    from app.services.graph_service import delete_article_from_graph
    loop = get_running_loop()
    await loop.run_in_executor(_executor, delete_article_from_graph, article_id)

    await session.execute(delete(Article).where(Article.id == article_id))
    await session.commit()
    return True


async def _enrich_article(article_id: uuid.UUID, title: str, content: str) -> None:
    from app.database import async_session_factory

    async with async_session_factory() as session:
        try:
            result = await session.execute(
                select(Article).where(Article.id == article_id)
            )
            article = result.scalar_one_or_none()
            if not article:
                return

            article.enrichment_status = "processing"
            await session.commit()

            loop = get_running_loop()
            metadata = await loop.run_in_executor(_executor, extract_metadata, content)

            article.topics = metadata["topics"]
            article.keywords = metadata["keywords"]
            article.entities = metadata["entities"]
            article.summary = metadata["summary"]
            article.enrichment_status = "completed"
            await session.commit()

            await generate_and_store_embeddings(session, article_id, f"{title}\n\n{content}")

            from app.services.graph_service import sync_article_to_graph
            await loop.run_in_executor(
                _executor,
                partial(sync_article_to_graph, article_id, title, metadata["topics"], metadata["keywords"], metadata["entities"]),
            )

            logger.info(f"Article {article_id} enriched, embedded, and synced to graph")
        except Exception as e:
            logger.error(f"Enrichment failed for article {article_id}: {e}")
            try:
                article.enrichment_status = "failed"
                await session.commit()
            except Exception:
                pass
