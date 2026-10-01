import json
import logging
from functools import wraps
from uuid import UUID

import psycopg
from django.core.exceptions import SuspiciousOperation
from django.http import HttpResponseBase, JsonResponse
from pydantic import ValidationError

from club_api.core.errors import ApiError

logger = logging.getLogger("club.api")


def json_body(request):
    try:
        if request.content_type != "application/json":
            raise ValueError
        return json.loads(request.body)
    except ValueError, UnicodeError:
        raise ApiError(400, "Некорректные данные") from None


def parse_body(request, model):
    try:
        return model.model_validate(json_body(request))
    except ValidationError:
        raise ApiError(400, "Некорректные данные") from None


def query_integer(request, name, *, minimum, maximum):
    if name not in request.GET:
        return None
    try:
        value = int(request.GET[name])
        if not minimum <= value <= maximum:
            raise ValueError
        return value
    except ValueError:
        raise ApiError(400, "Некорректные параметры") from None


def parse_uuid(value):
    try:
        return UUID(value)
    except ValueError, AttributeError:
        raise ApiError(400, "Некорректный идентификатор") from None


def defer(request, function, *args, **kwargs):
    request.background_tasks.append((function, args, kwargs))


def api_view(function):
    @wraps(function)
    async def view(request, *args, **kwargs):
        try:
            result = await function(request, *args, **kwargs)
            return result if isinstance(result, HttpResponseBase) else JsonResponse(result, safe=False)
        except ApiError as error:
            request.background_tasks.clear()
            return JsonResponse({"error": error.message}, status=error.status)
        except SuspiciousOperation:
            request.background_tasks.clear()
            return JsonResponse({"error": "Некорректный запрос"}, status=400)
        except psycopg.Error as error:
            request.background_tasks.clear()
            logger.error("Ошибка запроса к базе данных: %s", error.sqlstate or "connection")
            if error.sqlstate in ("23505", "23503"):
                message = (
                    "Такая запись уже существует" if error.sqlstate == "23505" else "Запись связана с другими данными"
                )
                return JsonResponse({"error": message}, status=409)
            from club_api.observability.errors import capture

            capture("database_failed")
            return JsonResponse({"error": "Не удалось сохранить или получить данные. Попробуйте позже"}, status=500)
        except Exception:
            request.background_tasks.clear()
            from club_api.observability.errors import capture

            capture("request_failed")
            logger.error("Не удалось обработать запрос")
            return JsonResponse({"error": "Внутренняя ошибка"}, status=500)

    return view


def endpoint(methods):
    async def view(request, **kwargs):
        method = "GET" if request.method == "HEAD" else request.method
        if method not in methods:
            response = JsonResponse({"error": "Метод не поддерживается"}, status=405)
            response.headers["Allow"] = ", ".join(sorted(methods))
            return response
        return await methods[method](request, **kwargs)

    view.methods = tuple(methods)
    return view


def not_found(request, exception=None):
    return JsonResponse({"error": "Страница не найдена"}, status=404)
