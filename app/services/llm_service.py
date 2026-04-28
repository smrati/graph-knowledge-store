import time

from openai import OpenAI

from app.config import settings
from app.services.llm_observability import extract_usage, log_llm_call


def get_client() -> OpenAI:
    return OpenAI(base_url=settings.llm_base_url, api_key=settings.llm_api_key)


def get_embedding_client() -> OpenAI:
    base_url = settings.llm_embedding_base_url or settings.llm_base_url
    api_key = settings.llm_embedding_api_key or settings.llm_api_key
    return OpenAI(base_url=base_url, api_key=api_key)


def chat(
    prompt: str,
    system: str = "You are a helpful assistant.",
    num_ctx: int | None = None,
    article_id=None,
) -> str:
    ctx = num_ctx or settings.llm_num_ctx
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": prompt},
    ]
    start = time.monotonic()
    try:
        client = get_client()
        response = client.chat.completions.create(
            model=settings.llm_chat_model,
            messages=messages,
            temperature=0.1,
            extra_body={"num_ctx": ctx},
        )
        content = response.choices[0].message.content
        log_llm_call(
            operation="chat",
            model=settings.llm_chat_model,
            latency_ms=int((time.monotonic() - start) * 1000),
            success=True,
            input_text=prompt,
            output_text=content or "",
            num_ctx=ctx,
            temperature=0.1,
            article_id=article_id,
            api_usage=extract_usage(response),
        )
        return content
    except Exception as e:
        log_llm_call(
            operation="chat",
            model=settings.llm_chat_model,
            latency_ms=int((time.monotonic() - start) * 1000),
            success=False,
            input_text=prompt,
            error_message=str(e),
            num_ctx=ctx,
            temperature=0.1,
            article_id=article_id,
        )
        raise


def generate_title(content: str) -> str:
    start = time.monotonic()
    try:
        client = get_client()
        response = client.chat.completions.create(
            model=settings.llm_chat_model,
            messages=[
                {
                    "role": "system",
                    "content": "Generate a concise, descriptive title for the given article text. Return ONLY the title, nothing else. Maximum 100 characters. Do not use quotes. Use Unicode symbols (e.g. γ, β, α, ∑, √, ×) instead of LaTeX (no $, no \\frac, no \\hat).",
                },
                {
                    "role": "user",
                    "content": content[:2000],
                },
            ],
            temperature=0.3,
            max_tokens=50,
            extra_body={"num_ctx": settings.llm_num_ctx},
        )
        title = response.choices[0].message.content.strip()
        if len(title) > 500:
            title = title[:497] + "..."
        log_llm_call(
            operation="generate_title",
            model=settings.llm_chat_model,
            latency_ms=int((time.monotonic() - start) * 1000),
            success=True,
            input_text=content[:2000],
            output_text=title,
            num_ctx=settings.llm_num_ctx,
            temperature=0.3,
            api_usage=extract_usage(response),
        )
        return title
    except Exception as e:
        log_llm_call(
            operation="generate_title",
            model=settings.llm_chat_model,
            latency_ms=int((time.monotonic() - start) * 1000),
            success=False,
            input_text=content[:2000],
            error_message=str(e),
            num_ctx=settings.llm_num_ctx,
            temperature=0.3,
        )
        raise


def normalize_markdown_equations(content: str) -> str:
    start = time.monotonic()
    try:
        client = get_client()
        response = client.chat.completions.create(
            model=settings.llm_chat_model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a markdown/LaTeX formatting fixer. Your ONLY job is to fix math equation delimiters.\n"
                        "Rules:\n"
                        "1. Wrap standalone/display equations in $$...$$\n"
                        "2. Wrap inline equations in $...$\n"
                        "3. Convert [equation] or multi-line [ \\n equation \\n ] blocks to $$equation$$\n"
                        "4. Convert \\[...\\] to $$...$$ and \\(...\\) to $...$\n"
                        "5. Leave ALL other text completely unchanged — headings, lists, tables, prose, code blocks\n"
                        "6. Do NOT add, remove, or rewrite any content\n"
                        "7. Do NOT translate or paraphrase anything\n"
                        "8. Return the FULL markdown text with only equation delimiters fixed\n"
                        "9. Preserve all blank lines and paragraph spacing"
                    ),
                },
                {"role": "user", "content": content},
            ],
            temperature=0.0,
            extra_body={"num_ctx": settings.llm_num_ctx},
        )
        normalized = response.choices[0].message.content
        if not normalized or len(normalized) < len(content) * 0.5:
            normalized = content
        log_llm_call(
            operation="normalize_equations",
            model=settings.llm_chat_model,
            latency_ms=int((time.monotonic() - start) * 1000),
            success=True,
            input_text=content,
            output_text=normalized or "",
            num_ctx=settings.llm_num_ctx,
            temperature=0.0,
            api_usage=extract_usage(response),
        )
        return normalized
    except Exception as e:
        log_llm_call(
            operation="normalize_equations",
            model=settings.llm_chat_model,
            latency_ms=int((time.monotonic() - start) * 1000),
            success=False,
            input_text=content,
            error_message=str(e),
            num_ctx=settings.llm_num_ctx,
            temperature=0.0,
        )
        raise


def embed(texts: list[str]) -> list[list[float]]:
    start = time.monotonic()
    try:
        client = get_embedding_client()
        response = client.embeddings.create(
            model=settings.llm_embedding_model,
            input=texts,
        )
        embeddings = [item.embedding for item in response.data]
        log_llm_call(
            operation="embed",
            model=settings.llm_embedding_model,
            latency_ms=int((time.monotonic() - start) * 1000),
            success=True,
            input_texts=texts,
            output_text="",
            api_usage=extract_usage(response),
        )
        return embeddings
    except Exception as e:
        log_llm_call(
            operation="embed",
            model=settings.llm_embedding_model,
            latency_ms=int((time.monotonic() - start) * 1000),
            success=False,
            input_texts=texts,
            error_message=str(e),
        )
        raise
