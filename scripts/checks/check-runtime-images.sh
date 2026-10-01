#!/usr/bin/env bash
set -euo pipefail
[[ "$#" == 3 ]] || { echo 'Использование: checks/check-runtime-images.sh API_IMAGE BOOTSTRAP_IMAGE WEB_IMAGE' >&2; exit 1; }
for image in "$1" "$2"; do
  mode=bootstrap
  if [[ "$image" == "$1" ]]; then mode=api; fi
  docker run --rm -i --network none --read-only --cap-drop ALL \
    --security-opt no-new-privileges --entrypoint python "$image" - "$mode" <<'PYTHON'
import importlib.util
import pathlib
import sys
root = pathlib.Path('/opt/venv/lib/python3.14/site-packages')
packages = ['club_api'] if sys.argv[1] == 'api' else ['club_api', 'club_ops']
for name in packages:
    package = root / name
    assert (package / '__init__.pyc').is_file(), name
    for path in package.rglob('*'):
        if path.is_file():
            assert path.suffix in ('.pyc', '.json'), str(path)
            assert not any(part in ('tests', '__pycache__', '.venv') for part in path.parts), str(path)
if sys.argv[1] == 'api':
    assert not (root / 'club_ops').exists()
    assert not list((root / 'club_api').rglob('*catalog*.json'))
    assert not list((root / 'club_api').rglob('*demo*.json'))
for module in ('pytest', 'ruff', 'pip_audit'):
    assert importlib.util.find_spec(module) is None, module
for binary in ('node', 'npm', 'pnpm', 'uv', 'pip', 'pip3'):
    import shutil
    assert shutil.which(binary) is None, binary
assert not list(pathlib.Path('/app').rglob('*'))
print('Python runtime: собственные модули скомпилированы; тестов, исходников и инструментов сборки нет')
PYTHON
 done
 docker run --rm --network none --read-only --cap-drop ALL \
   --security-opt no-new-privileges --entrypoint sh "$3" -euc '
   test -f /srv/index.html
   unwanted="$(find /srv -type f \( -name "*.map" -o -name "*.ts" -o -name "*.tsx" -o -name "*.test.*" -o -name "*.spec.*" -o -name ".env*" -o -name "mirror-*" \))"
   test -z "$unwanted" || { echo "Лишние файлы web: $unwanted" >&2; exit 1; }
   if grep -r -l -E "club:mirror-podcast-demo|mirror-alumni|mirror-admin" /srv/assets; then
     echo "Деморежим попал в web runtime" >&2; exit 1
   fi
   echo "Web runtime: только публичная статика; исходников, тестов и демоперехватчика нет"
   '
