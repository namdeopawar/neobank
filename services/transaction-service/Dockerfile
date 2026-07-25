FROM python:3.11-slim AS base
WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

RUN addgroup --gid 1001 appgroup && adduser --uid 1001 --gid 1001 --no-create-home appuser

FROM base AS builder
COPY requirements.txt .
RUN pip install --upgrade pip && pip install --user -r requirements.txt

FROM base AS production
COPY --from=builder /root/.local /home/appuser/.local
ENV PATH=/home/appuser/.local/bin:$PATH
COPY src ./src
USER appuser
EXPOSE 3003
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:3003/health')"
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "3003", "--workers", "2"]
