"""
Rebuild the Neo4j knowledge graph and re-generate embeddings from Postgres data.

Usage:
    python scripts/rebuild_graph.py                  # rebuild all articles
    python scripts/rebuild_graph.py --graph-only      # skip embeddings, only rebuild Neo4j
    python scripts/rebuild_graph.py --embeddings-only # skip Neo4j, only regenerate embeddings
"""

import argparse
import asyncio
import logging
import sys
import uuid
from concurrent.futures import ThreadPoolExecutor
from functools import partial

from sqlalchemy import select

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

_executor = ThreadPoolExecutor(max_workers=2)


async def get_all_articles(session):
    from app.models.article import Article

    result = await session.execute(
        select(Article.id, Article.title, Article.content).order_by(Article.created_at)
    )
    return result.all()


async def clear_neo4j():
    from app.graph.neo4j_client import get_session

    with get_session() as session:
        session.run("MATCH (n) DETACH DELETE n")
    logger.info("Neo4j graph cleared")


async def process_article(
    article_id: uuid.UUID,
    title: str,
    content: str,
    do_graph: bool,
    do_embeddings: bool,
    index: int,
    total: int,
):
    from app.database import async_session_factory

    async with async_session_factory() as session:
        try:
            if do_graph:
                from app.services.extraction_service import extract_metadata
                from app.services.graph_service import sync_article_to_graph

                loop = asyncio.get_running_loop()
                metadata = await loop.run_in_executor(
                    _executor, extract_metadata, content
                )

                await loop.run_in_executor(
                    _executor,
                    partial(
                        sync_article_to_graph,
                        article_id,
                        title,
                        metadata["topics"],
                        metadata["keywords"],
                        metadata["entities"],
                    ),
                )

                from app.models.article import Article

                result = await session.execute(
                    select(Article).where(Article.id == article_id)
                )
                article = result.scalar_one_or_none()
                if article:
                    article.topics = metadata["topics"]
                    article.keywords = metadata["keywords"]
                    article.entities = metadata["entities"]
                    article.summary = metadata["summary"]
                    article.enrichment_status = "completed"
                    await session.commit()

            if do_embeddings:
                from app.services.embedding_service import generate_and_store_embeddings

                await generate_and_store_embeddings(
                    session, article_id, f"{title}\n\n{content}"
                )

            logger.info(
                "[%d/%d] Processed: %s", index + 1, total, title
            )
        except Exception as e:
            logger.error("[%d/%d] FAILED: %s — %s", index + 1, total, title, e)


async def main():
    parser = argparse.ArgumentParser(description="Rebuild Neo4j graph and/or embeddings")
    parser.add_argument("--graph-only", action="store_true", help="Only rebuild Neo4j graph")
    parser.add_argument("--embeddings-only", action="store_true", help="Only regenerate embeddings")
    args = parser.parse_args()

    do_graph = not args.embeddings_only
    do_embeddings = not args.graph_only

    if not do_graph and not do_embeddings:
        print("ERROR: Select at least one of --graph-only or --embeddings-only (or neither for both)")
        sys.exit(1)

    from app.database import async_session_factory

    print("=" * 50)
    print("Knowledge Store — Rebuild Tool")
    print("=" * 50)
    print()
    if do_graph:
        print("  [x] Rebuild Neo4j knowledge graph")
    if do_embeddings:
        print("  [x] Re-generate vector embeddings")
    print()

    async with async_session_factory() as session:
        articles = await get_all_articles(session)

    if not articles:
        print("No articles found in database.")
        return

    print(f"Found {len(articles)} articles to process.")
    print()

    if do_graph:
        print("Clearing Neo4j graph...")
        await clear_neo4j()
        print()

    print(f"Processing {len(articles)} articles...")
    print()

    success = 0
    failed = 0
    for i, (article_id, title, content) in enumerate(articles):
        try:
            await process_article(article_id, title, content, do_graph, do_embeddings, i, len(articles))
            success += 1
        except Exception as e:
            failed += 1
            logger.error("Failed to process article %s: %s", title, e)

    print()
    print("=" * 50)
    print(f"Done! {success} succeeded, {failed} failed out of {len(articles)} articles.")
    print("=" * 50)


if __name__ == "__main__":
    asyncio.run(main())
