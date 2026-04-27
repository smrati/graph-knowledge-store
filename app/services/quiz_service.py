import asyncio
import json
import logging
import random
from functools import partial

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.article import Article
from app.models.quiz_attempt import QuizAttempt
from app.services.llm_service import chat
from app.database import async_session_factory

logger = logging.getLogger(__name__)


def _questions_for_length(content_len: int) -> int:
    if content_len < 2000:
        return 1
    if content_len < 5000:
        return 2
    if content_len < 10000:
        return 3
    return 4


MCQ_SYSTEM = """You are an expert educator creating a multiple-choice quiz to test comprehension and synthesis.

You will be given ONE article. Generate exactly {{n}} multiple-choice question(s) from it.

RULES:
- Test UNDERSTANDING and SYNTHESIS, not copy-paste facts
- Each question must have exactly 4 options labeled A, B, C, D
- Only ONE option is correct
- Wrong options (distractors) should be plausible but clearly incorrect to someone who understood the material
- Include a brief explanation of why the correct answer is right
- Questions should range from moderate to challenging

You MUST respond with ONLY a JSON array. No markdown, no backticks, no commentary before or after.
[
  {{
    "question": "string",
    "options": [
      {{"label": "A", "text": "string"}},
      {{"label": "B", "text": "string"}},
      {{"label": "C", "text": "string"}},
      {{"label": "D", "text": "string"}}
    ],
    "correct_index": 0,
    "explanation": "string"
  }}
]"""

SHORT_ANSWER_SYSTEM = """You are an expert educator creating short-answer questions to test deep understanding.

You will be given ONE article. Generate exactly {{n}} short-answer question(s) from it.

RULES:
- Questions should require 1-3 sentence answers
- Test COMPREHENSION, APPLICATION, and ANALYSIS — not regurgitation
- Provide a model answer and 2-4 key points that a good answer should cover
- Questions should range from moderate to challenging

You MUST respond with ONLY a JSON array. No markdown, no backticks, no commentary before or after.
[
  {{
    "question": "string",
    "model_answer": "string",
    "key_points": ["string"]
  }}
]"""

FLASHCARD_SYSTEM = """You are an expert educator creating flashcards for spaced repetition learning.

You will be given ONE article. Generate exactly {{n}} flashcard(s) from it.

RULES:
- Front: A concept name, term, or focused question (concise, 1-2 lines max)
- Back: A clear, complete explanation (2-4 sentences)
- Hint: A brief clue that helps recall without giving away the answer
- Cover KEY concepts, definitions, relationships, and important details
- Prioritize the most important and testable knowledge

You MUST respond with ONLY a JSON array. No markdown, no backticks, no commentary before or after.
[
  {{
    "front": "string",
    "back": "string",
    "hint": "string"
  }}
]"""

DEDUP_SECTION = """
PREVIOUSLY GENERATED QUESTIONS (do NOT repeat or create similar questions):
{existing}
"""

ARTICLE_PROMPT_TEMPLATE = """ARTICLE TITLE: {title}

ARTICLE CONTENT:
{content}"""


class ArticleInfo:
    __slots__ = ("title", "summary", "topics", "keywords", "content")

    def __init__(self, title: str, summary: str | None, topics: list, keywords: list, content: str):
        self.title = title
        self.summary = summary or ""
        self.topics = topics or []
        self.keywords = keywords or []
        self.content = content


