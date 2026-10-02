from django.apps import AppConfig


class DataConfig(AppConfig):
    name = "club_api.db"
    label = "club_data"
    default_auto_field = "django.db.models.BigAutoField"
