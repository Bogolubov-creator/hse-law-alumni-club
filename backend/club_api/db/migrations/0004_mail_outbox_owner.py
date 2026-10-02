from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("club_data", "0003_money_bigint")]
    operations = [
        migrations.AddField(model_name="mailoutbox", name="owner_user_id", field=models.UUIDField(null=True)),
    ]
