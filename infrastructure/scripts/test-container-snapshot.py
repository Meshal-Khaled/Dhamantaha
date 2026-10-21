import importlib.util
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("collector", Path(__file__).with_name("container-snapshot.py"))
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)

class SnapshotTests(unittest.TestCase):
    def test_credentials_and_payloads_never_exported(self):
        raw = json.dumps({"event": "provider_attempt", "key": "key 2", "ok": True, "apiKey": "private-value", "text": "customer receipt", "category": "AIzaPRIVATE"})
        events, omitted = collector.safe_logs(raw + "\nBearer private-value")
        self.assertEqual(events, [{"event": "provider_attempt", "key": "key 2", "ok": True}])
        self.assertEqual(omitted, 1)

    def test_mount_assignment_exports_only_file_labels(self):
        info = {"Name": "/test", "Config": {"Env": ["PASSWORD=secret"]}, "Mounts": [{"Source": "/private/gemini.2.key", "Destination": "/run/secrets/gemini_api_key_2"}]}
        row = collector.container_summary(info, "")
        self.assertEqual(row["keyAssignments"], ["gemini.2.key"])
        self.assertNotIn("secret", json.dumps(row))

if __name__ == "__main__":
    unittest.main()
