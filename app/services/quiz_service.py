import json
import logging
import random

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.article import Article
from app.services.llm_service import chat

logger = logging.getLogger(__name__)

MAX_SAMPLED_ARTICLES = 6
MAX_CONTENT_PER_ARTICLE = 1500
MAX_PROMPT_CHARS = 8000

MCQ_SYSTEM = """You are an expert educator creating a multiple-choice quiz to test comprehension and synthesis.

Below you will find article summaries with their metadata, followed by selected full article contents. Generate exactly {n} multiple-choice questions.

RULES:
- Test UNDERSTANDING and SYNTHESIS across the articles, not copy-paste facts
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

Below you will find article summaries with their metadata, followed by selected full article contents. Generate exactly {n} short-answer questions.

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

Below you will find article summaries with their metadata, followed by selected full article contents. Generate exactly {n} flashcards.

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


def _build_prompt(articles: list[ArticleInfo], n: int) -> str:
    summaries_section = "ARTICLE SUMMARIES:\n\n"
    for a in articles:
        topics_str = ", ".join(a.topics[:5]) if a.topics else "none"
        keywords_str = ", ".join(a.keywords[:5]) if a.keywords else "none"
        summaries_section += f"Title: {a.title}\n"
        if a.summary:
            summaries_section += f"Summary: {a.summary}\n"
        summaries_section += f"Topics: [{topics_str}]\n"
        summaries_section += f"Keywords: [{keywords_str}]\n\n"

    sampled = articles
    if len(articles) > MAX_SAMPLED_ARTICLES:
        sampled = random.sample(articles, MAX_SAMPLED_ARTICLES)

    detail_section = "DETAILED CONTENT (selected articles):\n\n"
    for a in sampled:
        truncated = a.content[:MAX_CONTENT_PER_ARTICLE]
        detail_section += f"## {a.title}\n\n{truncated}\n\n---\n\n"

    prompt = f"{summaries_section}\n{detail_section}\nGenerate {n} questions based on the above material."

    if len(prompt) > MAX_PROMPT_CHARS:
        prompt = prompt[:MAX_PROMPT_CHARS]

    return prompt


def generate_mcq(articles: list[ArticleInfo], n: int) -> list[dict]:
    system = MCQ_SYSTEM.format(n=n)
    prompt = _build_prompt(articles, n)
    raw = chat(prompt, system=system)
    return _parse_json(raw)


def generate_short_answer(articles: list[ArticleInfo], n: int) -> list[dict]:
    system = SHORT_ANSWER_SYSTEM.format(n=n)
    prompt = _build_prompt(articles, n)
    raw = chat(prompt, system=system)
    return _parse_json(raw)


def generate_flashcards(articles: list[ArticleInfo], n: int) -> list[dict]:
    system = FLASHCARD_SYSTEM.format(n=n)
    prompt = _build_prompt(articles, n)
    raw = chat(prompt, system=system)
    return _parse_json(raw)


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

    logger.error("Quiz LLM returned unparseable output (first 500 chars): %s", text[:500])
    return []
