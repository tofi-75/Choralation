from django.db import migrations, models


def assign_leaders(apps, schema_editor):
    memberships = apps.get_model("choirs", "Membership")
    profiles = apps.get_model("accounts", "AccountProfile")
    memberships.objects.filter(
        role="Planner",
        user_id__in=profiles.objects.filter(can_create_choirs=True).values("user_id"),
    ).update(role="Leader")


class Migration(migrations.Migration):
    dependencies = [
        ("choirs", "0002_calendarsettings_calendaroverride"),
        ("accounts", "0005_manager_requests"),
        ("masses", "0002_mass_choir"),
    ]
    operations = [
        migrations.AlterField(
            model_name="membership",
            name="role",
            field=models.CharField(
                max_length=8,
                default="Member",
                choices=[("Member", "Member"), ("Planner", "Planner"), ("Leader", "Choir Leader")],
            ),
        ),
        migrations.RunPython(assign_leaders, migrations.RunPython.noop),
    ]
