import asyncio
import importlib.util
import json
import ssl
import subprocess
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "load", Path(__file__).resolve().parents[1] / "diagnostics/measure-load.py"
)
load = importlib.util.module_from_spec(spec)
spec.loader.exec_module(load)


class MeasureTests(unittest.TestCase):
    def config(self, origin):
        return load.load_config(
            {
                "LOAD_SYNTHETIC": "true",
                "LOAD_BASE_URL": origin,
                "LOAD_ENDPOINTS": "ready",
                "LOAD_MAX_REQUESTS": "4",
                "LOAD_DURATION_SECONDS": "2",
                "LOAD_REQUESTS_PER_SECOND": "10",
            }
        )

    def server(self, *, delay=0, reject=False, tls=None):
        calls = []

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                calls.append((self.command, self.path, self.headers.get("authorization")))
                time.sleep(delay)
                self.send_response(429 if reject and len(calls) > 1 else 200)
                self.send_header("content-type", "application/json")
                self.end_headers()
                try:
                    self.wfile.write(b'{"secret":"must-not-leak"}')
                except BrokenPipeError, ConnectionResetError:
                    pass

            def log_message(self, *args):
                pass

        server = ThreadingHTTPServer(("localhost", 0), Handler)
        if tls:
            context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            context.load_cert_chain(*tls)
            server.socket = context.wrap_socket(server.socket, server_side=True)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        return ("https" if tls else "http") + "://localhost:" + str(server.server_port), calls

    def test_rejects_public_and_unbounded_targets(self):
        env = {"LOAD_SYNTHETIC": "true", "LOAD_BASE_URL": "http://localhost:8000"}
        for change in [
            {"LOAD_SYNTHETIC": ""},
            {"LOAD_BASE_URL": "https://example.com"},
            {"LOAD_BASE_URL": "http://secret:token@localhost"},
            {"LOAD_BASE_URL": "http://localhost/api"},
            {"LOAD_BASE_URL": "http://localhost:invalid"},
            {"LOAD_ENDPOINTS": "auth"},
            {"LOAD_ENDPOINTS": "__proto__"},
            {"LOAD_REQUESTS_PER_SECOND": "100"},
            {"LOAD_DURATION_SECONDS": "301"},
            {"LOAD_CONCURRENCY": "9"},
            {"LOAD_MAX_REQUESTS": "3001"},
            {"PYTHONHTTPSVERIFY": "0"},
        ]:
            with self.subTest(change=change), self.assertRaises(ValueError):
                load.load_config({**env, **change})

    def test_budget_get_only_and_no_response_contents(self):
        origin, calls = self.server(delay=0.25)
        report = asyncio.run(load.measure(self.config(origin)))
        self.assertEqual(len(calls), 4)
        self.assertTrue(all(row == ("GET", "/api/ready", None) for row in calls))
        self.assertEqual((report["totalRequests"], report["sent"], report["successful"]), (4, 3, 3))
        self.assertEqual(report["stopReason"], "max_requests")
        self.assertNotIn("must-not-leak", json.dumps(report))
        self.assertGreaterEqual(report["latency"]["p95Ms"], 200)

    def test_first_429_stops_requests(self):
        origin, calls = self.server(reject=True)
        report = asyncio.run(load.measure(self.config(origin)))
        self.assertEqual(len(calls), 2)
        self.assertEqual(report["stopReason"], "rate_limited")
        self.assertEqual(report["codes"], {"429": 1})

    def test_entire_response_deadline(self):
        origin, _ = self.server(delay=0.5)
        report = asyncio.run(load.measure({**self.config(origin), "timeoutMs": 100}))
        self.assertEqual(report["stopReason"], "warmup_failed")
        self.assertEqual(report["sent"], 0)
        self.assertEqual(report["warmup"][0]["code"], "TIMEOUT")

    def test_ca_is_required_for_local_tls(self):
        with tempfile.TemporaryDirectory(prefix="club-load-tls-") as directory:
            root = Path(directory)
            config = root / "openssl.cnf"
            cert = root / "cert.pem"
            key = root / "key.pem"
            config.write_text(
                "[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=ext\n[dn]\nCN=localhost\n[ext]\nsubjectAltName=DNS:localhost\nbasicConstraints=critical,CA:true\nkeyUsage=critical,digitalSignature,keyEncipherment,keyCertSign\nextendedKeyUsage=serverAuth\n"
            )
            subprocess.run(
                [
                    "openssl",
                    "req",
                    "-x509",
                    "-newkey",
                    "rsa:2048",
                    "-nodes",
                    "-days",
                    "1",
                    "-config",
                    str(config),
                    "-keyout",
                    str(key),
                    "-out",
                    str(cert),
                ],
                check=True,
                capture_output=True,
            )
            origin, _ = self.server(tls=(str(cert), str(key)))
            untrusted = asyncio.run(load.measure(self.config(origin)))
            self.assertEqual(untrusted["stopReason"], "warmup_failed")
            self.assertEqual(untrusted["sent"], 0)
            trusted = asyncio.run(load.measure({**self.config(origin), "caFile": str(cert)}))
            self.assertEqual(trusted["successful"], 3)
            self.assertEqual(trusted["tlsVerification"], "provided-ca")


if __name__ == "__main__":
    unittest.main()
