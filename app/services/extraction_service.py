import json
import logging

from app.services.llm_service import chat

logger = logging.getLogger(__name__)

EXTRACTION_SYSTEM = """You analyze articles and extract structured metadata. Return ONLY valid JSON with no additional text."""

EXTRACTION_PROMPT = """Analyze this article and extract structured metadata.

Return ONLY a valid JSON object with this exact structure:
{{
  "topics": ["topic1", "topic2"],
  "keywords": ["keyword1", "keyword2"],
  "entities": [
    {{"name": "Entity Name", "type": "Person|Organization|Technology|Place|Concept"}}
  ],
  "summary": "A 1-2 sentence summary of the article."
}}

Rules:
- topics: max 5 broad themes/subjects
- keywords: max 10 important specific terms
- entities: named entities with their type
- summary: concise, informative

Article:
---
{content}"""


def extract_metadata(content: str) -> dict:
    prompt = EXTRACTION_PROMPT.format(content=content[:4000])
    try:
        raw = chat(prompt, system=EXTRACTION_SYSTEM)
        text = raw.strip()
        if text.startswith("```"):
            first_newline = text.index("\n")
            last_backtick = text.rindex("```")
            text = text[first_newline + 1 : last_backtick].strip()
        data = json.loads(text)
        return {
            "topics": data.get("topics", [])[:5],
            "keywords": data.get("keywords", [])[:10],
            "entities": data.get("entities", []),
            "summary": data.get("summary", ""),
        }
    except (json.JSONDecodeError, Exception) as e:
        logger.error(f"Extraction failed: {e}")
        return {"topics": [], "keywords": [], "entities": [], "summary": ""}
