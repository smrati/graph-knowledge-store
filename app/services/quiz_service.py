import asyncio
import json
import logging
import random
import re
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


def _assess_question_count(content: str, title: str, quiz_type: str) -> int:
    prompt = ASSESS_PROMPT.format(quiz_type=quiz_type, title=title, content=content)
    raw = chat(prompt, "You are a helpful assistant that responds with only integers.", num_ctx=min(len(content) + 500, settings.llm_quiz_num_ctx))
    text = raw.strip()
    digits = "".join(c for c in text if c.isdigit())
    if digits:
        return max(1, min(int(digits), 15))
    logger.warning("Assessment returned unparseable response: %s, falling back to length-based", text[:200])
    return _questions_for_length(len(content))


MCQ_SYSTEM = """You are a JSON-only API. You output valid JSON arrays and nothing else. No prose. No markdown. No numbered lists. No explanation. Just JSON.

Generate exactly {{n}} multiple-choice question(s) from the given article.

RULES:
- Test UNDERSTANDING and SYNTHESIS, not copy-paste facts
- Each question must have exactly 4 options labeled A, B, C, D
- Only ONE option is correct
- Wrong options (distractors) should be plausible but clearly incorrect to someone who understood the material
- Include a brief explanation of why the correct answer is right
- Questions should range from moderate to challenging
- Use Unicode symbols (e.g. γ, β, α, ∑, √, ×) instead of LaTeX in all text

Output format — respond with ONLY this JSON structure, no other text:
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
]

IMPORTANT: Your entire response must start with [ and end with ]. Do not include any text before or after the JSON array."""

SHORT_ANSWER_SYSTEM = """You are a JSON-only API. You output valid JSON arrays and nothing else. No prose. No markdown. No numbered lists. No explanation. Just JSON.

Generate exactly {{n}} short-answer question(s) from the given article.

RULES:
- Questions should require 1-3 sentence answers
- Test COMPREHENSION, APPLICATION, and ANALYSIS — not regurgitation
- Provide a model answer and 2-4 key points that a good answer should cover
- Questions should range from moderate to challenging
- Use Unicode symbols (e.g. γ, β, α, ∑, √, ×) instead of LaTeX in all text

Output format — respond with ONLY this JSON structure, no other text:
[
  {{
    "question": "string",
    "model_answer": "string",
    "key_points": ["string"]
  }}
]

IMPORTANT: Your entire response must start with [ and end with ]. Do not include any text before or after the JSON array."""

FLASHCARD_SYSTEM = """You are a JSON-only API. You output valid JSON arrays and nothing else. No prose. No markdown. No numbered lists. No explanation. Just JSON.

Generate exactly {{n}} flashcard(s) from the given article.

RULES:
- Front: A concept name, term, or focused question (concise, 1-2 lines max)
- Back: A clear, complete explanation (2-4 sentences)
- Hint: A brief clue that helps recall without giving away the answer
- Cover KEY concepts, definitions, relationships, and important details
- Prioritize the most important and testable knowledge
- Use Unicode symbols (e.g. γ, β, α, ∑, √, ×) instead of LaTeX in all text

Output format — respond with ONLY this JSON structure, no other text:
[
  {{
    "front": "string",
    "back": "string",
    "hint": "string"
  }}
]

IMPORTANT: Your entire response must start with [ and end with ]. Do not include any text before or after the JSON array."""

DEDUP_SECTION = """
PREVIOUSLY GENERATED QUESTIONS (do NOT repeat or create similar questions):
{existing}
"""

ARTICLE_PROMPT_TEMPLATE = """ARTICLE TITLE: {title}

ARTICLE CONTENT:
{content}

Remember: respond with ONLY a JSON array. Start with [ and end with ]. No other text."""

