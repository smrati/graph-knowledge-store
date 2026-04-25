import asyncio

from concurrent.futures import ThreadPoolExecutor
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.schemas.quiz import QuizGenerateRequest, QuizResponse
from app.services import quiz_service

router = APIRouter(prefix="/api/quiz", tags=["quiz"])
_executor = ThreadPoolExecutor(max_workers=2)


@router.post("/generate", response_model=QuizResponse)
async def generate_quiz(
    req: QuizGenerateRequest,
    session: AsyncSession = Depends(get_session),
):
    if not req.topics and not req.keywords:
        raise HTTPException(status_code=400, detail="Provide at least one topic or keyword")

    articles = await quiz_service.fetch_articles(session, topics=req.topics, keywords=req.keywords)
    if not articles:
        raise HTTPException(status_code=404, detail="No articles found for the given filters")

    loop = asyncio.get_event_loop()
    n = min(req.num_questions, len(articles) * 3)

    if req.quiz_type == "mcq":
        questions = await loop.run_in_executor(_executor, quiz_service.generate_mcq, articles, n)
    elif req.quiz_type == "short_answer":
        questions = await loop.run_in_executor(_executor, quiz_service.generate_short_answer, articles, n)
    elif req.quiz_type == "flashcard":
        questions = await loop.run_in_executor(_executor, quiz_service.generate_flashcards, articles, n)
    else:
        raise HTTPException(status_code=400, detail="Invalid quiz_type")

    if not questions:
        raise HTTPException(status_code=500, detail="LLM failed to generate valid quiz questions. Try with fewer questions or different articles.")

    return QuizResponse(
        quiz_type=req.quiz_type,
        topics=req.topics,
        keywords=req.keywords,
        article_count=len(articles),
        questions=questions,
    )
