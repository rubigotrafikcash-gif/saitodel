"""Fetch the separately licensed upstream library for local use; never execute it."""

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


SKILL_DIR = Path(__file__).resolve().parents[1]
SOURCE_FILE = SKILL_DIR / "references" / "upstream.json"
RESOURCE_FOLDERS = ("examples", "media")
MARKER_FILE = ".source.json"
GIT_TIMEOUT_SECONDS = 120


def git(directory, *args):
    result = subprocess.run(
        ["git", "-C", str(directory), *args],
        capture_output=True, text=True, timeout=GIT_TIMEOUT_SECONDS,
    )
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or "Git command failed")
    return result.stdout.strip()


def cached_resources(destination, source):
    if not destination.exists():
        return False
    marker = destination / MARKER_FILE
    expected = [destination / "examples" / "INDEX.md",
                destination / "media" / "MEDIA.md", destination / "UPSTREAM_LICENSE"]
    try:
        matches = json.loads(marker.read_text()) == source
    except (OSError, ValueError):
        matches = False
    if not matches or not all(path.is_file() for path in expected):
        raise RuntimeError(
            f"Preserving existing destination {destination}: it is incomplete or "
            "belongs to another source. Choose a different --destination."
        )
    return True


def fetch_resources(destination, source):
    destination = destination.expanduser().resolve()
    if cached_resources(destination, source):
        return destination
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(
        prefix=".motionsites-fetch-", dir=destination.parent,
    ) as temporary:
        checkout = Path(temporary) / "upstream"
        checkout.mkdir()
        git(checkout, "init", "--quiet")
        git(checkout, "remote", "add", "origin", source["repository"])
        git(checkout, "fetch", "--quiet", "--depth=1", "origin", source["commit"])
        git(checkout, "checkout", "--quiet", "--detach", "FETCH_HEAD")
        if git(checkout, "rev-parse", "HEAD") != source["commit"]:
            raise RuntimeError("Upstream checkout does not match the pinned commit")
        staged = Path(temporary) / "resources"
        staged.mkdir()
        for name in RESOURCE_FOLDERS:
            shutil.copytree(checkout / source["skill_path"] / name, staged / name)
        shutil.copyfile(checkout / "LICENSE", staged / "UPSTREAM_LICENSE")
        (staged / MARKER_FILE).write_text(json.dumps(source, indent=2) + "\n")
        staged.rename(destination)
    return destination


def main(argv=None):
    source = json.loads(SOURCE_FILE.read_text())
    default = Path.home() / ".cache" / "motionsites-web-builder" / source["commit"]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--destination", type=Path, default=default)
    args = parser.parse_args(argv)
    try:
        print(fetch_resources(args.destination, source))
    except (OSError, RuntimeError, subprocess.TimeoutExpired) as exc:
        print(f"Resource fetch failed: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
