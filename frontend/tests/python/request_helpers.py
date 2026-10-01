from io import BytesIO

from django.core.handlers.asgi import ASGIRequest

from club_web.asgi import initialize_django


def request_from_scope(scope):
    initialize_django()
    request = ASGIRequest(
        {"type": "http", "method": "GET", "path": "/", "query_string": b"", "headers": [], **scope}, BytesIO()
    )
    if "app" in scope:
        request.services = scope["app"].state
    return request
