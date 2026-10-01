#!/usr/bin/env bash
set -euo pipefail
[[ "$#" == 3 ]] || { echo 'Использование: checks/check-runtime-images.sh API_IMAGE BOOTSTRAP_IMAGE WEB_IMAGE' >&2; exit 1; }
CHECK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
images=("$1" "$2" "$3")
modes=(api bootstrap web)
for index in 0 1 2; do
  docker run --rm -i --network none --read-only --cap-drop ALL \
    --security-opt no-new-privileges --entrypoint python "${images[$index]}" - "${modes[$index]}" < "$CHECK_DIR/runtime-image.py"
done
