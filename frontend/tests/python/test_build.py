import re
from pathlib import Path

import pytest

from club_web import build
from club_web.rendering import asset_manifest


@pytest.fixture
def build_source(tmp_path, monkeypatch):
    root = tmp_path / "frontend" / "club_web"
    public = root.parent / "public"
    (root / "styles").mkdir(parents=True)
    (root / "browser").mkdir()
    (root / "styles" / "tokens.css").write_text(":root { --color: blue; }")
    (root / "styles" / "index.css").write_text("body { color: var(--color); }")
    worker = (Path(build.ROOT) / "browser" / "service-worker.js").read_text()
    (root / "browser" / "service-worker.js").write_text(worker)
    (root / "browser" / "site.js").write_text("export const version = 1;")
    for name in (
        "assets/photos/nested/image.webp",
        "fonts/font.woff2",
        "fonts/fonts.css",
        "offline.html",
        "manifest.webmanifest",
        "icon-192.png",
    ):
        path = public / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"original")
    monkeypatch.setattr(build, "ROOT", root)
    return public


@pytest.mark.parametrize(
    "asset",
    [
        "assets/photos/nested/image.webp",
        "fonts/font.woff2",
        "fonts/fonts.css",
        "offline.html",
        "manifest.webmanifest",
        "icon-192.png",
    ],
)
def test_static_content_change_updates_worker_version(build_source, tmp_path, asset):
    destination = tmp_path / "output"
    build.build_public(destination)
    original_worker = (destination / "sw.js").read_bytes()
    original_version = re.search(rb"const CACHE = `\$\{CACHE_PREFIX\}([a-f0-9]+)`;", original_worker)[1]
    build.build_public(destination)
    assert (destination / "sw.js").read_bytes() == original_worker

    (build_source / asset).write_bytes(b"replacement at the same URL")
    build.build_public(destination)
    changed_worker = (destination / "sw.js").read_bytes()
    changed_version = re.search(rb"const CACHE = `\$\{CACHE_PREFIX\}([a-f0-9]+)`;", changed_worker)[1]
    assert changed_version != original_version
    build.build_public(destination)
    assert (destination / "sw.js").read_bytes() == changed_worker

    other_destination = tmp_path / "other-output"
    build.build_public(other_destination)
    assert (other_destination / "sw.js").read_bytes() == changed_worker


def test_demo_cart_module_is_only_in_mirror_build(build_source, tmp_path):
    browser = build.ROOT / "browser"
    for name in ("mirror.js", "mirror-cart.js", "cart.js"):
        (browser / name).write_text("export const value = 1;")
    destination = tmp_path / "output"
    build.build_public(destination, mirror=True)
    assert (destination / "assets/mirror-cart.js").is_file()
    build.build_public(destination)
    assert not (destination / "assets/mirror.js").exists()
    assert not (destination / "assets/mirror-cart.js").exists()
    assert (destination / "assets/cart.js").is_file()
    assert not any(name.startswith("mirror") for name in asset_manifest(destination))
    assert not list((destination / "assets").glob("mirror*.js"))


def test_dependency_and_styles_are_linked_to_the_same_release(build_source, tmp_path):
    browser = build.ROOT / "browser"
    (browser / "site.js").write_text('import { value } from "./dependency.js"; document.title = value;')
    (browser / "dependency.js").write_text('export const value = "old";')
    destination = tmp_path / "output"
    build.build_public(destination)
    original = asset_manifest(destination)
    assert original["dependency.js"] in (destination / "assets" / original["site.js"]).read_text()
    assert original["site.css"] in (destination / "sw.js").read_text()
    assert original["site.js"] in (destination / "sw.js").read_text()
    build.build_public(destination)
    assert asset_manifest(destination) == original

    (browser / "dependency.js").write_text('export const value = "new";')
    build.build_public(destination)
    current = asset_manifest(destination)
    assert all(current[name] != previous for name, previous in original.items())
    assert current["dependency.js"] in (destination / "assets" / current["site.js"]).read_text()
    assert original["dependency.js"] not in (destination / "assets" / current["site.js"]).read_text()
    assert not (destination / "assets" / original["site.js"]).exists()
