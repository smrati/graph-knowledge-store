from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.services import rag_service

router = APIRouter(prefix="/api/rag", tags=["rag"])


class AskRequest(BaseModel):
    query: str
    session_id: str | None = None


class AskResponse(BaseModel):
    answer: str
    sources: list[dict]


class SessionResponse(BaseModel):
    id: str
    title: str
    created_at: str
    updated_at: str


class MessageResponse(BaseModel):
    id: str
    role: str
    content: str
    sources: list[dict] | None = None
    created_at: str


@router.post("/ask", response_model=AskResponse)
async def ask(req: AskRequest, session: AsyncSession = Depends(get_session)):
    if not req.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")
    return await rag_service.ask(session, req.query, req.session_id)


@router.post("/sessions", response_model=SessionResponse)
async def create_session(session: AsyncSession = Depends(get_session)):
    cs = await rag_service.create_session(session)
    return _session_to_response(cs)


@router.get("/sessions", response_model=list[SessionResponse])
async def list_sessions(
    limit: int = Query(50, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
):
    sessions = await rag_service.list_sessions(session, limit)
    return [_session_to_response(s) for s in sessions]


@router.get("/sessions/{session_id}/messages", response_model=list[MessageResponse])
async def get_messages(session_id: str, session: AsyncSession = Depends(get_session)):
    messages = await rag_service.get_messages(session, session_id)
    return [
        MessageResponse(
            id=str(m.id),
            role=m.role,
            content=m.content,
            sources=m.sources,
            created_at=m.created_at.isoformat() if m.created_at else "",
        )
        for m in messages
    ]


@router.delete("/sessions/{session_id}", status_code=204)
async def delete_session(session_id: str, session: AsyncSession = Depends(get_session)):
    deleted = await rag_service.delete_session(session, session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Session not found")


def _session_to_response(cs) -> SessionResponse:
    return SessionResponse(
        id=str(cs.id),
        title=cs.title,
        created_at=cs.created_at.isoformat() if cs.created_at else "",
        updated_at=cs.updated_at.isoformat() if cs.updated_at else "",
    )
