"""Create role identities without users, passwords, or application demo data.

Migration labels are intentionally frozen here. Reverse is a no-op to avoid
removing role assignments if this preparatory migration is rolled back.
"""

from django.db import migrations


def create_roles(apps, schema_editor):
    group = apps.get_model("auth", "Group")
    for name in ("Admin", "Planner", "Viewer"):
        group.objects.using(schema_editor.connection.alias).get_or_create(name=name)


class Migration(migrations.Migration):
    initial = True
    dependencies = [("auth", "0012_alter_user_first_name_max_length")]
    operations = [migrations.RunPython(create_roles, migrations.RunPython.noop)]
