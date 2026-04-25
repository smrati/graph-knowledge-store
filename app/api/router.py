from fastapi import APIRouter

from app.api.articles import router as articles_router
from app.api.search import router as search_router
from app.api.graph import router as graph_router
from app.api.quiz import router as quiz_router

router = APIRouter()
router.include_router(articles_router)
router.include_router(search_router)
router.include_router(graph_router)
router.include_router(quiz_router)
