import ipaddress

import httpx

PROXY_NETWORKS = tuple(ipaddress.ip_network(value) for value in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"))


class ApiFailure(Exception):
    def __init__(self, status, message):
        self.status, self.message = status, message
        super().__init__(message)


class Api:
    def __init__(self, client, headers=None):
        self.client = client
        self.headers = headers or {}

    async def get(self, path):
        try:
            response = await self.client.get(path, headers=self.headers)
        except httpx.HTTPError as error:
            raise ApiFailure(503, "Не удалось загрузить данные. Попробуйте позже.") from error
        if not response.is_success:
            try:
                message = response.json().get("error")
            except ValueError:
                message = None
            raise ApiFailure(response.status_code, message or "Не удалось загрузить данные. Попробуйте позже.")
        try:
            return response.json()
        except ValueError as error:
            raise ApiFailure(502, "Не удалось загрузить данные. Попробуйте позже.") from error


def forwarded_headers(request):
    allowed = ("authorization", "x-cart-session", "x-support-key")
    headers = {key: request.headers[key] for key in allowed if request.headers.get(key)}
    try:
        peer = ipaddress.ip_address(request.META.get("REMOTE_ADDR", "").removeprefix("::ffff:"))
        candidate = request.headers.get("x-forwarded-for", "").split(",")[-1].strip()
        if peer.version == 4 and any(peer in network for network in PROXY_NETWORKS) and candidate:
            peer = ipaddress.ip_address(candidate)
        headers["x-forwarded-for"] = str(peer)
    except ValueError, AttributeError:
        pass
    return headers
