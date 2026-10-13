import os
import tempfile
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest import mock

from backend.app.services import attachments, profile_store, application_tracker


def delayed(function):
    def read(*args, **kwargs):
        result = function(*args, **kwargs)
        time.sleep(0.02)
        return result
    return read


class ConcurrentStorageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.env = mock.patch.dict(os.environ, {"JOB_AGENT_DATA_DIR": self.temp.name})
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.temp.cleanup()

    def test_concurrent_capture_preserves_both_updates(self):
        def capture(key):
            return profile_store.apply_capture({"basic": [{"key": key, "value": f"test-{key}"}]})
        with mock.patch.object(profile_store, "load_profile", delayed(profile_store.load_profile)), ThreadPoolExecutor(max_workers=2) as pool:
            list(pool.map(capture, ["email", "nationality"]))
        self.assertEqual(profile_store.load_profile()["basic"], {"email": "test-email", "nationality": {"zh": "test-nationality"}})

    def test_parallel_attachment_uploads_keep_every_record(self):
        def upload(number):
            return attachments.save_attachment(filename=f"{number}.pdf", content=b"test", kind="resume_zh")
        with mock.patch.object(attachments, "list_attachments", delayed(attachments.list_attachments)), ThreadPoolExecutor(max_workers=2) as pool:
            records = list(pool.map(upload, range(2)))
        self.assertEqual({record["id"] for record in attachments.list_attachments()}, {record["id"] for record in records})

    def test_parallel_application_updates_keep_every_record(self):
        def save(number):
            return application_tracker.upsert_application_record(Path(self.temp.name), {"title": str(number), "company": "Test"})
        with mock.patch.object(application_tracker, "load_application_records", delayed(application_tracker.load_application_records)), ThreadPoolExecutor(max_workers=2) as pool:
            records = list(pool.map(save, range(2)))
        self.assertEqual({record["key"] for record in application_tracker.load_application_records(Path(self.temp.name))}, {record["key"] for record in records})
