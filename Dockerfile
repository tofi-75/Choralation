# One public origin; build dependencies and sources stay out of the runtime stage.
FROM node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm install --global npm@11.21.0 && npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.14.8-slim@sha256:c3e521df8b2b498a7a682e7e18676771cb80c6b75b8699af886b2d554ce40151
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
ENV DJANGO_SERVE_FRONTEND=true DJANGO_FRONTEND_ROOT=/app/frontend/dist
WORKDIR /app/backend
COPY backend/requirements/base.txt backend/requirements/production.txt ./requirements/
RUN python -m pip install -r requirements/production.txt && useradd --create-home --uid 10001 appuser
COPY backend/ ./
COPY --from=frontend /build/dist /app/frontend/dist
# Build-only dummy settings: collectstatic never needs cloud credentials or a database.
RUN DJANGO_SECRET_KEY=build-only-placeholder-not-a-runtime-secret-0000000000000000000000 DJANGO_DEBUG=false DATABASE_URL=postgresql://build:build@127.0.0.1/build DJANGO_STORAGE_BACKEND=local python manage.py collectstatic --noinput     && mkdir -p /app/media && chown appuser:appuser /app/media
ENV DJANGO_MEDIA_ROOT=/app/media
USER appuser
EXPOSE 10000
CMD ["python", "-m", "config.deployment"]
