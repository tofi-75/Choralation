# Linux backend only; PostgreSQL and the local Vite frontend are separate.
FROM python:3.14.8-slim@sha256:c3e521df8b2b498a7a682e7e18676771cb80c6b75b8699af886b2d554ce40151
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
ENV DJANGO_MEDIA_ROOT=/app/media
WORKDIR /app
COPY backend/requirements/base.txt backend/requirements/production.txt /app/requirements/
RUN python -m pip install -r /app/requirements/production.txt \
    && useradd --create-home --uid 10001 appuser
COPY backend/ /app/
# New named volumes inherit this directory's ownership for the non-root runtime.
RUN mkdir -p /app/media && chown appuser:appuser /app/media
USER appuser
EXPOSE 8000
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--access-logfile", "-", "--error-logfile", "-"]
