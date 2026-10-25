"""Environment-driven Django settings for the same-origin M1 application.

PostgreSQL is mandatory in every environment, including tests. Local .env is
ignored by Git. Production defaults to secure cookies, no debug, and HTTPS.
"""

import os
from pathlib import Path

import dj_database_url
from django.core.exceptions import ImproperlyConfigured

from config.account_email import public_origin
from config.environment import boolean, csv, load_environment
from config.hosting import database_options, storage_options

BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BASE_DIR.parent
load_environment(PROJECT_ROOT / ".env")

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "")
if len(SECRET_KEY) < 50:
    raise ImproperlyConfigured("Set DJANGO_SECRET_KEY to a random value of at least 50 characters.")
DEBUG = boolean("DJANGO_DEBUG")
ALLOWED_HOSTS = csv("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")
CSRF_TRUSTED_ORIGINS = csv("CSRF_TRUSTED_ORIGINS")
TIME_ZONE = os.environ.get("APP_TIME_ZONE", "Asia/Beirut")
USE_TZ = True
LANGUAGE_CODE = "en-us"
MARONITE_FEED_ENABLED = boolean("MARONITE_FEED_ENABLED", True)
ALLOW_HOSTED_DEMO_DATA = boolean("ALLOW_HOSTED_DEMO_DATA")
ACCOUNT_REGISTRATION_ENABLED = boolean("ACCOUNT_REGISTRATION_ENABLED")
ACCOUNT_VERIFICATION_REQUIRED = boolean("ACCOUNT_VERIFICATION_REQUIRED")
ACCOUNT_EMAIL_VERIFICATION_ENABLED = boolean("ACCOUNT_EMAIL_VERIFICATION_ENABLED", True)
ACCOUNT_PASSWORD_RESET_ENABLED = boolean("ACCOUNT_PASSWORD_RESET_ENABLED", True)
ACCOUNT_EMAIL_DAILY_LIMIT = int(os.environ.get("ACCOUNT_EMAIL_DAILY_LIMIT", "100"))
ACCOUNT_LOGIN_LIMIT = int(os.environ.get("ACCOUNT_LOGIN_LIMIT", "10"))
ACCOUNT_LOGIN_GLOBAL_LIMIT = int(os.environ.get("ACCOUNT_LOGIN_GLOBAL_LIMIT", "120"))
APP_PUBLIC_URL = os.environ.get("APP_PUBLIC_URL", "http://localhost:5173").rstrip("/")
EMAIL_BACKEND = os.environ.get("EMAIL_BACKEND", "django.core.mail.backends.filebased.EmailBackend")
EMAIL_FILE_PATH = Path(os.environ.get("EMAIL_FILE_PATH", PROJECT_ROOT / ".local" / "emails"))
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "Choralation <noreply@example.invalid>")
GMAIL_CLIENT_ID = os.environ.get("GMAIL_CLIENT_ID", "")
GMAIL_CLIENT_SECRET = os.environ.get("GMAIL_CLIENT_SECRET", "")
GMAIL_REFRESH_TOKEN = os.environ.get("GMAIL_REFRESH_TOKEN", "")
AUTHENTICATION_BACKENDS = ["accounts.backends.EmailOrUsernameBackend"]
if (
    not DEBUG
    and (ACCOUNT_REGISTRATION_ENABLED or ACCOUNT_VERIFICATION_REQUIRED)
    and (ACCOUNT_EMAIL_VERIFICATION_ENABLED or ACCOUNT_PASSWORD_RESET_ENABLED)
):
    if (
        EMAIL_BACKEND != "accounts.email_backend.GmailBackend"
        or not all((GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN))
        or not APP_PUBLIC_URL.startswith("https://")
    ):
        raise ImproperlyConfigured(
            "Configure production HTTPS Gmail delivery before enabling registration."
        )
    public_origin(APP_PUBLIC_URL, require_https=True)
