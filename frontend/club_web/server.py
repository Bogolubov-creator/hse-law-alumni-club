from gunicorn.app.base import BaseApplication


class Server(BaseApplication):
    def __init__(self, factory, host, port):
        self.factory, self.host, self.port = factory, host, port
        super().__init__()

    def load_config(self):
        host = f"[{self.host}]" if ":" in self.host else self.host
        for name, value in {
            "bind": f"{host}:{self.port}",
            "worker_class": "asgi",
            "workers": 3,
            "asgi_lifespan": "on",
            "forwarded_allow_ips": "",
            "secure_scheme_headers": {},
            "proxy_protocol": "off",
            "control_socket_disable": True,
            "accesslog": None,
            "graceful_timeout": 30,
            "timeout": 60,
            "keepalive": 0,
        }.items():
            self.cfg.set(name, value)

    def load(self):
        return self.factory()
