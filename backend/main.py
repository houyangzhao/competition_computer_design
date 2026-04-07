"""Zhuyi Backend entry point. Usage: uvicorn main:app"""

from app import create_app

app = create_app()
