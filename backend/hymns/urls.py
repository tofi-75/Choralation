"""One route family per independent classification, plus the hymn library."""

from rest_framework.routers import DefaultRouter

from hymns.models import CATEGORY_TYPES
from hymns.views import CategoryViewSet, HymnViewSet

router = DefaultRouter()
router.register("hymns", HymnViewSet, basename="hymn")
for name, model in CATEGORY_TYPES.items():
    view = type(
        f"{model.__name__}ViewSet", (CategoryViewSet,), {"model": model, "__module__": __name__}
    )
    router.register(name, view, basename=name)
urlpatterns = router.urls
