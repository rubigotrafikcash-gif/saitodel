"""Release-contract tests; no network, model calls, or installed dependencies."""
import importlib.util
import json
import shutil
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("package_release", ROOT / "scripts/package_release.py")
package = importlib.util.module_from_spec(spec)
spec.loader.exec_module(package)


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        temp_root = ROOT / ".test-tmp"
        self.assertFalse(temp_root.is_symlink())
        temp_root.mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(prefix="saitodel-test-", dir=temp_root)
        self.assertTrue(Path(self.temp.name).resolve().is_relative_to(temp_root.resolve()))
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name).resolve()
        self.source = self.base / "source"
        for name in (*package.SKILL_FILES, "packaging/plugin.json"):
            target = self.source / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / name, target)

    def edit_manifest(self, change):
        path = self.source / "packaging/plugin.json"
        value = json.loads(path.read_text(encoding="utf-8"))
        change(value)
        path.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")

    def test_reproducible_roundtrip_and_exact_inventory(self):
        first = package.build(self.source, self.base / "first")
        second = package.build(self.source, self.base / "second")
        self.assertEqual(first, second)
        for filename in first["archives"]:
            self.assertEqual((self.base / "first" / filename).read_bytes(),
                             (self.base / "second" / filename).read_bytes())
        _, version, _, payloads = package.payloads(self.source)
        self.assertEqual(version, "0.2.0")
        self.assertEqual(len(payloads[f"saitodel-skill-{version}.zip"]), 10)
        self.assertEqual(len(payloads[f"saitodel-plugin-{version}.zip"]), 11)
        regulation = (self.source / "references/multi-agent-regulation.md").read_bytes()
        with zipfile.ZipFile(self.base / "first" / f"saitodel-plugin-{version}.zip") as z:
            self.assertEqual(z.read("saitodel/skills/saitodel/references/multi-agent-regulation.md"),
                             regulation)

    def test_unrelated_files_never_enter_packages(self):
        for name in (".env", "docs/internal.md", "references/unapproved.md"):
            p = self.source / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text("DO_NOT_PACKAGE", encoding="utf-8")
        _, _, _, payloads = package.payloads(self.source)
        self.assertFalse(any(b"DO_NOT_PACKAGE" in d for a in payloads.values() for d in a.values()))

    def test_crlf_and_lf_have_identical_payloads(self):
        before = package.payloads(self.source)[3]
        for name in (*package.SKILL_FILES, "packaging/plugin.json"):
            path = self.source / name
            path.write_bytes(path.read_bytes().replace(b"\r\n", b"\n").replace(b"\n", b"\r\n"))
        self.assertEqual(before, package.payloads(self.source)[3])

    def test_missing_material_prevents_release(self):
        (self.source / "references/orchestration.md").unlink()
        with self.assertRaisesRegex(ValueError, "Missing source"):
            package.validate(self.source)

    def test_broken_or_escaping_link_prevents_release(self):
        path = self.source / "SKILL.md"
        with path.open("a", encoding="utf-8") as f:
            f.write("\n[Missing](../outside.md)\n")
        with self.assertRaisesRegex(ValueError, "escapes"):
            package.validate(self.source)

    def test_version_mismatch_prevents_release(self):
        self.edit_manifest(lambda m: m.update(version="0.2.1"))
        with self.assertRaisesRegex(ValueError, "versions differ"):
            package.validate(self.source)

    def test_oversized_subtitle_prevents_release(self):
        self.edit_manifest(lambda m: m["extensions"]["com.openai"]["interface"].update(
            shortDescription="x" * 31))
        with self.assertRaisesRegex(ValueError, "Subtitle"):
            package.validate(self.source)

    def test_runtime_binding_prevents_release(self):
        self.edit_manifest(lambda m: m["extensions"]["com.openai"].update(hooks="./hooks/hooks.json"))
        with self.assertRaisesRegex(ValueError, "No runtime"):
            package.validate(self.source)

    def test_duplicate_keys_cannot_mask_metadata(self):
        with self.assertRaisesRegex(ValueError, "Duplicate key"):
            package.load_json('{"name":"saitodel","name":"other"}')

    def test_tampered_archive_is_rejected(self):
        path = self.base / "tampered.zip"
        package.write_zip(path, {"saitodel/SKILL.md": b"changed"})
        with self.assertRaisesRegex(ValueError, "mismatch"):
            package.inspect_zip(path, {"saitodel/SKILL.md": b"expected"})

    def test_old_product_metadata_is_rejected(self):
        path = self.source / "agents/openai.yaml"
        value = json.loads(path.read_text(encoding="utf-8"))
        value["policy"]["products"] = ["chatgpt", "codex", "api", "atlas"]
        path.write_text(json.dumps(value), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "product restriction"):
            package.validate(self.source)

    def test_small_or_nonsquare_icon_prevents_release(self):
        path = self.source / "assets/icon.svg"
        original = path.read_text(encoding="utf-8")
        for dimensions in ('width="24" height="24"', 'width="48" height="64"'):
            with self.subTest(dimensions=dimensions):
                path.write_text(original.replace('width="48" height="48"', dimensions),
                                encoding="utf-8")
                with self.assertRaisesRegex(ValueError, "square and at least 48"):
                    package.validate(self.source)

    def test_invalid_svg_prevents_release(self):
        (self.source / "assets/icon.svg").write_text('<svg broken', encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "valid SVG XML"):
            package.validate(self.source)


if __name__ == "__main__":
    unittest.main()
