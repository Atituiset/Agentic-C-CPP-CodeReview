# Multi-stage build: frontend + backend

# Stage 1: Build frontend
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend
COPY Agentic-C-CPP-CodeReview/package*.json ./
RUN npm ci
COPY Agentic-C-CPP-CodeReview/ .
RUN npm run build

# Stage 2: Python runtime
FROM python:3.12-slim
WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies with uv
COPY backend/pyproject.toml backend/uv.lock ./backend/
RUN uv sync --frozen --project backend

# Copy backend code
COPY backend/ ./backend/
COPY worker/ ./worker/

# Copy built frontend
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Create data directories
RUN mkdir -p data reports

# Environment
ENV PYTHONPATH=/app
ENV REDIS_URL=redis://redis:6379
ENV DATABASE_URL=sqlite:///app/data/app.db

EXPOSE 8000

CMD ["uv", "run", "--project", "backend", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
