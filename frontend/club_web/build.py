import argparse
import hashlib
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).parent


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
        (assets / "mirror.js").unlink(missing_ok=True)
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
    for browser_file in (ROOT / "browser").glob("*.js"):
        if (
            browser_file.name.startswith(".")
            or browser_file.name == "service-worker.js"
            or browser_file.name == "mirror.js"
            and not mirror
        ):
            continue
        shutil.copyfile(browser_file, assets / browser_file.name)
    worker = (ROOT / "browser/service-worker.js").read_text(encoding="utf-8")
    digest = hashlib.sha256(worker.encode() + (assets / "site.css").read_bytes())
    for browser_file in sorted((ROOT / "browser").glob("*.js")):
        digest.update(browser_file.read_bytes())
    worker = re.sub(
        r"const CACHE = `\$\{CACHE_PREFIX\}[^`]*`;",
        "const CACHE = `${CACHE_PREFIX}" + digest.hexdigest()[:16] + "`;",
        worker,
    )
    (destination / "sw.js").write_text(worker, encoding="utf-8")


def run():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default=str(ROOT.parent / "public"))
    args = parser.parse_args()
    build_public(args.output)


if __name__ == "__main__":
    run()
