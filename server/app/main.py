# -*- coding: utf-8 -*-
"""漫剧后端服务入口（FastAPI）。"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.db import init_db
from app.routers import admin, content, ota, user


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时建表
    init_db()
    yield


app = FastAPI(
    title="漫剧内容中台与 OTA 服务",
    version="1.0.0",
    description="漫剧（漫画改编短剧/竖屏短剧）内容分发与 OTA 更新服务",
    lifespan=lifespan,
)

# CORS（本地多端联调放开；生产应缩小来源）
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 静态产物分发：/files/{filename} -> server/data/artifacts/
app.mount("/files", StaticFiles(directory=settings.artifacts_dir), name="artifacts")

app.include_router(content.router)
app.include_router(ota.router)
app.include_router(user.router)
app.include_router(admin.router)


@app.get("/healthz", tags=["meta"])
def healthz():
    return {"status": "ok"}


@app.get("/admin", tags=["admin"])
@app.get("/admin/", tags=["admin"])
def admin_page():
    from pathlib import Path

    html = Path(__file__).resolve().parent.parent / "admin" / "index.html"
    if not html.exists():
        return {"error": "admin page not found"}
    return FileResponse(html)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=False)
