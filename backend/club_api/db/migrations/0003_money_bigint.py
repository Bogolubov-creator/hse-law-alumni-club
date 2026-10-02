from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("club_data", "0002_foreign_key_actions")]
    operations = [
        migrations.AlterField(
            model_name="products", name="price", field=models.BigIntegerField(null=True, db_default=0)
        ),
        migrations.AlterField(
            model_name="programs", name="price", field=models.BigIntegerField(null=True, db_default=0)
        ),
        migrations.AlterField(
            model_name="orders", name="subtotal", field=models.BigIntegerField(null=True, db_default=0)
        ),
        migrations.AlterField(
            model_name="orders", name="total_estimate", field=models.BigIntegerField(null=True, db_default=0)
        ),
    ]
