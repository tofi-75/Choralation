import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0003_accountprofile_account_email_case_unique"),
        ("choirs", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="accountprofile",
            name="default_choir",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="+",
                to="choirs.choir",
            ),
        ),
    ]
