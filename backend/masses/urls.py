"""Expose only delivered draft operations."""

from rest_framework.routers import SimpleRouter

from masses.views import MassViewSet

router = SimpleRouter()
router.register("masses", MassViewSet, basename="mass")
urlpatterns = router.urls
