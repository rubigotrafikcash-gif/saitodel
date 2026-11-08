"""Build and inspect Saitodel archives using Python 3.10+ standard library."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"
SKILL_FILES = (
    "SKILL.md", "agents/openai.yaml", "assets/icon.svg",
    "assets/run-record-template.md", "references/architecture-and-copy.md",
    "references/brief-and-approvals.md", "references/delivery-and-governance.md",
    "references/design-motion-and-qa.md", "references/multi-agent-regulation.md",
    "references/orchestration.md",
)
CATEGORIES = {
    "Business & Operations", "Communication", "Creativity", "Data & Analytics",
    "Developer Tools", "Education & Research", "Entertainment", "Finance",
    "Healthcare", "Other", "Productivity", "Scientific Research", "Security", "Travel",
}
STAMP = (1980, 1, 1, 0, 0, 0)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def load_json(text):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, f"Duplicate key: {key}")
            result[key] = value
        return result
    return json.loads(text, object_pairs_hook=unique)


def read_source(root, relative):
    path = root / relative
    require(not root.is_symlink(), "Source root cannot be a symlink")
    current = path
    while current != root:
        require(not current.is_symlink(), f"Symlink is not packaged: {relative}")
        current = current.parent
    require(path.is_file(), f"Missing source: {relative}")
    require(path.resolve().is_relative_to(root.resolve()), f"Escaping source: {relative}")
    data = path.read_bytes()
    text = data.decode("utf-8")
    require(not text.startswith("\ufeff"), f"UTF-8 BOM is not allowed: {relative}")
    # Canonical LF keeps archives identical with Windows autocrlf checkouts.
    return text.replace("\r\n", "\n").encode("utf-8")


def frontmatter(data):
    text = data.decode("utf-8")
    parts = text.split("---\n", 2)
    require(len(parts) == 3 and parts[0] == "", "SKILL.md needs frontmatter delimiters")
    # JSON flow mappings are valid YAML 1.2. This project intentionally uses
    # this subset so validation needs neither a YAML dependency nor a custom parser.
    meta = load_json(parts[1])
    require(isinstance(meta, dict) and set(meta) == {"name", "description"},
            "Frontmatter must contain exactly name and description")
    require(meta["name"] == "saitodel", "Skill name must remain saitodel")
    desc = meta["description"]
    require(isinstance(desc, str) and 1 <= len(desc.strip()) <= 1024,
            "Skill description must be a nonblank string <= 1024 characters")
    require("<" not in desc and ">" not in desc, "Description contains angle brackets")
    return meta, parts[2]


def check_relative(target, base, available):
    require("\\" not in target, f"Use POSIX relative paths: {target}")
    require(not urlsplit(target).scheme and not target.startswith("/"),
            f"Absolute local reference: {target}")
    clean = unquote(urlsplit(target).path)
    path = base / clean
    stack = []
    for part in path.parts:
        if part in ("", "."):
            continue
        if part == "..":
            require(bool(stack), f"Reference escapes skill: {target}")
            stack.pop()
        else:
            stack.append(part)
    resolved = "/".join(stack)
    require(resolved in available, f"Unbundled reference: {target} -> {resolved}")


def validate(root):
    root = root.resolve()
    files = {p: read_source(root, p) for p in SKILL_FILES}
    manifest_bytes = read_source(root, "packaging/plugin.json")
    manifest = load_json(manifest_bytes)
    require(isinstance(manifest, dict), "Manifest must be an object")
    allowed = {"$schema", "name", "version", "description", "author", "homepage",
               "repository", "license", "keywords", "extensions"}
    require(set(manifest) <= allowed, "Unsupported portable manifest field")
    require(manifest.get("$schema") == SCHEMA, "Wrong portable schema")
    require(manifest.get("name") == "saitodel", "Plugin identity must remain saitodel")
    version = manifest.get("version", "")
    require(isinstance(version, str) and
            re.fullmatch(r"(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)", version),
            "Expected a stable semantic version")
    _, body = frontmatter(files["SKILL.md"])
    require(f"Версия навыка: **{version}**." in body, "Skill and manifest versions differ")
    ext = manifest.get("extensions", {})
    require(isinstance(ext, dict) and set(ext) == {"com.openai"},
            "Only the presentation extension belongs in this package")
    openai = ext["com.openai"]
    require(isinstance(openai, dict) and set(openai) == {"interface"},
            "No runtime, hooks, app bindings or MCP belong in this package")
    interface = openai["interface"]
    require(isinstance(interface, dict), "Plugin interface must be an object")
    for key in ("displayName", "shortDescription", "longDescription",
                "developerName", "category", "defaultPrompt"):
        require(isinstance(interface.get(key), str) and interface[key].strip(),
                f"Missing interface text: {key}")
    require(len(interface["shortDescription"]) <= 30, "Subtitle exceeds 30 characters")
    require(len(interface["displayName"]) <= 30, "Display name exceeds 30 characters")
    require(interface["category"] in CATEGORIES, "Unsupported category")
    require(interface.get("capabilities") == [], "Skills-only package has no tool capabilities")
    require(len(interface["defaultPrompt"]) <= 128 and "\n" not in interface["defaultPrompt"],
            "Default prompt must fit one line and 128 characters")
    for key in ("logo", "composerIcon"):
        target = interface.get(key, "")
        prefix = "./skills/saitodel/"
        require(target.startswith(prefix), f"Unbundled plugin icon: {key}")
        check_relative(target[len(prefix):], PurePosixPath("."), files)
    agent = load_json(files["agents/openai.yaml"])
    require(set(agent) == {"interface", "policy"}, "Unexpected agent metadata")
    require(agent["policy"] == {"allow_implicit_invocation": True},
            "Unexpected product restriction or invocation policy")
    require(isinstance(agent["interface"], dict), "Agent interface must be an object")
    for key in ("display_name", "short_description", "default_prompt"):
        require(isinstance(agent["interface"].get(key), str) and agent["interface"][key].strip(),
                f"Missing skill UI text: {key}")
    require("$saitodel" in agent["interface"]["default_prompt"], "Skill prompt lost its invocation")
    for key in ("icon_small", "icon_large"):
        check_relative(agent["interface"][key], PurePosixPath("."), files)
    links = 0
    for name, data in files.items():
        if not name.endswith(".md"):
            continue
        text = data.decode("utf-8")
        require(not re.search(r"(?m)^\[TODO:[^\n]*\]\s*$", text), f"Unfinished TODO in {name}")
        for target in re.findall(r"\]\(([^)\s]+)\)", text):
            if urlsplit(target).scheme in ("https", "http", "mailto") or target.startswith("#"):
                continue
            check_relative(target, PurePosixPath(name).parent, files)
            links += 1
    require(len(files["assets/icon.svg"]) <= 5 * 1024 * 1024, "Icon too large")
    try:
        icon = ET.fromstring(files["assets/icon.svg"])
    except ET.ParseError as error:
        raise ValueError("Icon is not valid SVG XML") from error
    require(icon.tag == "{http://www.w3.org/2000/svg}svg", "Icon is not SVG")
    dimensions = [icon.get(key, "") for key in ("width", "height")]
    require(all(re.fullmatch(r"\d+(?:\.\d+)?(?:px)?", value) for value in dimensions),
            "Icon dimensions must be explicit pixels")
    width, height = [float(value.removesuffix("px")) for value in dimensions]
    require(width == height and width >= 48, "Icon must be square and at least 48 x 48")
    return files, manifest_bytes, version, links


def payloads(root):
    files, manifest, version, links = validate(root)
    skill = {"saitodel/" + path: data for path, data in files.items()}
    plugin = {"saitodel/plugin.json": manifest}
    plugin.update({"saitodel/skills/saitodel/" + path: data for path, data in files.items()})
    return files, version, links, {
        f"saitodel-skill-{version}.zip": skill,
        f"saitodel-plugin-{version}.zip": plugin,
    }


def write_zip(path, entries):
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_STORED) as archive:
        for name, data in sorted(entries.items()):
            info = zipfile.ZipInfo(name, STAMP)
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            info.compress_type = zipfile.ZIP_STORED
            archive.writestr(info, data)


def inspect_zip(path, expected):
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        require(len(names) == len(set(names)), "Archive has duplicate entries")
        require(set(names) == set(expected), "Archive inventory differs from source mapping")
        for entry in archive.infolist():
            require(entry.date_time == STAMP, "Archive has unstable timestamps")
            require((entry.external_attr >> 16) & 0o170000 == 0o100000,
                    "Archive has a non-regular file")
            require(archive.read(entry) == expected[entry.filename],
                    f"Archive content mismatch: {entry.filename}")


def build(root, output):
    files, version, links, archives = payloads(root)
    output.mkdir(parents=True, exist_ok=True)
    report = {"version": version, "source_files": len(files), "relative_links_checked": links,
              "source_sha256": {p: hashlib.sha256(d).hexdigest() for p, d in files.items()},
              "archives": {}, "validation": "project_contract_not_full_json_schema",
              "host_installation": "not_tested"}
    for name, entries in archives.items():
        target = output / name
        require(not target.is_symlink(), f"Refusing to overwrite symlink: {target}")
        write_zip(target, entries)
        inspect_zip(target, entries)
        report["archives"][name] = {
            "sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
            "size_bytes": target.stat().st_size, "entries": sorted(entries),
        }
    for filename in ("package-manifest.json", "SHA256SUMS"):
        require(not (output / filename).is_symlink(), f"Refusing output symlink: {filename}")
    (output / "package-manifest.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    (output / "SHA256SUMS").write_text(
        "".join(f"{v['sha256']}  {k}\n" for k, v in sorted(report["archives"].items())),
        encoding="utf-8", newline="\n")
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=ROOT)
    parser.add_argument("--output-dir", type=Path, default=ROOT / "dist")
    parser.add_argument("--check", action="store_true", help="Validate without writing archives")
    args = parser.parse_args()
    try:
        if args.check:
            files, _, version, links = validate(args.source)
            result = {"version": version, "files": len(files), "links": links, "status": "PASS"}
        else:
            result = build(args.source, args.output_dir)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except (ValueError, OSError, KeyError, TypeError, zipfile.BadZipFile) as error:
        parser.exit(1, f"Package validation failed: {error}\n")


if __name__ == "__main__":
    main()
