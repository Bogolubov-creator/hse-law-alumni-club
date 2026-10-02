import os
import secrets

from club_api.db.config import database_config

SECRET_KEY = os.environ.get("AUTH_SECRET") or secrets.token_urlsafe(48)
DEBUG = False
ALLOWED_HOSTS = ["*"]
ROOT_URLCONF = "club_api.urls"
INSTALLED_APPS = ["club_api.db.apps.DataConfig"]
DATABASES = {"default": database_config(os.environ.get("CHECKOUT_DATABASE_URL"))}
MIDDLEWARE = ["club_api.core.middleware.CorsMiddleware"]
APPEND_SLASH = False
USE_TZ = True
TIME_ZONE = "UTC"
LANGUAGE_CODE = "ru"
DATA_UPLOAD_MAX_MEMORY_SIZE = 129 * 1024 * 1024
DATA_UPLOAD_MAX_NUMBER_FILES = 1
DATA_UPLOAD_MAX_NUMBER_FIELDS = 100
FILE_UPLOAD_MAX_MEMORY_SIZE = 256 * 1024
PASSWORD_HASHERS = ["django.contrib.auth.hashers.BCryptSHA256PasswordHasher"]
