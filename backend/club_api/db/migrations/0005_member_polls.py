import uuid

import django.db.models.deletion
import django.db.models.functions.datetime
from django.db import migrations, models

import club_api.db.functions


class Migration(migrations.Migration):
    dependencies = [
        ("club_data", "0004_mail_outbox_owner"),
    ]

    operations = [
        migrations.CreateModel(
            name="Poll",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        db_default=club_api.db.functions.DatabaseUUID(),
                        default=uuid.uuid4,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("question", models.CharField(max_length=240)),
                ("options_json", models.JSONField()),
                ("status", models.CharField(db_default="draft", max_length=12)),
                (
                    "created_at",
                    models.DateTimeField(db_default=django.db.models.functions.datetime.Now()),
                ),
                ("opened_at", models.DateTimeField(null=True)),
                ("closed_at", models.DateTimeField(null=True)),
            ],
            options={
                "db_table": "club_polls",
                "indexes": [
                    models.Index(
                        fields=["status", "-created_at"],
                        name="club_poll_status_created",
                    )
                ],
                "constraints": [
                    models.CheckConstraint(
                        condition=models.Q(("status__in", ["draft", "active", "closed"])),
                        name="club_poll_status",
                    )
                ],
            },
        ),
        migrations.CreateModel(
            name="PollVote",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        db_default=club_api.db.functions.DatabaseUUID(),
                        default=uuid.uuid4,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("option_id", models.UUIDField()),
                (
                    "created_at",
                    models.DateTimeField(db_default=django.db.models.functions.datetime.Now()),
                ),
                (
                    "alumni",
                    models.ForeignKey(
                        db_column="alumni_id",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="+",
                        to="club_data.alumnus",
                    ),
                ),
                (
                    "poll",
                    models.ForeignKey(
                        db_column="poll_id",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="+",
                        to="club_data.poll",
                    ),
                ),
            ],
            options={
                "db_table": "club_poll_votes",
                "constraints": [models.UniqueConstraint(fields=("poll", "alumni"), name="club_poll_vote_once")],
            },
        ),
    ]
