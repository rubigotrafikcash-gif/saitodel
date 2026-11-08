# Optional upstream examples and media

The original `examples/` and `media/` are © MotionSites. Its license permits
using them to build websites, including client sites, with this skill, and
prohibits reselling or redistributing them as a prompt or media collection.
This distributed skill and its release ZIP exclude those folders. Original
files remain in the preserved upstream Git history under their original terms.

If the user wants that library and the host permits network access and Git,
fetch it for local use:

```bash
python3 "$SKILL_DIR/scripts/fetch_resources.py"
```

The script prints an absolute cache directory containing `examples/`, `media/`,
`UPSTREAM_LICENSE`, and provenance. It downloads the commit recorded in
`upstream.json`, copies only these resource folders and their license, and never
executes upstream code. A successful repeated run reuses the same cache.
`--destination /a/writable/path` selects another location. Existing unrelated or
incomplete destinations are preserved and reported as errors.

Read `examples/INDEX.md` under the returned directory and choose the closest
examples. For media, read `media/MEDIA.md` and inspect the numbered contact
sheets. Use the listed URLs exactly. Do not include the cache in a repository,
skill ZIP, or published prompt/media collection. If downloading fails or is
unavailable, continue with the bundled craft/technique references and the user's
assets, and state that the optional library was unavailable.
