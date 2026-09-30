import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const ts = createRequire(new URL('../../package.json', import.meta.url))('typescript');

export function assertNoComments(file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const ranges = new Map();
  function visit(node) {
    for (const range of [...ts.getLeadingCommentRanges(text, node.pos) || [], ...ts.getTrailingCommentRanges(text, node.end) || []]) {
      ranges.set(range.pos, range);
    }
    for (const child of node.getChildren(source)) visit(child);
  }
  visit(source);
  for (const { pos, end } of ranges.values()) {
    if (!/@license|@preserve|Copyright|SPDX-License-Identifier/i.test(text.slice(pos, end))) {
      throw new Error(`Комментарий в скомпилированном пакете: ${file}`);
    }
  }
}

let count = 0;
function visitDirectory(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) visitDirectory(path);
    else if (/\.(?:js|d\.ts)$/.test(entry.name)) {
      assertNoComments(path, readFileSync(path, 'utf8'));
      count++;
    }
  }
}
if (process.argv[2] === '--stdin') {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  for (const line of input.split('\n').filter(Boolean)) {
    const { file, text } = JSON.parse(line);
    assertNoComments(file, text);
    count++;
  }
  if (!count) throw new Error('Не получены файлы рабочего образа');
} else {
  for (const directory of process.argv.slice(2)) visitDirectory(directory);
}
if (count) console.log(`Скомпилированные пакеты: ${count} файлов; комментариев разработчика и ссылок sourcemap нет`);
