import asyncio

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models.quiz_attempt import QuizAttempt
from app.schemas.quiz import (
    ArticleQuizRequest,
    QuizActiveResponse,
    QuizGenerateRequest,
    QuizGenerateResponse,
    QuizHistoryItem,
    QuizResponse,
    QuizStatusResponse,
    QuizSubmitRequest,
)
from app.services import quiz_service

router = APIRouter(prefix="/api/quiz", tags=["quiz"])


@router.post("/generate", response_model=QuizGenerateResponse)
async def generate_quiz(
    req: QuizGenerateRequest,
    session: AsyncSession = Depends(get_session),
):
    if not req.topics and not req.keywords:
        raise HTTPException(status_code=400, detail="Provide at least one topic or keyword")

    articles = await quiz_service.fetch_articles(session, topics=req.topics, keywords=req.keywords)
    if not articles:
        raise HTTPException(status_code=404, detail="No articles found for the given filters")

    n = min(req.num_questions, len(articles) * 4)

    attempt = QuizAttempt(
        quiz_type=req.quiz_type,
        topics=req.topics,
        keywords=req.keywords,
        num_questions=n,
        article_count=len(articles),
        status="generating",
    )
    session.add(attempt)
    await session.commit()
    await session.refresh(attempt)

    quiz_id = attempt.id
    asyncio.create_task(quiz_service.run_generation(quiz_id, articles))

    return QuizGenerateResponse(quiz_id=quiz_id, status="generating")


@router.post("/generate/article/{article_id}", response_model=QuizGenerateResponse)
async def generate_article_quiz(
    article_id: str,
    req: ArticleQuizRequest,
    session: AsyncSession = Depends(get_session),
):
    article = await quiz_service.fetch_article_by_id(session, article_id)
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    articles = [article]

    attempt = QuizAttempt(
        quiz_type=req.quiz_type,
        topics=article.topics,
        keywords=article.keywords,
        num_questions=10,
        article_count=1,
        status="generating",
    )
    session.add(attempt)
    await session.commit()
    await session.refresh(attempt)

    quiz_id = attempt.id
    asyncio.create_task(quiz_service.run_generation(quiz_id, articles))

    return QuizGenerateResponse(quiz_id=quiz_id, status="generating")


@router.get("/active/now", response_model=QuizActiveResponse | None)
async def active_quiz(session: AsyncSession = Depends(get_session)):
    attempt = await quiz_service.get_active_quiz(session)
    if not attempt:
        return None

    return QuizActiveResponse(
        quiz_id=attempt.id,
        quiz_type=attempt.quiz_type,
        topics=attempt.topics or [],
        keywords=attempt.keywords or [],
        progress=len(attempt.questions or []),
        total=attempt.num_questions,
    )


@router.get("/history/list", response_model=list[QuizHistoryItem])
async def quiz_history(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_session),
):
    attempts = await quiz_service.list_quiz_history(session, limit=limit, offset=offset)
    return [
        QuizHistoryItem(
            quiz_id=a.id,
            quiz_type=a.quiz_type,
            topics=a.topics or [],
            keywords=a.keywords or [],
            score=a.score,
            total=a.num_questions if a.status == "completed" else None,
            num_questions=a.num_questions,
            article_count=a.article_count,
            status=a.status,
            created_at=a.created_at,
            completed_at=a.completed_at,
        )
        for a in attempts
    ]


@router.get("/status/{quiz_id}", response_model=QuizStatusResponse)
async def quiz_status(quiz_id: str, session: AsyncSession = Depends(get_session)):
    attempt = await quiz_service.get_quiz_attempt(session, quiz_id)
    if not attempt:
        raise HTTPException(status_code=404, detail="Quiz not found")

    return QuizStatusResponse(
        quiz_id=attempt.id,
        status=attempt.status,
        progress=len(attempt.questions or []),
        total=attempt.num_questions,
        quiz_type=attempt.quiz_type,
        topics=attempt.topics or [],
        keywords=attempt.keywords or [],
        article_count=attempt.article_count,
        questions=attempt.questions or [],
        error=attempt.error,
    )


@router.get("/result/{quiz_id}", response_model=QuizResponse)
async def quiz_result(quiz_id: str, session: AsyncSession = Depends(get_session)):
    attempt = await quiz_service.get_quiz_attempt(session, quiz_id)
    if not attempt:
        raise HTTPException(status_code=404, detail="Quiz not found")
    if attempt.status == "generating":
        raise HTTPException(status_code=202, detail="Quiz still generating")
    if attempt.status == "failed":
        raise HTTPException(status_code=500, detail=attempt.error or "Quiz generation failed")

    return _attempt_to_response(attempt)


@router.delete("/{quiz_id}", status_code=204)
async def delete_quiz(quiz_id: str, session: AsyncSession = Depends(get_session)):
    deleted = await quiz_service.delete_quiz(session, quiz_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Quiz not found")


@router.get("/{quiz_id}", response_model=QuizResponse)
async def get_quiz(quiz_id: str, session: AsyncSession = Depends(get_session)):
    attempt = await quiz_service.get_quiz_attempt(session, quiz_id)
    if not attempt:
        raise HTTPException(status_code=404, detail="Quiz not found")

    return _attempt_to_response(attempt)


@router.post("/{quiz_id}/submit", response_model=QuizResponse)
async def submit_quiz(
    quiz_id: str,
    req: QuizSubmitRequest,
    session: AsyncSession = Depends(get_session),
):
    attempt = await quiz_service.submit_quiz_answers(
        session, quiz_id, req.answers, req.score, req.total,
    )
    if not attempt:
        raise HTTPException(status_code=404, detail="Quiz not found")

    return _attempt_to_response(attempt)


def _attempt_to_response(a: QuizAttempt) -> QuizResponse:
    return QuizResponse(
        quiz_id=a.id,
        quiz_type=a.quiz_type,
        topics=a.topics or [],
        keywords=a.keywords or [],
        article_count=a.article_count,
        questions=a.questions or [],
        answers=a.answers,
        score=a.score,
        total=a.num_questions,
        status=a.status,
        created_at=a.created_at,
        completed_at=a.completed_at,
    )
