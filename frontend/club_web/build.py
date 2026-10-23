import argparse
import hashlib
import json
import re
import shutil
from pathlib import Path

from club_web.offline import PWA_PARAMS

ROOT = Path(__file__).parent


def version_assets(assets, names):
    for name in names:
        file = Path(name)
        for previous in assets.glob(file.stem + "-*" + file.suffix):
            if re.fullmatch(re.escape(file.stem) + r"-[a-f0-9]{16}" + re.escape(file.suffix), previous.name):
                previous.unlink()
    digest = hashlib.sha256()
    for name in sorted(names):
        content = (assets / name).read_bytes()
        digest.update(name.encode() + b"\0" + len(content).to_bytes(8, "big") + content)
    version = digest.hexdigest()[:16]
    manifest = {name: f"{Path(name).stem}-{version}{Path(name).suffix}" for name in names}
    for name, target in manifest.items():
        content = (assets / name).read_text(encoding="utf-8")
        if name.endswith(".js"):
            for dependency, replacement in manifest.items():
                for quote in ('"', "'"):
                    content = content.replace(quote + "./" + dependency + quote, quote + "./" + replacement + quote)
        (assets / target).write_text(content, encoding="utf-8")
    (assets / "manifest.json").write_text(json.dumps(manifest, sort_keys=True) + "\n", encoding="utf-8")


def responsive_css(css):
    additions = []
    for match in re.finditer(r"@media\s*\(max-width:\s*(\d+)px\)\s*\{", css):
        depth, end = 1, match.end()
        while depth and end < len(css):
            depth += (css[end] == "{") - (css[end] == "}")
            end += 1
        if not depth:
            additions.append(f"@container club-layout (max-width:{match[1]}px){{" + css[match.end() : end])
    return css + "\n" + "\n".join(additions)


def write_worker(destination, worker, files):
    digest = hashlib.sha256(worker.encode())
    for path in sorted(files, key=lambda path: path.relative_to(destination).as_posix()):
        content = path.read_bytes()
        digest.update(path.relative_to(destination).as_posix().encode() + b"\0")
        digest.update(len(content).to_bytes(8, "big"))
        digest.update(content)
    worker = re.sub(
        r"const CACHE = `\$\{CACHE_PREFIX\}[^`]*`;",
        "const CACHE = `${CACHE_PREFIX}" + digest.hexdigest()[:16] + "`;",
        worker,
    )
    (destination / "sw.js").write_text(worker, encoding="utf-8")


def build_public(destination, *, mirror=False):
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=True)
    source = ROOT.parent / "public"
    if not source.exists():
        source = Path("/repo/frontend/public")
    if source != destination:
        shutil.copytree(source, destination, dirs_exist_ok=True)
    assets = destination / "assets"
    assets.mkdir(exist_ok=True)
    if not mirror:
        for demo_file in assets.glob("mirror*.js"):
            demo_file.unlink()
    styles = ROOT / "styles"
    files = [
        styles / "tokens.css",
        styles / "index.css",
        *sorted(
            path
            for path in styles.glob("*.css")
            if path.name not in ("tokens.css", "index.css") and not path.name.startswith(".")
        ),
    ]
    (assets / "site.css").write_text(
        "\n".join(responsive_css(path.read_text(encoding="utf-8")) for path in files), encoding="utf-8"
    )
    browser_names = []
    for browser_file in (ROOT / "browser").glob("*.js"):
        if (
            browser_file.name.startswith(".")
            or browser_file.name == "service-worker.js"
            or browser_file.name.startswith("mirror")
            and not mirror
        ):
            continue
        shutil.copyfile(browser_file, assets / browser_file.name)
        browser_names.append(browser_file.name)
    version_assets(assets, ["site.css", *browser_names])
    worker = (ROOT / "browser/service-worker.js").read_text(encoding="utf-8")
    files = ["./assets/" + path.name for path in sorted(assets.iterdir()) if path.suffix in (".js", ".css")]
    files += [
        *["./fonts/" + path.name for path in sorted((destination / "fonts").glob("*.woff2"))],
    ]
    worker = worker.replace("const BUILT_ASSETS = [];", "const BUILT_ASSETS = " + json.dumps(files) + ";")
    worker = worker.replace("const PWA_PARAMS = {};", "const PWA_PARAMS = " + json.dumps(PWA_PARAMS) + ";")
    static_files = [path for path in destination.iterdir() if path.is_file() and path.name != "sw.js"]
    for directory in (assets, destination / "fonts"):
        static_files.extend(path for path in directory.rglob("*") if path.is_file())
    write_worker(destination, worker, static_files)


def run():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default=str(ROOT.parent / "public"))
    args = parser.parse_args()
    build_public(args.output)


if __name__ == "__main__":
    run()
