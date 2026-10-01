import sys
from pathlib import Path


def check(root):
    failures, count = [], 0
    forbidden = ("club:mirror-podcast-demo", "mirror-alumni", "mirror-admin", "Локальный стенд · тестовые участники")
    for path in Path(root).rglob("*"):
        if not path.is_file():
            continue
        count += 1
        if (
            path.suffix in (".map", ".ts", ".tsx")
            or any(word in path.name for word in (".test.", ".spec."))
            or path.name == "mirror.js"
            or path.name.startswith((".env", "mirror-"))
        ):
            failures.append(str(path))
        if path.suffix in (".html", ".js") and any(word in path.read_text() for word in forbidden):
            failures.append(str(path))
    if failures:
        raise ValueError("Лишние файлы web: " + ", ".join(failures))
    print(f"Web: {count} файлов, файлов разработки и демоперехватчика нет")


if __name__ == "__main__":
    check(sys.argv[1])
