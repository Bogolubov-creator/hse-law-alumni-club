import os
import sys

from django.core.management import execute_from_command_line

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "club_api.django_settings")
execute_from_command_line(sys.argv)
