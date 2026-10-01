import os
import secrets

SECRET_KEY = os.environ.get("AUTH_SECRET") or secrets.token_urlsafe(48)
DEBUG = False
ALLOWED_HOSTS = ["*"]
ROOT_URLCONF = "club_api.urls"
INSTALLED_APPS = []
MIDDLEWARE = ["club_api.core.middleware.CorsMiddleware"]
APPEND_SLASH = False
USE_TZ = True
TIME_ZONE = "UTC"
LANGUAGE_CODE = "ru"
DATA_UPLOAD_MAX_MEMORY_SIZE = 129 * 1024 * 1024
DATA_UPLOAD_MAX_NUMBER_FILES = 1
DATA_UPLOAD_MAX_NUMBER_FIELDS = 100
FILE_UPLOAD_MAX_MEMORY_SIZE = 256 * 1024