# Render supplies the public host. Additional custom domains stay explicit.
render_hostname = os.environ.get("RENDER_EXTERNAL_HOSTNAME", "")
if render_hostname:
    ALLOWED_HOSTS.append(render_hostname)
    CSRF_TRUSTED_ORIGINS.append(f"https://{render_hostname}")
if boolean("DJANGO_TRUST_PROXY_HTTPS", bool(render_hostname)):
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

database_url = os.environ.get("DATABASE_URL", "")
if not database_url.startswith(("postgres://", "postgresql://")):
    raise ImproperlyConfigured("DATABASE_URL must point to PostgreSQL; SQLite is not supported.")
DATABASES = {
    "default": dj_database_url.parse(database_url, conn_max_age=60, conn_health_checks=True)
}
DATABASES["default"]["TEST"] = {"NAME": os.environ.get("TEST_DATABASE_NAME", "test_choralation")}
DATABASES["default"].setdefault("OPTIONS", {}).update(database_options(database_url, DEBUG))

INSTALLED_APPS = [
    "accounts.admin_config.VerifiedAdminConfig",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "drf_spectacular",
    "accounts",
    "choirs",
    "common",
    "hymns",
    "masses",
]
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "common.middleware.PrivateResponseMiddleware",
]
ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ]
        },
    }
]
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
# Uploads are private: access goes through the authenticated hymn API, never /media/.
MEDIA_ROOT = Path(os.environ.get("DJANGO_MEDIA_ROOT", PROJECT_ROOT / ".local" / "media"))
STORAGES = storage_options()
FRONTEND_ROOT = Path(os.environ.get("DJANGO_FRONTEND_ROOT", PROJECT_ROOT / "frontend" / "dist"))
SERVE_FRONTEND = boolean("DJANGO_SERVE_FRONTEND")
if SERVE_FRONTEND:
    MIDDLEWARE.insert(1, "common.frontend.FrontendStaticMiddleware")
elif not DEBUG:
    MIDDLEWARE.insert(1, "whitenoise.middleware.WhiteNoiseMiddleware")
WHITENOISE_ALLOW_ALL_ORIGINS = False
FILE_UPLOAD_MAX_MEMORY_SIZE = 1024 * 1024
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_SECURE = not DEBUG
# The masked token comes from auth/csrf; JavaScript need not read the cookie.
CSRF_COOKIE_HTTPONLY = True
CSRF_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SECURE = not DEBUG
CSRF_FAILURE_VIEW = "common.errors.csrf_failure"
SECURE_SSL_REDIRECT = not DEBUG
# Internal readiness must query PostgreSQL, not report a healthy HTTPS redirect.
# Render's edge still terminates HTTPS for public requests.
SECURE_REDIRECT_EXEMPT = [r"^health/(?:live|ready)/$"]
SECURE_HSTS_SECONDS = 0 if DEBUG else 31_536_000
SECURE_HSTS_INCLUDE_SUBDOMAINS = not DEBUG
SECURE_HSTS_PRELOAD = not DEBUG
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "no-referrer"
X_FRAME_OPTIONS = "DENY"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework.authentication.SessionAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["accounts.permissions.VerifiedPermission"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "common.errors.exception_handler",
}
SPECTACULAR_SETTINGS = {
    "ENUM_NAME_OVERRIDES": {
        "MassStatusEnum": ["draft", "finalized"],
        "JoinDecisionEnum": ["approved", "declined"],
        "JoinRequestStatusEnum": ["pending", "approved", "declined", "cancelled"],
        "AccountRoleEnum": ["Admin", "Planner", "Viewer"],
        "ChoirRoleEnum": ["Member", "Planner"],
    },
    "TITLE": "Mass Hymn Picker API",
    "DESCRIPTION": "Session authentication, hymn library, classifications, and private PDF sheet music.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "SERVE_PERMISSIONS": ["accounts.permissions.VerifiedPermission"],
    "COMPONENT_SPLIT_REQUEST": True,
}
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"standard": {"format": "{levelname} {name}: {message}", "style": "{"}},
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "standard"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}
