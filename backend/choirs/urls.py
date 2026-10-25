from rest_framework.routers import SimpleRouter

from choirs.views import ChoirViewSet

router = SimpleRouter()
router.register("choirs", ChoirViewSet, basename="choir")
urlpatterns = router.urls
