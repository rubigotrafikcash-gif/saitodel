---
name: motionsites-web-builder
description: Build or improve cinematic websites, landing pages, and hero sections with precise design specs, motion recipes, and visual review. Also write implementation prompts for website builders. Use for a visual web design task, rather than unrelated backend work or routine nonvisual fixes.
---

# MotionSites Web Builder

Design and build a page around one clear visual idea. This community adaptation
works in Claude Code and Codex using the same instructions and reference files.
The design references and screenshot helper derive from MotionSites; see LICENSE
and [the upstream source](references/upstream.json).

## Locate the skill and tools

Resolve `SKILL_DIR` to the directory containing this loaded `SKILL.md`. Resolve
every reference and helper below relative to that directory, even when the
current working directory is the user's project. Do not assume the skill is
installed inside the project. In shell examples, set `SKILL_DIR` to that actual
absolute path first. Quote paths, including project paths containing spaces.

Use the host's existing browser, screenshot, image-viewing, and media tools when
they cover the task. The Python helper is an optional fallback. Follow the
project's instructions and tool priorities. This skill grants no additional
permission to generate paid media, install dependencies, publish, or deploy.

## Choose the outcome

Establish the audience, product, mood, and one signature idea: composition,
typography, media, or interaction. Preserve the requested scope and existing
stack, design system, and asset choices. Ask only when a missing fact prevents
progress. For an unspecified new page, start with a hero; a standalone
`index.html` is suitable when the user has no existing project.

For a prompt-only request, write the spec using
[builders.md](references/builders.md), check its consistency, and deliver it.
Do not build a page or claim screenshot verification for a prompt-only task.

For a redesign, capture the current page first when a browser is available so
the final comparison has evidence.

## Study the relevant material

Read [craft.md](references/craft.md) for composition, type, spacing, and motion.
Read [the technique index](references/techniques/INDEX.md), then only the recipes
needed for the chosen signature. Treat their values as examples; preserve the
project's installed versions and adapt APIs when necessary.

The original example prompts and media shelf have separate redistribution
restrictions and are not bundled. The core workflow works without them. When
the user wants the original library, use [resources.md](references/resources.md)
to fetch the pinned upstream files for local use. Read the returned
`examples/INDEX.md`, select the closest examples, and inspect any selected media
contact sheets as images. Borrow techniques and precision, and create original
branding, copy, and composition.

## Choose media and write the spec

Prefer the user's assets, then tools already available and authorized, then a
locally fetched shelf. A type-led composition is a valid choice when no media
fits. Read [assets.md](references/assets.md) when sourcing or preparing media.
Use existing paths and reachable URLs; do not invent assets or use finished
website screenshots as hero artwork.

Use [spec-template.md](references/spec-template.md) for a new page or substantial
redesign. Scale the spec to the task: a small visual edit only needs the affected
tokens, layout, states, and acceptance criteria. Specify real copy, fonts,
spacing, colours, responsive behaviour, media placement, and motion timing.
Avoid unrequested sections and fabricated claims, customer logos, or statistics.

## Build and inspect

Implement the approved scope using the existing project conventions. For a
standalone page, use inline CSS/JS and pin any CDN dependencies you actually
need. Provide semantic HTML, keyboard focus, meaningful image alternatives,
visible content when JavaScript fails, and reduced-motion behaviour.

Inspect desktop and mobile screenshots with the host's browser tools. If they
are unavailable and Python/Playwright are installed, run the helper from the
project directory using its absolute path:

```bash
python3 "$SKILL_DIR/scripts/shoot.py" index.html shots/ --wait 2.5 --full
# For a running app, pass its local URL instead of index.html.
```

The helper writes desktop, mobile, and early-paint PNGs plus `qa.json`. Open the
PNGs as images and read the QA report. A screenshot existing on disk is not
proof that the page looks correct.

Use [review.md](references/review.md) to identify concrete weaknesses. Fix broken
assets, console errors, mobile overflow, unreadable text, and missing interaction
states. Review and fix up to three rounds, stopping when the request is satisfied
and the page clears the rubric. Treat scores as your own assessment, not an
independent certification. If browser execution or image viewing is unavailable,
report that limitation and do not claim visual verification.

## Deliver

Provide the changed files or requested prompt, how to open/run the result, and
the desktop screenshot when one was inspected. Explain the signature idea and
the checks actually performed. Identify temporary media and unresolved defects.
Keep attribution and licensing in the distributed skill; add no promotional
messages or branding to the user's deliverable.