async def fetch_articles(
    session: AsyncSession,
    topics: list[str] | None = None,
    keywords: list[str] | None = None,
) -> list[ArticleInfo]:
    stmt = select(
        Article.title, Article.summary, Article.topics, Article.keywords, Article.content,
    ).order_by(Article.updated_at.desc())

    or_clauses = []
    params = {}
    for i, t in enumerate(topics or []):
        key = f"topic_{i}"
        or_clauses.append(f"EXISTS (SELECT 1 FROM jsonb_array_elements_text(articles.topics) elem WHERE LOWER(elem) = LOWER(:{key}))")
        params[key] = t
    for i, k in enumerate(keywords or []):
        key = f"kw_{i}"
        or_clauses.append(f"EXISTS (SELECT 1 FROM jsonb_array_elements_text(articles.keywords) elem WHERE LOWER(elem) = LOWER(:{key}))")
        params[key] = k

    if or_clauses:
        stmt = stmt.where(text(" OR ".join(or_clauses))).params(**params)

    result = await session.execute(stmt.limit(30))
    rows = result.all()

    articles = []
    for title, summary, topics_list, keywords_list, content in rows:
        articles.append(ArticleInfo(
            title=title,
            summary=summary,
            topics=topics_list or [],
            keywords=keywords_list or [],
            content=content,
        ))
    return articles


async def fetch_article_by_id(session: AsyncSession, article_id: str) -> ArticleInfo | None:
    stmt = select(
        Article.title, Article.summary, Article.topics, Article.keywords, Article.content,
    ).where(Article.id == article_id)
    result = await session.execute(stmt)
    row = result.first()
    if not row:
        return None
    title, summary, topics, keywords, content = row
    return ArticleInfo(
        title=title,
        summary=summary,
        topics=topics or [],
        keywords=keywords or [],
        content=content,
    )


def _build_existing_questions_section(questions: list[dict], quiz_type: str) -> str:
    if not questions:
        return ""
    lines = []
    for i, q in enumerate(questions, 1):
        if quiz_type == "mcq":
            lines.append(f'{i}. "{q.get("question", "")}"')
        elif quiz_type == "short_answer":
            lines.append(f'{i}. "{q.get("question", "")}"')
        elif quiz_type == "flashcard":
            lines.append(f'{i}. Front: "{q.get("front", "")}"')
    return DEDUP_SECTION.format(existing="\n".join(lines))


def _get_system_prompt(quiz_type: str, n: int) -> str:
    if quiz_type == "mcq":
        return MCQ_SYSTEM.format(n=n)
    elif quiz_type == "short_answer":
        return SHORT_ANSWER_SYSTEM.format(n=n)
    else:
        return FLASHCARD_SYSTEM.format(n=n)


def _extract_question_text(q: dict, quiz_type: str) -> str:
    if quiz_type == "flashcard":
        return q.get("front", "").lower()
    return q.get("question", "").lower()


def _is_duplicate(new_q: dict, existing: list[dict], quiz_type: str) -> bool:
    new_text = _extract_question_text(new_q, quiz_type)
    for existing_q in existing:
        existing_text = _extract_question_text(existing_q, quiz_type)
        if new_text == existing_text:
            return True
        shorter, longer = sorted([new_text, existing_text], key=len)
        if len(shorter) > 20 and shorter in longer:
            return True
    return False


