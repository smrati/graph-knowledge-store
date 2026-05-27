import uuid
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse

from app.config import settings

router = APIRouter(prefix="/api/upload", tags=["upload"])

UPLOAD_DIR = Path(settings.upload_dir)
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"}
MAX_SIZE = settings.upload_max_size_mb * 1024 * 1024


@router.post("")
async def upload_image(file: UploadFile = File(...)):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {file.content_type}")

    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=400, detail=f"File too large. Max {settings.upload_max_size_mb}MB")

    ext = _ext_from_content_type(file.content_type)
    filename = f"{uuid.uuid4().hex}{ext}"

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    (UPLOAD_DIR / filename).write_bytes(content)

    return JSONResponse({"url": f"/uploads/{filename}", "filename": filename})


def _ext_from_content_type(ct: str) -> str:
    return {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/gif": ".gif",
        "image/webp": ".webp",
        "image/svg+xml": ".svg",
    }.get(ct, ".bin")
