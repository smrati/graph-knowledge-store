from openai import OpenAI

from app.config import settings


def get_client() -> OpenAI:
    return OpenAI(base_url=settings.llm_base_url, api_key=settings.llm_api_key)


def chat(prompt: str, system: str = "You are a helpful assistant.") -> str:
    client = get_client()
    response = client.chat.completions.create(
        model=settings.llm_chat_model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        temperature=0.1,
    )
    return response.choices[0].message.content


def generate_title(content: str) -> str:
    client = get_client()
    response = client.chat.completions.create(
        model=settings.llm_chat_model,
        messages=[
            {
                "role": "system",
                "content": "Generate a concise, descriptive title for the given article text. Return ONLY the title, nothing else. Maximum 100 characters. Do not use quotes.",
            },
            {
                "role": "user",
                "content": content[:2000],
            },
        ],
        temperature=0.3,
        max_tokens=50,
    )
    title = response.choices[0].message.content.strip()
    if len(title) > 500:
        title = title[:497] + "..."
    return title


def embed(texts: list[str]) -> list[list[float]]:
    client = get_client()
    response = client.embeddings.create(
        model=settings.llm_embedding_model,
        input=texts,
    )
    return [item.embedding for item in response.data]
