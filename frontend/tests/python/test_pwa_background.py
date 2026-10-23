import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import httpx
import pytest
from playwright.sync_api import expect, sync_playwright
from test_browser import mirror_site as mirror_site
from test_browser import site as site
from test_mobile_shell import test_mirror_pwa_starts_offline_without_caching_private_sections as check_mirror_offline


def test_public_page_is_saved_during_webkit_navigation(site):
    navigation_started, release, saved = (threading.Event() for _ in range(3))

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path == "/held-navigation":
                navigation_started.set()
                release.wait(timeout=10)
                body = b"<!doctype html><title>Replacement</title><main>Replacement</main>"
                self.send_response(200)
                self.send_header("Content-Type", "text/html")
            else:
                if self.headers.get("x-club-save-page") == "1":
                    saved.set()
                response = httpx.get(site[0] + self.path, timeout=10)
                body = response.content
                self.send_response(response.status_code)
                self.send_header("Content-Type", response.headers.get("content-type", "text/plain"))
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_args):
            pass

    with ThreadingHTTPServer(("127.0.0.1", 0), Handler) as server:
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        with sync_playwright() as playwright:
            browser = playwright.webkit.launch()
            context = browser.new_context()
            context.add_init_script("""localStorage.setItem('club_cookie_consent','essential');
                Object.defineProperty(navigator,'serviceWorker',{value:{
                    controller:{}, addEventListener(){}, register(){return new Promise(()=>{});}
                }});""")
            page = context.new_page()
            try:
                origin = f"http://127.0.0.1:{server.server_port}"
                page.goto(origin + "/news/news-one")
                expect(page.get_by_role("button", name="Сохранить", exact=True)).to_be_enabled()
                previous = page.evaluate_handle("window")
                page.evaluate("location.href='/held-navigation'")
                assert navigation_started.wait(timeout=5)
                previous.evaluate("() => window.dispatchEvent(new Event('online'))")
                assert saved.wait(timeout=5), "Фоновый запрос не дошёл до сервера после начала перехода"
            finally:
                release.set()
                page.wait_for_url("**/held-navigation")
                context.close()
                browser.close()
                server.shutdown()
                thread.join(timeout=5)


@pytest.mark.parametrize("width", [390, 1440])
def test_webkit_mirror_starts_offline_without_caching_private_sections(mirror_site, width):
    with sync_playwright() as playwright:
        browser = playwright.webkit.launch()
        try:
            check_mirror_offline(browser, mirror_site, width)
        finally:
            browser.close()
