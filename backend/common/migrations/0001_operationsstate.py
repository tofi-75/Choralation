import uuid

from django.db import migrations, models


def initialize(apps, schema_editor):
    apps.get_model("common", "OperationsState").objects.using(
        schema_editor.connection.alias
    ).create(id=1)


class Migration(migrations.Migration):
    initial = True
    dependencies = []
    operations = [
        migrations.CreateModel(
            name="OperationsState",
            fields=[
                (
                    "id",
                    models.PositiveSmallIntegerField(
                        default=1, editable=False, primary_key=True, serialize=False
                    ),
                ),
                ("database_id", models.UUIDField(default=uuid.uuid4, editable=False)),
                ("read_only", models.BooleanField(default=False)),
                ("operation_id", models.CharField(blank=True, max_length=120)),
                ("phase", models.CharField(default="idle", max_length=40)),
                ("reason", models.CharField(blank=True, max_length=200)),
                ("target_sha", models.CharField(blank=True, max_length=40)),
                ("deployment_id", models.CharField(blank=True, max_length=120)),
                ("snapshot_id", models.CharField(blank=True, max_length=120)),
                ("started_at", models.DateTimeField(null=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("last_backup", models.JSONField(default=dict)),
                ("last_release", models.JSONField(default=dict)),
                ("last_restore", models.JSONField(default=dict)),
            ],
            options={
                "constraints": [
                    models.CheckConstraint(condition=models.Q(id=1), name="operations_singleton")
                ]
            },
        ),
        migrations.RunPython(initialize, migrations.RunPython.noop),
    ]
