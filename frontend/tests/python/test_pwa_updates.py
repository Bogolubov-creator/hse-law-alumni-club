import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

import pytest
from playwright.sync_api import expect
from test_browser import chromium as chromium
from test_build import build_source as build_source

from club_web import build
from club_web.rendering import asset_manifest


@pytest.mark.parametrize("width", [390, 1440])
def test_new_page_uses_current_modules_and_styles_under_previous_worker(build_source, tmp_path, chromium, width):
    browser = build.ROOT / "browser"
    (browser / "site.js").write_text(
        'import { release } from "./dependency.js";'
        "document.documentElement.dataset.release = release;"
        "document.querySelector('button').disabled = false;"
        "navigator.serviceWorker.register('/sw.js');"
    )
    releases = {}
    for release, color in (("old", "rgb(0, 0, 255)"), ("new", "rgb(255, 0, 0)")):
        (browser / "dependency.js").write_text(f'export const release = "{release}";')
        (build.ROOT / "styles/index.css").write_text(f"button {{ color: {color}; }}")
        root = tmp_path / release
        build.build_public(root)
        assets = asset_manifest(root)
        entry, style = ("site.js", "site.css") if release == "old" else (assets["site.js"], assets["site.css"])
        (root / "index.html").write_text(
            f'<html><head><meta charset="utf-8"><link rel="stylesheet" href="/assets/{style}">'
            f'<script type="module" src="/assets/{entry}"></script></head>'
            "<body><button disabled>Сохранить</button></body></html>"
        )
        releases[release] = root
    state = {"page": "old", "worker": "old"}

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(releases[state["page"]]), **kwargs)

        def do_GET(self):
            if self.path == "/":
                del self.headers["If-Modified-Since"]
            if self.path == "/sw.js":
                body = (releases[state["worker"]] / "sw.js").read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "text/javascript")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            else:
                super().do_GET()

        def end_headers(self):
            self.send_header("Cache-Control", "no-cache")
            if self.path == "/":
                self.send_header("X-Club-Offline", "public")
            super().end_headers()

        def log_message(self, *_args):
            pass

    with ThreadingHTTPServer(("127.0.0.1", 0), Handler) as server:
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        context = chromium.new_context(viewport={"width": width, "height": 900})
        try:
            page = context.new_page()
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(f"http://127.0.0.1:{server.server_port}/")
            page.wait_for_function("navigator.serviceWorker.controller")
            expect(page.locator("html")).to_have_attribute("data-release", "old")
            expect(page.get_by_role("button", name="Сохранить")).to_have_css("color", "rgb(0, 0, 255)")
            state["page"] = "new"
            page.reload()
            expect(page.locator("html")).to_have_attribute("data-release", "new")
            expect(page.get_by_role("button", name="Сохранить")).to_be_enabled()
            expect(page.get_by_role("button", name="Сохранить")).to_have_css("color", "rgb(255, 0, 0)")
            state["worker"] = "new"
            page.evaluate("""async () => {
                const registration = await navigator.serviceWorker.ready;
                const changed = new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, {once:true}));
                await registration.update();
                await changed;
            }""")
            context.set_offline(True)
            page.reload()
            expect(page.locator("html")).to_have_attribute("data-release", "new")
            expect(page.get_by_role("button", name="Сохранить")).to_be_enabled()
            expect(page.get_by_role("button", name="Сохранить")).to_have_css("color", "rgb(255, 0, 0)")
            assert not errors
        finally:
            context.close()
            server.shutdown()
            thread.join(timeout=5)
