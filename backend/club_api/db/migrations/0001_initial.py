import uuid

import django.db.models.deletion
import django.db.models.functions.datetime
from django.db import migrations, models

import club_api.db.functions


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="Achievements",
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
                ("key", models.CharField(max_length=255, null=True, unique=True)),
                ("title", models.CharField(max_length=255, null=True)),
                ("description", models.TextField(null=True)),
                ("rule_json", models.JSONField(null=True)),
                ("points_reward", models.IntegerField(db_default=0, null=True)),
                ("sort", models.IntegerField(null=True)),
                ("icon", models.CharField(max_length=255, null=True)),
                ("kind", models.CharField(max_length=255, null=True)),
            ],
            options={
                "db_table": "achievements",
            },
        ),
        migrations.CreateModel(
            name="Alumnus",
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
                ("fio", models.CharField(max_length=255, null=True)),
                ("cohort", models.CharField(max_length=255, null=True)),
                (
                    "status",
                    models.CharField(db_default="active", max_length=255, null=True),
                ),
                (
                    "verification_status",
                    models.CharField(db_default="pending", max_length=255, null=True),
                ),
                ("points_cached", models.IntegerField(db_default=0, null=True)),
                (
                    "level_cached",
                    models.CharField(db_default="graduate", max_length=255, null=True),
                ),
                ("personal_discount", models.IntegerField(db_default=0, null=True)),
                ("contacts_json", models.JSONField(null=True)),
                ("edu_program", models.CharField(max_length=255, null=True)),
                ("edu_level", models.CharField(max_length=255, null=True)),
                ("interests_json", models.JSONField(null=True)),
                (
                    "podcast_reminder_sent",
                    models.BooleanField(db_default=False, null=True),
                ),
                ("podcast_sub_until", models.DateTimeField(null=True)),
                ("avatar", models.CharField(max_length=255, null=True)),
                (
                    "referral_code",
                    models.CharField(max_length=255, null=True, unique=True),
                ),
                (
                    "telegram_id",
                    models.CharField(max_length=255, null=True, unique=True),
                ),
                ("token_version", models.IntegerField(db_default=0, null=True)),
                ("consent_at", models.DateTimeField(null=True)),
                ("consent_version", models.CharField(max_length=255, null=True)),
                ("verified_at", models.DateTimeField(null=True)),
                (
                    "joined_at",
                    models.DateTimeField(db_default=django.db.models.functions.datetime.Now(), null=True),
                ),
                ("last_activity_at", models.DateTimeField(null=True)),
                (
                    "referred_by",
                    models.ForeignKey(
                        db_column="referred_by",
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+",
                        to="club_data.alumnus",
                    ),
                ),
            ],
            options={
                "db_table": "alumni",
            },
        ),
        migrations.CreateModel(
            name="BlockCta",
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
                ("title", models.CharField(max_length=255, null=True)),
                ("text", models.TextField(null=True)),
                ("button", models.CharField(max_length=255, null=True)),
            ],
            options={
                "db_table": "block_cta",
            },
        ),
        migrations.CreateModel(
            name="BlockHero",
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
                ("badge", models.CharField(max_length=255, null=True)),
                ("title_pre", models.CharField(max_length=255, null=True)),
                ("title_accent", models.CharField(max_length=255, null=True)),
                ("subtitle", models.TextField(null=True)),
                ("cta_primary", models.CharField(max_length=255, null=True)),
                ("cta_secondary", models.CharField(max_length=255, null=True)),
                ("history_eyebrow", models.CharField(max_length=255, null=True)),
                ("history_title", models.CharField(max_length=255, null=True)),
                ("history_hint", models.CharField(max_length=255, null=True)),
                ("marquee", models.JSONField(null=True)),
            ],
            options={
                "db_table": "block_hero",
            },
        ),
        migrations.CreateModel(
            name="Events",
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
                ("title", models.CharField(max_length=255, null=True)),
                ("description", models.TextField(null=True)),
                ("starts_at", models.DateTimeField(null=True)),
                ("location", models.CharField(max_length=255, null=True)),
                ("cover", models.CharField(max_length=255, null=True)),
                ("reg_url", models.CharField(max_length=255, null=True)),
                ("reminder_sent", models.BooleanField(db_default=False, null=True)),
                (
                    "format",
                    models.CharField(db_default="offline", max_length=255, null=True),
                ),
                ("points", models.IntegerField(db_default=60, null=True)),
                (
                    "status",
                    models.CharField(db_default="published", max_length=255, null=True),
                ),
                (
                    "created_at",
                    models.DateTimeField(db_default=django.db.models.functions.datetime.Now(), null=True),
                ),
            ],
            options={
                "db_table": "events",
            },
        ),
        migrations.CreateModel(
            name="Levels",
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
                ("key", models.CharField(max_length=255, null=True, unique=True)),
                ("title", models.CharField(max_length=255, null=True)),
                ("min_points", models.IntegerField(db_default=0, null=True)),
                ("discount_percent", models.IntegerField(db_default=0, null=True)),
                ("sort", models.IntegerField(null=True)),
                ("color", models.CharField(max_length=255, null=True)),
            ],
            options={
                "db_table": "levels",
            },
        ),
        migrations.CreateModel(
            name="News",
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
                ("slug", models.CharField(max_length=255, null=True, unique=True)),
                ("title", models.CharField(max_length=255, null=True)),
                ("excerpt", models.TextField(null=True)),
                ("body", models.TextField(null=True)),
                ("source_url", models.CharField(max_length=255, null=True)),
                ("published_at", models.DateTimeField(null=True)),
                (
                    "status",
                    models.CharField(db_default="draft", max_length=255, null=True),
                ),
            ],
            options={
                "db_table": "news",
            },
        ),
        migrations.CreateModel(
            name="NewsSourceRuns",
            fields=[
                (
                    "source",
                    models.CharField(max_length=255, primary_key=True, serialize=False),
                ),
                (
                    "checked_at",
                    models.DateTimeField(db_default=django.db.models.functions.datetime.Now()),
                ),
                ("found", models.IntegerField(db_default=0)),
                ("error", models.TextField(null=True)),
            ],
            options={
                "db_table": "club_news_source_runs",
            },
        ),
        migrations.CreateModel(
            name="Pages",
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
                ("slug", models.CharField(max_length=255, null=True, unique=True)),
                ("title", models.CharField(max_length=255, null=True)),
                (
                    "status",
                    models.CharField(db_default="draft", max_length=255, null=True),
                ),
                ("sort", models.IntegerField(null=True)),
            ],
            options={
                "db_table": "pages",
            },
        ),
        migrations.CreateModel(
            name="PageViews",
            fields=[
                (
                    "pk",
                    models.CompositePrimaryKey(
                        "day",
                        "path",
                        blank=True,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("day", models.DateField()),
                ("path", models.CharField(max_length=512)),
                ("hits", models.IntegerField(db_default=0)),
            ],
            options={
                "db_table": "club_page_views",
            },
        ),
        migrations.CreateModel(
            name="Podcasts",
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
                ("title", models.CharField(max_length=255, null=True)),
                ("description", models.TextField(null=True)),
                ("cover", models.CharField(max_length=255, null=True)),
                ("audio_url", models.CharField(max_length=255, null=True)),
                ("video_url", models.CharField(max_length=255, null=True)),
                ("duration", models.CharField(max_length=255, null=True)),
                ("is_free", models.BooleanField(db_default=False, null=True)),
                ("sort", models.IntegerField(null=True)),
                (
                    "status",
                    models.CharField(db_default="draft", max_length=255, null=True),
                ),
                (
                    "created_at",
                    models.DateTimeField(db_default=django.db.models.functions.datetime.Now(), null=True),
                ),
            ],
            options={
                "db_table": "podcasts",
            },
        ),
        migrations.CreateModel(
            name="PointRules",
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
                ("reason", models.CharField(max_length=255, null=True, unique=True)),
                ("points", models.IntegerField(db_default=0, null=True)),
                ("active", models.BooleanField(db_default=True, null=True)),
                ("description", models.CharField(max_length=255, null=True)),
            ],
            options={
                "db_table": "point_rules",
            },
        ),
        migrations.CreateModel(
            name="Products",
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
                ("slug", models.CharField(max_length=255, null=True, unique=True)),
                ("title", models.CharField(max_length=255, null=True)),
                ("category", models.CharField(max_length=255, null=True)),
                ("price", models.IntegerField(db_default=0, null=True)),
                ("images", models.JSONField(null=True)),
                ("variants_json", models.JSONField(null=True)),
                ("stock", models.IntegerField(db_default=0, null=True)),
                ("description", models.TextField(null=True)),
                (
                    "status",
                    models.CharField(db_default="draft", max_length=255, null=True),
                ),
            ],
            options={
                "db_table": "products",
            },
        ),
        migrations.CreateModel(
            name="Programs",
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
                ("slug", models.CharField(max_length=255, null=True, unique=True)),
                ("title", models.CharField(max_length=255, null=True)),
                ("direction", models.CharField(max_length=255, null=True)),
                (
                    "format",
                    models.CharField(db_default="online", max_length=255, null=True),
                ),
                ("duration", models.CharField(max_length=255, null=True)),
                ("price", models.IntegerField(db_default=0, null=True)),
                ("dates", models.JSONField(null=True)),
                ("capacity", models.IntegerField(null=True)),
                ("seats_taken", models.IntegerField(db_default=0, null=True)),
                ("modules", models.JSONField(null=True)),
                ("teachers", models.JSONField(null=True)),
                ("document", models.CharField(max_length=255, null=True)),
                ("source_url", models.CharField(max_length=255, null=True)),
                (
                    "enrollment",
                    models.CharField(db_default="actual", max_length=255, null=True),
                ),
                ("description", models.TextField(null=True)),
                ("cover", models.CharField(max_length=255, null=True)),
                ("hse_id", models.CharField(max_length=255, null=True)),
                ("tagline", models.TextField(null=True)),
                ("audience", models.JSONField(null=True)),
                ("results", models.JSONField(null=True)),
                ("advantages", models.JSONField(null=True)),
                (
                    "status",
                    models.CharField(db_default="draft", max_length=255, null=True),
                ),
            ],
            options={
                "db_table": "programs",
            },
        ),
        migrations.CreateModel(
            name="Settings",
            fields=[
                (
                    "key",
                    models.CharField(max_length=255, primary_key=True, serialize=False),
                ),
                ("value", models.JSONField()),
                (
                    "updated_at",
                    models.DateTimeField(db_default=django.db.models.functions.datetime.Now()),
                ),
            ],
            options={
                "db_table": "club_settings",
            },
        ),
        migrations.CreateModel(
            name="User",
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
                ("first_name", models.CharField(max_length=50, null=True)),
                ("last_name", models.CharField(max_length=50, null=True)),
                ("email", models.CharField(max_length=128, null=True, unique=True)),
                ("password", models.CharField(max_length=255, null=True)),
                ("location", models.CharField(max_length=255, null=True)),
                ("title", models.CharField(max_length=50, null=True)),
                ("description", models.TextField(null=True)),
                ("tags", models.JSONField(null=True)),
                ("avatar", models.UUIDField(null=True)),
                ("language", models.CharField(max_length=255, null=True)),
                ("tfa_secret", models.CharField(max_length=255, null=True)),
                ("status", models.CharField(db_default="active", max_length=16)),
                ("token", models.CharField(max_length=255, null=True, unique=True)),
                ("last_access", models.DateTimeField(null=True)),
                ("last_page", models.CharField(max_length=255, null=True)),
                ("provider", models.CharField(db_default="default", max_length=128)),
                (
                    "external_identifier",
                    models.CharField(max_length=255, null=True, unique=True),
                ),
                ("auth_data", models.JSONField(null=True)),
                (
                    "email_notifications",
                    models.BooleanField(db_default=True, null=True),
                ),
                ("appearance", models.CharField(max_length=255, null=True)),
                ("theme_dark", models.CharField(max_length=255, null=True)),
                ("theme_light", models.CharField(max_length=255, null=True)),
                ("theme_light_overrides", models.JSONField(null=True)),
                ("theme_dark_overrides", models.JSONField(null=True)),
                ("text_direction", models.CharField(db_default="auto", max_length=255)),
            ],
            options={
                "db_table": "directus_users",
            },
        ),
        migrations.CreateModel(
            name="TimelineItems",
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
                ("year", models.CharField(max_length=255, null=True)),
                ("title", models.CharField(max_length=255, null=True)),
                ("text", models.TextField(null=True)),
                ("metric", models.CharField(max_length=255, null=True)),
                ("sort", models.IntegerField(null=True)),
                (
                    "status",
                    models.CharField(db_default="published", max_length=255, null=True),
                ),
            ],
            options={
                "db_table": "timeline_items",
            },
        ),
        migrations.CreateModel(
            name="SocialMembership",
            fields=[
                (
                    "alumni",
                    models.OneToOneField(
                        db_column="alumni_id",
                        on_delete=django.db.models.deletion.CASCADE,
                        primary_key=True,
                        related_name="+",
                        serialize=False,
                        to="club_data.alumnus",
                    ),
                ),
                ("telegram_id", models.TextField()),
                ("subscribed", models.BooleanField()),
                (
                    "checked_at",
                    models.DateTimeField(db_default=django.db.models.functions.datetime.Now()),
                ),
            ],
            options={
                "db_table": "club_social_membership",
            },
        ),
        migrations.CreateModel(
            name="AlumniFriends",
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
                (
                    "status",
                    models.CharField(db_default="pending", max_length=255, null=True),
                ),
                (
                    "created_at",
                    models.DateTimeField(db_default=django.db.models.functions.datetime.Now(), null=True),
                ),
                (
                    "alumni",
                    models.ForeignKey(
                        db_column="alumni_id",
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="+",
                        to="club_data.alumnus",
                    ),
                ),
                (
                    "friend",
                    models.ForeignKey(
                        db_column="friend_id",
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="+",
                        to="club_data.alumnus",
                    ),
                ),
            ],
            options={
                "db_table": "alumni_friends",
            },
        ),
        migrations.CreateModel(
            name="AlumniAchievements",
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
                (
                    "earned_at",
                    models.DateTimeField(db_default=django.db.models.functions.datetime.Now(), null=True),
                ),
                (
                    "achievement",
                    models.ForeignKey(
                        db_column="achievement_id",
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="+",
                        to="club_data.achievements",
                    ),
                ),
                (
                    "alumni",
                    models.ForeignKey(
                        db_column="alumni_id",
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="+",
                        to="club_data.alumnus",
                    ),
                ),
            ],
            options={
                "db_table": "alumni_achievements",
            },
        ),
        migrations.CreateModel(
            name="AuditLog",
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
                ("event", models.CharField(max_length=255, null=True)),
                ("actor", models.CharField(max_length=255, null=True)),
                ("subject", models.CharField(max_length=255, null=True)),
                ("detail", models.JSONField(null=True)),
                ("ip", models.CharField(max_length=255, null=True)),
                (
                    "created_at",
                    models.DateTimeField(db_default=django.db.models.functions.datetime.Now(), null=True),
                ),
            ],
            options={
                "db_table": "audit_log",
                "indexes": [models.Index(fields=["created_at"], name="idx_audit_created")],
            },
        ),
        migrations.CreateModel(
            name="AuthRevocations",
            fields=[
                (
                    "token_key",
                    models.CharField(max_length=255, primary_key=True, serialize=False),
                ),
                ("expires_at", models.DateTimeField()),
            ],
            options={
                "db_table": "club_auth_revocations",
                "indexes": [models.Index(fields=["expires_at"], name="club_auth_revocations_expiry_i")],
            },
        ),
        migrations.CreateModel(
            name="FaqEvents",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("kind", models.CharField(max_length=255)),
                ("gap_id", models.CharField(max_length=255, null=True)),
                ("channel", models.CharField(max_length=255)),
                (
                    "created_at",
                    models.DateTimeField(db_default=django.db.models.functions.datetime.Now()),
                ),
            ],
            options={
                "db_table": "club_faq_events",
                "indexes": [
                    models.Index(fields=["-created_at"], name="club_faq_events_created_idx"),
                    models.Index(fields=["kind", "gap_id"], name="club_faq_events_gap_idx"),
                ],
                "constraints": [
                    models.CheckConstraint(
                        condition=models.Q(("kind__in", ["gap", "none"])),
                        name="club_faq_events_kind_check",
                    ),
                    models.CheckConstraint(
                        condition=models.Q(("channel__in", ["site", "telegram"])),
                        name="club_faq_events_channel_check",
                    ),
                ],
            },
        ),
        migrations.CreateModel(
            name="MailOutbox",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("kind", models.TextField(db_default="office")),
                ("to_addr", models.CharField(max_length=255)),
                ("subject", models.TextField()),
                ("body", models.TextField()),
                ("status", models.CharField(db_default="pending", max_length=255)),
                ("attempts", models.IntegerField(db_default=0)),
                (
                    "next_attempt_at",
                    models.DateTimeField(db_default=django.db.models.functions.datetime.Now()),
                ),
                ("last_error", models.TextField(null=True)),
                (
                    "created_at",
                    models.DateTimeField(db_default=django.db.models.functions.datetime.Now()),
                ),
                ("sent_at", models.DateTimeField(null=True)),
            ],
            options={
                "db_table": "club_mail_outbox",
                "indexes": [
                    models.Index(
                        fields=["status", "next_attempt_at"],
                        name="club_mail_outbox_due_idx",
                    ),
                    models.Index(
                        fields=["to_addr", "-created_at"],
                        name="club_mail_outbox_confirmation_",
                    ),
                ],
                "constraints": [
                    models.CheckConstraint(
                        condition=models.Q(("status__in", ["pending", "sent", "failed"])),
                        name="club_mail_outbox_status_check",
                    )
                ],
            },
        ),
        migrations.CreateModel(
            name="Offers",
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
                (
                    "kind",
                    models.CharField(db_default="level", max_length=255, null=True),
                ),
                ("level_key", models.CharField(max_length=255, null=True)),
                ("percent", models.IntegerField(db_default=0, null=True)),
                ("title", models.CharField(max_length=255, null=True)),
                ("active", models.BooleanField(db_default=True, null=True)),
                ("valid_until", models.DateTimeField(null=True)),
                (
                    "alumni",
                    models.ForeignKey(
                        db_column="alumni_id",
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="+",
                        to="club_data.alumnus",
                    ),
                ),
            ],
            options={
                "db_table": "offers",
            },
        ),
        migrations.CreateModel(
            name="Orders",
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
                ("number", models.CharField(max_length=255, null=True, unique=True)),
                ("type", models.CharField(db_default="dpo", max_length=255, null=True)),
                ("items_json", models.JSONField(null=True)),
                ("subtotal", models.IntegerField(db_default=0, null=True)),
                ("member_discount", models.IntegerField(db_default=0, null=True)),
                ("total_estimate", models.IntegerField(db_default=0, null=True)),
                ("contact_fio", models.CharField(max_length=255, null=True)),
                ("contact_phone", models.CharField(max_length=255, null=True)),
                ("contact_email", models.CharField(max_length=255, null=True)),
                (
                    "fulfillment",
                    models.CharField(db_default="pickup", max_length=255, null=True),
                ),
                ("address", models.TextField(null=True)),
                ("comment", models.TextField(null=True)),
                ("consent_pdn", models.BooleanField(db_default=False, null=True)),
                ("payment_id", models.CharField(max_length=255, null=True)),
                ("payment_status", models.CharField(max_length=255, null=True)),
                ("paid_at", models.DateTimeField(null=True)),
                (
                    "status",
                    models.CharField(db_default="new", max_length=255, null=True),
                ),
                (
                    "created_at",
                    models.DateTimeField(db_default=django.db.models.functions.datetime.Now(), null=True),
                ),
                (
                    "alumni",
                    models.ForeignKey(
                        db_column="alumni_id",
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+",
                        to="club_data.alumnus",
                    ),
                ),
            ],
            options={
                "db_table": "orders",
            },
        ),
        migrations.CreateModel(
            name="CheckoutCommits",
            fields=[
                (
                    "key_hash",
                    models.CharField(max_length=255, primary_key=True, serialize=False),
                ),
                ("request_hash", models.TextField()),
                (
                    "reservations",
                    models.JSONField(
                        db_default=models.Value([], output_field=models.JSONField()),
                        default=list,
                    ),
                ),
                ("released", models.BooleanField(db_default=False)),
                ("receipt", models.JSONField()),
                (
                    "created_at",
                    models.DateTimeField(db_default=django.db.models.functions.datetime.Now()),
                ),
                (
                    "order",
                    models.OneToOneField(
                        db_column="order_id",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="+",
                        to="club_data.orders",
                    ),
                ),
            ],
            options={
                "db_table": "club_checkout_commits",
            },
        ),
        migrations.CreateModel(
            name="PagesBlocks",
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
                ("collection", models.CharField(max_length=255, null=True)),
                ("item", models.CharField(max_length=255, null=True)),
                ("sort", models.IntegerField(null=True)),
                (
                    "pages",
                    models.ForeignKey(
                        db_column="pages_id",
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="+",
                        to="club_data.pages",
                    ),
                ),
            ],
            options={
                "db_table": "pages_blocks",
            },
        ),
        migrations.CreateModel(
            name="PodcastPlays",
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
                (
                    "created_at",
                    models.DateTimeField(db_default=django.db.models.functions.datetime.Now(), null=True),
                ),
                (
                    "alumni",
                    models.ForeignKey(
                        db_column="alumni_id",
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+",
                        to="club_data.alumnus",
                    ),
                ),
                (
                    "podcast",
                    models.ForeignKey(
                        db_column="podcast_id",
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="+",
                        to="club_data.podcasts",
                    ),
                ),
            ],
            options={
                "db_table": "podcast_plays",
            },
        ),
        migrations.CreateModel(
            name="PointsLedger",
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
                ("delta", models.IntegerField(db_default=0, null=True)),
                ("reason", models.CharField(max_length=255, null=True)),
                ("ref", models.CharField(max_length=255, null=True)),
                ("comment", models.TextField(null=True)),
                (
                    "idempotency_key",
                    models.CharField(max_length=255, null=True, unique=True),
                ),
                (
                    "created_at",
                    models.DateTimeField(db_default=django.db.models.functions.datetime.Now(), null=True),
                ),
                (
                    "alumni",
                    models.ForeignKey(
                        db_column="alumni_id",
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="+",
                        to="club_data.alumnus",
                    ),
                ),
            ],
            options={
                "db_table": "points_ledger",
            },
        ),
        migrations.CreateModel(
            name="PushSubs",
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
                ("endpoint", models.TextField(null=True)),
                ("keys", models.JSONField(null=True)),
                (
                    "created_at",
                    models.DateTimeField(db_default=django.db.models.functions.datetime.Now(), null=True),
                ),
                (
                    "alumni",
                    models.ForeignKey(
                        db_column="alumni_id",
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="+",
                        to="club_data.alumnus",
                    ),
                ),
            ],
            options={
                "db_table": "push_subs",
            },
        ),
        migrations.CreateModel(
            name="SocialReactions",
            fields=[
                (
                    "pk",
                    models.CompositePrimaryKey(
                        "alumni_id",
                        "chat_id",
                        "message_id",
                        blank=True,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("chat_id", models.CharField(max_length=255)),
                ("message_id", models.BigIntegerField()),
                ("active", models.BooleanField()),
                ("event_at", models.BigIntegerField()),
                ("update_id", models.BigIntegerField(db_default=0)),
                (
                    "alumni",
                    models.ForeignKey(
                        db_column="alumni_id",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="+",
                        to="club_data.alumnus",
                    ),
                ),
            ],
            options={
                "db_table": "club_social_reactions",
            },
        ),
        migrations.CreateModel(
            name="StaffSessions",
            fields=[
                (
                    "user",
                    models.OneToOneField(
                        db_column="user_id",
                        on_delete=django.db.models.deletion.CASCADE,
                        primary_key=True,
                        related_name="+",
                        serialize=False,
                        to="club_data.user",
                    ),
                ),
                ("token_version", models.IntegerField(db_default=0)),
            ],
            options={
                "db_table": "club_staff_sessions",
            },
        ),
        migrations.CreateModel(
            name="Referrals",
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
                ("code", models.CharField(max_length=255, null=True)),
                (
                    "status",
                    models.CharField(db_default="pending", max_length=255, null=True),
                ),
                ("reward_points", models.IntegerField(db_default=0, null=True)),
                (
                    "created_at",
                    models.DateTimeField(db_default=django.db.models.functions.datetime.Now(), null=True),
                ),
                (
                    "referrer",
                    models.ForeignKey(
                        db_column="referrer_id",
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="+",
                        to="club_data.alumnus",
                    ),
                ),
                (
                    "invited_user",
                    models.ForeignKey(
                        db_column="invited_user_id",
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+",
                        to="club_data.user",
                    ),
                ),
            ],
            options={
                "db_table": "referrals",
            },
        ),
        migrations.CreateModel(
            name="MediaFile",
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
                ("storage", models.CharField(max_length=255)),
                ("filename_disk", models.CharField(max_length=255, null=True)),
                ("filename_download", models.CharField(max_length=255)),
                ("title", models.CharField(max_length=255, null=True)),
                ("type", models.CharField(max_length=255, null=True)),
                ("folder", models.UUIDField(null=True)),
                (
                    "created_on",
                    models.DateTimeField(db_default=django.db.models.functions.datetime.Now()),
                ),
                (
                    "modified_on",
                    models.DateTimeField(db_default=django.db.models.functions.datetime.Now()),
                ),
                ("charset", models.CharField(max_length=50, null=True)),
                ("filesize", models.BigIntegerField(null=True)),
                ("width", models.IntegerField(null=True)),
                ("height", models.IntegerField(null=True)),
                ("duration", models.IntegerField(null=True)),
                ("embed", models.CharField(max_length=200, null=True)),
                ("description", models.TextField(null=True)),
                ("location", models.TextField(null=True)),
                ("tags", models.TextField(null=True)),
                ("metadata", models.JSONField(null=True)),
                ("focal_point_x", models.IntegerField(null=True)),
                ("focal_point_y", models.IntegerField(null=True)),
                ("tus_id", models.CharField(max_length=64, null=True)),
                ("tus_data", models.JSONField(null=True)),
                ("uploaded_on", models.DateTimeField(null=True)),
                (
                    "modified_by",
                    models.ForeignKey(
                        db_column="modified_by",
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="+",
                        to="club_data.user",
                    ),
                ),
                (
                    "uploaded_by",
                    models.ForeignKey(
                        db_column="uploaded_by",
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="+",
                        to="club_data.user",
                    ),
                ),
            ],
            options={
                "db_table": "directus_files",
            },
        ),
        migrations.AddField(
            model_name="alumnus",
            name="user",
            field=models.OneToOneField(
                db_column="user_id",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="+",
                to="club_data.user",
            ),
        ),
        migrations.CreateModel(
            name="SupportTickets",
            fields=[
                ("id", models.UUIDField(primary_key=True, serialize=False)),
                ("key_hash", models.TextField()),
                ("request_hash", models.TextField()),
                ("topic", models.TextField()),
                (
                    "messages",
                    models.JSONField(
                        db_default=models.Value([], output_field=models.JSONField()),
                        default=list,
                    ),
                ),
                ("status", models.TextField(db_default="open")),
                ("consent_version", models.TextField()),
                ("consent_text", models.TextField()),
                (
                    "consent_at",
                    models.DateTimeField(db_default=django.db.models.functions.datetime.Now()),
                ),
                (
                    "created_at",
                    models.DateTimeField(db_default=django.db.models.functions.datetime.Now()),
                ),
                (
                    "updated_at",
                    models.DateTimeField(db_default=django.db.models.functions.datetime.Now()),
                ),
                ("expires_at", models.DateTimeField()),
            ],
            options={
                "db_table": "club_support_tickets",
                "indexes": [models.Index(fields=["expires_at"], name="club_support_expiry")],
                "constraints": [
                    models.CheckConstraint(
                        condition=models.Q(("status__in", ["open", "answered", "closed"])),
                        name="club_support_tickets_status_check",
                    )
                ],
            },
        ),
        migrations.CreateModel(
            name="UserRole",
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
                ("name", models.CharField(max_length=100)),
                (
                    "icon",
                    models.CharField(db_default="supervised_user_circle", max_length=64),
                ),
                ("description", models.TextField(null=True)),
                (
                    "parent",
                    models.ForeignKey(
                        db_column="parent",
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="+",
                        to="club_data.userrole",
                    ),
                ),
            ],
            options={
                "db_table": "directus_roles",
            },
        ),
        migrations.AddField(
            model_name="user",
            name="role",
            field=models.ForeignKey(
                db_column="role",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="+",
                to="club_data.userrole",
            ),
        ),
        migrations.CreateModel(
            name="TelegramLinks",
            fields=[
                (
                    "alumni",
                    models.OneToOneField(
                        db_column="alumni_id",
                        on_delete=django.db.models.deletion.CASCADE,
                        primary_key=True,
                        related_name="+",
                        serialize=False,
                        to="club_data.alumnus",
                    ),
                ),
                ("token_hash", models.TextField(unique=True)),
                ("expires_at", models.DateTimeField()),
            ],
            options={
                "db_table": "club_telegram_links",
                "indexes": [models.Index(fields=["expires_at"], name="club_telegram_links_expiry_idx")],
            },
        ),
        migrations.CreateModel(
            name="Carts",
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
                ("session_token", models.CharField(max_length=255, null=True)),
                ("items_json", models.JSONField(null=True)),
                (
                    "updated_at",
                    models.DateTimeField(db_default=django.db.models.functions.datetime.Now(), null=True),
                ),
                (
                    "alumni",
                    models.ForeignKey(
                        db_column="alumni_id",
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+",
                        to="club_data.alumnus",
                    ),
                ),
            ],
            options={
                "db_table": "carts",
                "indexes": [models.Index(fields=["session_token"], name="idx_carts_session")],
            },
        ),
        migrations.CreateModel(
            name="EventRsvps",
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
                ("attended", models.BooleanField(db_default=False, null=True)),
                (
                    "created_at",
                    models.DateTimeField(db_default=django.db.models.functions.datetime.Now(), null=True),
                ),
                (
                    "alumni",
                    models.ForeignKey(
                        db_column="alumni_id",
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="+",
                        to="club_data.alumnus",
                    ),
                ),
                (
                    "event",
                    models.ForeignKey(
                        db_column="event_id",
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="+",
                        to="club_data.events",
                    ),
                ),
            ],
            options={
                "db_table": "event_rsvps",
                "constraints": [
                    models.UniqueConstraint(fields=("event", "alumni"), name="uq_event_rsvps_event_alumni")
                ],
            },
        ),
        migrations.CreateModel(
            name="NewsInbox",
            fields=[
                (
                    "id",
                    models.CharField(max_length=255, primary_key=True, serialize=False),
                ),
                ("source_url", models.TextField(unique=True)),
                ("sources", models.JSONField()),
                ("title", models.TextField()),
                ("published_at", models.DateTimeField(null=True)),
                (
                    "discovered_at",
                    models.DateTimeField(db_default=django.db.models.functions.datetime.Now()),
                ),
                ("state", models.TextField(db_default="new")),
                (
                    "news",
                    models.ForeignKey(
                        db_column="news_id",
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+",
                        to="club_data.news",
                    ),
                ),
            ],
            options={
                "db_table": "club_news_inbox",
                "constraints": [
                    models.CheckConstraint(
                        condition=models.Q(("state__in", ["new", "imported", "dismissed"])),
                        name="club_news_inbox_state_check",
                    )
                ],
            },
        ),
        migrations.AddIndex(
            model_name="orders",
            index=models.Index(fields=["status"], name="idx_orders_status"),
        ),
        migrations.AddIndex(
            model_name="orders",
            index=models.Index(fields=["created_at"], name="idx_orders_created"),
        ),
        migrations.AddIndex(
            model_name="pushsubs",
            index=models.Index(fields=["endpoint"], name="idx_push_subs_endpoint"),
        ),
        migrations.AddConstraint(
            model_name="staffsessions",
            constraint=models.CheckConstraint(
                condition=models.Q(("token_version__gte", 0)),
                name="club_staff_sessions_token_version_check",
            ),
        ),
        migrations.AddIndex(
            model_name="alumnus",
            index=models.Index(fields=["verification_status"], name="idx_alumni_verif"),
        ),
        migrations.AddIndex(
            model_name="alumnus",
            index=models.Index(fields=["cohort"], name="idx_alumni_cohort"),
        ),
    ]
