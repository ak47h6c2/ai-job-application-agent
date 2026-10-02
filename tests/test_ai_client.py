import unittest

from backend.app.services.ai_client import AIError, extract_json


class ExtractJsonTests(unittest.TestCase):
    def test_reads_fenced_json(self) -> None:
        self.assertEqual(extract_json('Sure:\n```json\n{"a": 1}\n```'), {"a": 1})

    def test_reads_bare_array(self) -> None:
        self.assertEqual(extract_json('[{"index": 0, "key": null}] done'), [{"index": 0, "key": None}])

    def test_rejects_non_json(self) -> None:
        with self.assertRaises(AIError):
            extract_json("no json here")


if __name__ == "__main__":
    unittest.main()
