import secrets
from pathlib import Path

SECRET_KEY = secrets.token_urlsafe(48)
DEBUG = False
ALLOWED_HOSTS = ["*"]
ROOT_URLCONF = "club_web.urls"
INSTALLED_APPS = []
MIDDLEWARE = ["club_web.middleware.HeadersMiddleware"]
APPEND_SLASH = False
USE_TZ = True
TIME_ZONE = "UTC"
LANGUAGE_CODE = "ru"
DATA_UPLOAD_MAX_MEMORY_SIZE = 129 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 256 * 1024
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.jinja2.Jinja2",
        "NAME": "web",
        "DIRS": [Path(__file__).parent / "templates"],
        "APP_DIRS": False,
        "OPTIONS": {"environment": "club_web.rendering.environment"},
    }
]