ASSESS_PROMPT = """You are an expert educator. Read the following article and determine how many distinct, high-quality {quiz_type} questions can be generated from it.

Consider:
- How many separate concepts, facts, relationships, or procedures are covered
- Whether there is enough depth for questions that test understanding (not just recall)
- Whether the concepts are distinct enough to avoid repetitive questions

Respond with ONLY a single integer between 1 and 15. No explanation, no other text.

ARTICLE TITLE: {title}

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

            use_llm_assessment = len(articles) == 1 and attempt.num_questions >= 10

            if use_llm_assessment:
                article = articles[0]
                assessed = await loop.run_in_executor(
                    None, partial(_assess_question_count, article.content, article.title, attempt.quiz_type),
                )
                assessed = min(assessed, 15)
                attempt.num_questions = assessed
                logger.info("LLM assessed %d questions for article '%s'", assessed, article.title)
                await session.commit()

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

            if len(questions) == 0:
                logger.warning(
                    "Quiz generation: produced 0/%d questions for attempt %s",
                    attempt.num_questions, quiz_id,
                )
                attempt.status = "failed"
                attempt.error = "Failed to generate any questions. The article may be too long for the model to follow formatting instructions."
                await session.commit()
                return

            if len(questions) < attempt.num_questions:
                logger.warning(
                    "Quiz generation: only produced %d/%d questions after %d rounds",
                    len(questions), attempt.num_questions, rounds,
                )
                attempt.num_questions = len(questions)

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


async def delete_quiz(session: AsyncSession, quiz_id: str) -> bool:
    result = await session.execute(select(QuizAttempt).where(QuizAttempt.id == quiz_id))
    attempt = result.scalar_one_or_none()
    if not attempt:
        return False
    await session.delete(attempt)
    await session.commit()
    return True


async def delete_quizzes_batch(session: AsyncSession, quiz_ids: list[str]) -> int:
    from sqlalchemy import delete as sql_delete
    stmt = sql_delete(QuizAttempt).where(QuizAttempt.id.in_(quiz_ids))
    result = await session.execute(stmt)
    await session.commit()
    return result.rowcount


async def delete_all_quizzes(session: AsyncSession) -> int:
    from sqlalchemy import delete as sql_delete
    from sqlalchemy import func as sql_func

    count_stmt = select(sql_func.count()).select_from(QuizAttempt)
    total = (await session.execute(count_stmt)).scalar() or 0

    stmt = sql_delete(QuizAttempt)
    await session.execute(stmt)
    await session.commit()
    return total


def _fix_latex_json_escapes(text: str) -> str:
    def fix_inside_strings(match: re.Match) -> str:
        s = match.group(0)
        inner = s[1:-1]
        inner = re.sub(r'\\([bfnrt])(?=[a-zA-Z{])', r'\\\\\\1', inner)
        inner = re.sub(r'\\(?!["\\/bfnrtu])', r'\\\\', inner)
        return '"' + inner + '"'
    return re.sub(r'"(?:[^"\\]|\\.)*"', fix_inside_strings, text)


def _parse_json(raw: str) -> list[dict]:
    text = raw.strip()

    cleaned = text
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        cleaned = "\n".join(lines).strip()

    def _try_parse(s: str) -> list[dict] | None:
        for attempt_text in (_fix_latex_json_escapes(s), s):
            try:
                parsed = json.loads(attempt_text)
                if isinstance(parsed, list):
                    return parsed
                if isinstance(parsed, dict):
                    return [parsed]
            except (json.JSONDecodeError, ValueError):
                continue
        return None

    if cleaned.startswith("[") or cleaned.startswith("{"):
        result = _try_parse(cleaned)
        if result is not None:
            return result

    start = cleaned.find("[")
    end = cleaned.rfind("]")
    if start >= 0 and end > start:
        result = _try_parse(cleaned[start:end + 1])
        if result is not None:
            return result

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start >= 0 and end > start:
        result = _try_parse(cleaned[start:end + 1])
        if result is not None:
            return result

    logger.error("Quiz LLM returned unparseable output (first 500 chars): %s", text[:500])
    return []