async def run_generation(quiz_id: str, articles: list[ArticleInfo]) -> None:
    loop = asyncio.get_event_loop()
    async with async_session_factory() as session:
        result = await session.execute(select(QuizAttempt).where(QuizAttempt.id == quiz_id))
        attempt = result.scalar_one_or_none()
        if not attempt:
            logger.error("QuizAttempt %s not found for generation", quiz_id)
            return

        try:
            num_ctx = settings.llm_quiz_num_ctx
            questions: list[dict] = list(attempt.questions) if attempt.questions else []

            shuffled = list(range(len(articles)))
            random.shuffle(shuffled)
            idx = 0
            rounds = 0
            max_rounds = len(articles) * 3

            while len(questions) < attempt.num_questions and rounds < max_rounds:
                remaining = attempt.num_questions - len(questions)
                article_idx = shuffled[idx % len(shuffled)]
                article = articles[article_idx]

                k = min(_questions_for_length(len(article.content)), remaining)

                system = _get_system_prompt(attempt.quiz_type, k)
                dedup_section = _build_existing_questions_section(questions, attempt.quiz_type)

                prompt = ARTICLE_PROMPT_TEMPLATE.format(title=article.title, content=article.content)
                prompt = dedup_section + "\n" + prompt
                prompt += f"\n\nGenerate exactly {k} question(s) from this article."

                raw = await loop.run_in_executor(None, partial(chat, prompt, system, num_ctx))
                parsed = _parse_json(raw)

                added = 0
                for q in parsed:
                    if added >= k:
                        break
                    if not _is_duplicate(q, questions, attempt.quiz_type):
                        questions.append(q)
                        added += 1

                if not parsed:
                    logger.warning("Quiz generation: empty/invalid LLM response for article '%s', retrying once", article.title)
                    raw2 = await loop.run_in_executor(None, partial(chat, prompt, system, num_ctx))
                    parsed2 = _parse_json(raw2)
                    for q in parsed2:
                        if added >= k:
                            break
                        if not _is_duplicate(q, questions, attempt.quiz_type):
                            questions.append(q)
                            added += 1

                attempt.questions = list(questions)
                await session.commit()

                idx += 1
                rounds += 1

            if len(questions) < attempt.num_questions:
                logger.warning(
                    "Quiz generation: only produced %d/%d questions after %d rounds",
                    len(questions), attempt.num_questions, rounds,
                )

            attempt.status = "ready"
            await session.commit()

        except Exception as e:
            logger.exception("Quiz generation failed for attempt %s", quiz_id)
            attempt.status = "failed"
            attempt.error = str(e)
            await session.commit()


async def get_active_quiz(session: AsyncSession) -> QuizAttempt | None:
    stmt = select(QuizAttempt).where(QuizAttempt.status == "generating").order_by(QuizAttempt.created_at.desc()).limit(1)
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def get_quiz_attempt(session: AsyncSession, quiz_id: str) -> QuizAttempt | None:
    result = await session.execute(select(QuizAttempt).where(QuizAttempt.id == quiz_id))
    return result.scalar_one_or_none()


async def submit_quiz_answers(
    session: AsyncSession,
    quiz_id: str,
    answers: list[dict],
    score: int,
    total: int,
) -> QuizAttempt | None:
    result = await session.execute(select(QuizAttempt).where(QuizAttempt.id == quiz_id))
    attempt = result.scalar_one_or_none()
    if not attempt:
        return None
    attempt.answers = answers
    attempt.score = score
    attempt.status = "completed"
    from datetime import datetime, timezone
    attempt.completed_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(attempt)
    return attempt


async def list_quiz_history(session: AsyncSession, limit: int = 20, offset: int = 0) -> list[QuizAttempt]:
    stmt = (
        select(QuizAttempt)
        .where(QuizAttempt.status.in_(["ready", "completed"]))
        .order_by(QuizAttempt.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


def _parse_json(raw: str) -> list[dict]:
    text = raw.strip()

    cleaned = text
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        cleaned = "\n".join(lines).strip()

    if cleaned.startswith("["):
        try:
            parsed = json.loads(cleaned)
            if isinstance(parsed, list):
                return parsed
        except json.JSONDecodeError:
            pass

    start = cleaned.find("[")
    end = cleaned.rfind("]")
    if start >= 0 and end > start:
        try:
            parsed = json.loads(cleaned[start:end + 1])
            if isinstance(parsed, list):
                return parsed
        except json.JSONDecodeError:
            pass

    if cleaned.startswith("{"):
        try:
            parsed = json.loads(cleaned)
            if isinstance(parsed, dict):
                return [parsed]
        except json.JSONDecodeError:
            pass

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start >= 0 and end > start:
        try:
            parsed = json.loads(cleaned[start:end + 1])
            if isinstance(parsed, dict):
                return [parsed]
        except json.JSONDecodeError:
            pass

    logger.error("Quiz LLM returned unparseable output (first 500 chars): %s", text[:500])
    return []
