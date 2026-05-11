from fastapi import APIRouter
from pydantic import BaseModel

from app.services.llm_service import fix_equation_snippet

router = APIRouter(prefix="/api/llm", tags=["llm"])


class FixEquationRequest(BaseModel):
    text: str


class FixEquationResponse(BaseModel):
    fixed: str


@router.post("/fix-equation", response_model=FixEquationResponse)
async def fix_equation(req: FixEquationRequest):
    fixed = fix_equation_snippet(req.text)
    return FixEquationResponse(fixed=fixed)
