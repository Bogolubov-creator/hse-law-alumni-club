#!/usr/bin/env bash
# Проверяется содержимое финальных образов, без сети, записи и запуска приложения.
set -euo pipefail
[[ "$#" == 3 ]] || { echo 'Использование: checks/check-runtime-images.sh API_IMAGE BOOTSTRAP_IMAGE WEB_IMAGE' >&2; exit 1; }
for image in "$1" "$2"; do
  mode=bootstrap
  if [[ "$image" == "$1" ]]; then mode=api; fi
  docker run --rm -i --network none --read-only --cap-drop ALL \
    --security-opt no-new-privileges --entrypoint node "$image" --input-type=module - "$mode" <<'JS'
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const roots = ['/app', '/app/node_modules/@club/shared', '/app/node_modules/@club/server-auth'];
function checkDist(path) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const file = join(path, entry.name);
    if (entry.isDirectory()) { checkDist(file); continue; }
    if (!/\.(?:js|d\.ts)$/.test(entry.name) || /\.(?:test|spec)\./.test(entry.name)) throw new Error(`Лишний runtime-файл: ${file}`);
  }
}
for (const root of roots) {
  for (const entry of readdirSync(root)) {
    if (!['dist', 'node_modules', 'package.json', 'LICENSE', 'LICENSE.md', 'README.md'].includes(entry)) throw new Error(`Лишний файл пакета: ${root}/${entry}`);
  }
  checkDist(join(root, 'dist'));
}
if (process.argv[2] === 'api') {
  for (const file of ['seeds.js', 'dpo-mirror-catalog.generated.js']) {
    if (existsSync(`/app/node_modules/@club/shared/dist/${file}`)) throw new Error(`Каталог деморежима в API: ${file}`);
  }
}
const store = '/app/node_modules/.pnpm';
for (const metadata of ['/app/node_modules/.modules.yaml', '/app/node_modules/.pnpm-workspace-state-v1.json', `${store}/lock.yaml`]) {
  if (existsSync(metadata)) throw new Error(`Метаданные установки в runtime: ${metadata}`);
}
if (existsSync(store)) {
  for (const name of readdirSync(store)) {
    if (/^(?:vitest@|@vitest\+|typescript@|tsx@|eslint@|@eslint\+|@playwright\+|@directus\+sdk@)/.test(name)) throw new Error(`Dev/CMS dependency: ${name}`);
  }
}
for (const binary of ['/usr/local/bin/npm', '/usr/local/bin/corepack', '/usr/local/bin/yarn']) {
  if (existsSync(binary)) throw new Error(`Менеджер пакетов в runtime: ${binary}`);
}
console.log('Node runtime: только скомпилированные собственные модули и рабочие зависимости');
JS
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
