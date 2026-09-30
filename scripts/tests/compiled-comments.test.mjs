import { test } from 'node:test';
import { throws, doesNotThrow } from 'node:assert/strict';
import { assertNoComments } from '../checks/check-compiled-comments.mjs';

test('отклоняет комментарии перед модулем, после выражения и внутри него', () => {
  for (const code of ['/** example */\nexport const value=1;', 'export const value=1; // example', 'const value=/** example */1;']) {
    throws(() => assertNoComments('fixture.js', code), /Комментарий/);
  }
});

test('сохраняет лицензии и не принимает строки, URL и regex за комментарии', () => {
  for (const code of ['const value="https://example.com/ /* text */";', '/** @license Example */\nconst value=1;',
                     'const matcher=/\\/\\/|\\/\\*/;', 'const value=`text /* text */`;']) {
    doesNotThrow(() => assertNoComments('fixture.js', code));
  }
});
