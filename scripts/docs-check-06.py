#!/usr/bin/env python3
"""Documentation regression checks for the verified task-06 contracts.

Run normally against this checkout, or with --ref COMMIT against an older tree.
These check documented contracts, not application runtime behavior.
"""
import argparse
import json
from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--ref", help="Read documentation from this Git revision")
args = parser.parse_args()
manifest = json.loads((ROOT / "scripts/docs-check-06-contracts.json").read_text())


def normalize(text):
    return " ".join(text.split())


class DocumentationContracts(unittest.TestCase):
    pass


def contract_test(contract):
    def test(self):
        for assertion in contract["assertions"]:
            path = assertion["path"]
            if args.ref:
                content = subprocess.check_output(
                    ["git", "show", f"{args.ref}:{path}"], cwd=ROOT, text=True
                )
            else:
                content = (ROOT / path).read_text()
            present = assertion["text"] in normalize(content)
            self.assertEqual(
                present, assertion["op"] == "contains",
                f"{contract['id']}: {path}: {assertion['op']} {assertion['text']}",
            )
    return test


for contract in manifest["checks"]:
    setattr(DocumentationContracts, "test_" + contract["id"], contract_test(contract))

if __name__ == "__main__":
    unittest.main(argv=[__file__])
