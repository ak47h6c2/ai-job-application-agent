import unittest
from unittest import mock

import httpx

from backend.app.services.ai_client import AIError, _openai_chat, extract_json


class ExtractJsonTests(unittest.TestCase):
    def test_reads_fenced_json(self) -> None:
        self.assertEqual(extract_json('Sure:\n```json\n{"a": 1}\n```'), {"a": 1})

    def test_reads_bare_array(self) -> None:
        self.assertEqual(extract_json('[{"index": 0, "key": null}] done'), [{"index": 0, "key": None}])

    def test_rejects_non_json(self) -> None:
        with self.assertRaises(AIError):
            extract_json("no json here")


class OpenAIChatTests(unittest.TestCase):
    SETTINGS = {"provider": "openai", "base_url": "https://api.openai.com/v1", "model": "new-model", "api_key": "sk-test"}

    def test_retries_with_max_completion_tokens_for_newer_models(self) -> None:
        rejected = httpx.Response(400, json={"error": {"message": "Unsupported parameter: 'max_tokens'. Use 'max_completion_tokens' instead."}})
        accepted = httpx.Response(200, json={"choices": [{"message": {"content": "OK"}}]})
        with mock.patch("backend.app.services.ai_client.httpx.post", side_effect=[rejected, accepted]) as post:
            self.assertEqual(_openai_chat(self.SETTINGS, "sys", "hi", 10), "OK")
        retry_body = post.call_args_list[1].kwargs["json"]
        self.assertNotIn("max_tokens", retry_body)
        self.assertNotIn("temperature", retry_body)
        self.assertEqual(retry_body["max_completion_tokens"], 40)
        self.assertEqual(post.call_args_list[0].args[0], "https://api.openai.com/v1/chat/completions")

    def test_other_errors_are_reported(self) -> None:
        with mock.patch("backend.app.services.ai_client.httpx.post", return_value=httpx.Response(401, text="invalid api key")):
            with self.assertRaisesRegex(AIError, "401"):
                _openai_chat(self.SETTINGS, "sys", "hi", 10)


if __name__ == "__main__":
    unittest.main()
