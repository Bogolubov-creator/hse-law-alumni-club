// Обычная сборка не должна содержать демо-перехватчик, токены и файлы разработки.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
const root = process.argv[2];
if (!root) throw new Error('Укажите каталог обычной сборки web');
const forbidden = ['club:mirror-podcast-demo', 'mirror-alumni', 'mirror-admin', 'Локальный стенд · тестовые участники'];
const failures = [];
let count = 0;
function visit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) { visit(path); continue; }
    count++;
    if (/\.(?:map|tsx?)$/.test(entry.name) || /(?:\.test\.|\.spec\.|^\.env|^mirror-)/.test(entry.name)) failures.push(relative(root, path));
    if (/\.(?:js|html)$/.test(entry.name)) {
      const code = readFileSync(path, 'utf8');
      if (forbidden.some(value => code.includes(value))) failures.push(relative(root, path));
    }
  }
}
visit(root);
if (failures.length) {
  console.error('В обычной сборке найдены файлы разработки или деморежима:', [...new Set(failures)].join(', '));
  process.exitCode = 1;
} else console.log(`Web: ${count} файлов, файлов разработки и демоперехватчика нет`);
