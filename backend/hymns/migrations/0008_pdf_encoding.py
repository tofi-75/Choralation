from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("hymns", "0007_main_liturgical_seasons")]
    operations = [
        migrations.AddField(
            model_name="hymn",
            name="sheet_music_pdf_encoding",
            field=models.CharField(
                max_length=8,
                choices=[("identity", "identity"), ("gzip", "gzip")],
                default="identity",
                editable=False,
            ),
        ),
        migrations.AddField(
            model_name="hymn",
            name="sheet_music_pdf_size",
            field=models.PositiveIntegerField(null=True, editable=False),
        ),
        migrations.AddField(
            model_name="hymn",
            name="sheet_music_pdf_sha256",
            field=models.CharField(max_length=64, blank=True, editable=False),
        ),
    ]
