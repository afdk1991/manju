# -*- coding: utf-8 -*-
"""数据库引擎与会话管理（SQLAlchemy 2.0）。"""
from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

# SQLite 需要该回调以在多线程（Uvicorn）下安全工作
_connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}

engine = create_engine(settings.database_url, connect_args=_connect_args, future=True, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    """FastAPI 依赖：提供请求级数据库会话。"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """建表（幂等）。生产环境建议改用 Alembic 迁移。"""
    # 导入模型以确保注册到 Base.metadata
    from app import models  # noqa: F401
    Base.metadata.create_all(bind=engine)
