import re
from asyncio import get_running_loop
from concurrent.futures import ThreadPoolExecutor

from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.embedding import ArticleEmbedding
from app.services.llm_service import embed

_executor = ThreadPoolExecutor(max_workers=4)

OVERLAP = 50
MIN_CHUNK = 100
MAX_CHUNK = 1000


def chunk_text(text: str) -> list[str]:
    paragraphs = re.split(r"\n\n+", text)
    chunks: list[str] = []
    current = ""

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        if len(current) + len(para) < MIN_CHUNK:
            current = f"{current}\n\n{para}" if current else para
        elif len(current) + len(para) > MAX_CHUNK:
            if current:
                chunks.append(current)
            if len(para) > MAX_CHUNK:
                sentences = re.split(r"(?<=[.!?])\s+", para)
                sent_chunk = ""
                for s in sentences:
                    if len(sent_chunk) + len(s) > MAX_CHUNK:
                        if sent_chunk:
                            chunks.append(sent_chunk)
                        sent_chunk = s
                    else:
                        sent_chunk = f"{sent_chunk} {s}" if sent_chunk else s
                if sent_chunk:
                    current = sent_chunk
                else:
                    current = ""
            else:
                current = para
        else:
            current = f"{current}\n\n{para}" if current else para

    if current:
        chunks.append(current)

    if not chunks:
        chunks = [text]

    overlapped = []
    for i, chunk in enumerate(chunks):
        if i > 0 and OVERLAP > 0 and len(chunks[i - 1]) >= OVERLAP:
            chunk = chunks[i - 1][-OVERLAP:] + "\n" + chunk
        overlapped.append(chunk)

    return overlapped


async def generate_and_store_embeddings(session: AsyncSession, article_id, content: str) -> None:
    await session.execute(delete(ArticleEmbedding).where(ArticleEmbedding.article_id == article_id))

    chunks = chunk_text(content)
    if not chunks:
        return

    loop = get_running_loop()
    vectors = await loop.run_in_executor(_executor, embed, chunks)

    for i, (chunk, vector) in enumerate(zip(chunks, vectors)):
        embedding = ArticleEmbedding(
            article_id=article_id,
            chunk_text=chunk,
            chunk_index=i,
            embedding=vector,
        )
        session.add(embedding)

    await session.commit()


async def delete_embeddings(session: AsyncSession, article_id) -> None:
    await session.execute(delete(ArticleEmbedding).where(ArticleEmbedding.article_id == article_id))
    await session.commit()


async def search_similar(session: AsyncSession, query: str, limit: int = 10) -> list[dict]:
    loop = get_running_loop()
    query_vector = (await loop.run_in_executor(_executor, embed, [query]))[0]

    stmt = text(
        """
        SELECT a.id, a.title, a.summary, a.topics, a.enrichment_status,
               a.created_at, a.updated_at,
               MAX(1 - (e.embedding <=> :query_vector)) AS score
        FROM article_embeddings e
        JOIN articles a ON a.id = e.article_id
        GROUP BY a.id, a.title, a.summary, a.topics, a.enrichment_status,
                 a.created_at, a.updated_at
        ORDER BY score DESC
        LIMIT :limit
        """
    )

    result = await session.execute(stmt, {"query_vector": str(query_vector), "limit": limit})
    rows = result.fetchall()

    return [
        {
            "id": row[0],
            "title": row[1],
            "summary": row[2],
            "topics": row[3],
            "enrichment_status": row[4],
            "created_at": row[5],
            "updated_at": row[6],
            "score": float(row[7]),
        }
        for row in rows
    ]
