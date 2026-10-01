import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "comments", Path(__file__).resolve().parents[1] / "checks/check-comments.py"
)
comments = importlib.util.module_from_spec(spec)
spec.loader.exec_module(comments)


class CommentTests(unittest.TestCase):
    def test_javascript_comments_are_detected(self):
        for code in [
            "/** example */\nexport const value=1;",
            "export const value=1; // example",
            "const value=/** example */1;",
        ]:
            self.assertTrue(comments.javascript_failures(code))

    def test_licenses_strings_and_regex_are_preserved(self):
        for code in [
            'const value="https://example.com/ /* text */";',
            "/** @license Example */\nconst value=1;",
            "const matcher=/\\/\\/|\\/\\*/;",
            "const value=`text /* text */`;",
        ]:
            self.assertEqual(comments.javascript_failures(code), [])

    def test_python_comments_and_docstrings(self):
        for code in ["# text\nvalue=1", '"""text"""\nvalue=1', 'def run():\n    """text"""\n    return 1']:
            self.assertTrue(comments.python_failures(code))
        self.assertEqual(comments.python_failures('value="# text"'), [])
        self.assertEqual(comments.python_failures("#!/usr/bin/env python3\nvalue=1"), [])


if __name__ == "__main__":
    unittest.main()
