import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class ArticleCreate(BaseModel):
    title: str | None = Field(None, max_length=500)
    content: str
    fix_equations: bool = False


class ArticleUpdate(BaseModel):
    title: str | None = Field(None, max_length=500)
    content: str | None = None
    fix_equations: bool = False


class ArticleResponse(BaseModel):
    id: uuid.UUID
    title: str
    content: str
    summary: str | None = None
    topics: list = Field(default_factory=list)
    keywords: list = Field(default_factory=list)
    entities: list = Field(default_factory=list)
    enrichment_status: str = "pending"
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ArticleListItem(BaseModel):
    id: uuid.UUID
    title: str
    summary: str | None = None
    topics: list = Field(default_factory=list)
    enrichment_status: str = "pending"
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ArticleListResponse(BaseModel):
    articles: list[ArticleListItem]
    total: int
    page: int
    limit: int


class SearchResult(BaseModel):
    article: ArticleListItem
    score: float


class SearchResponse(BaseModel):
    results: list[SearchResult]
    query: str
