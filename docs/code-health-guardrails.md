# Code Health Guardrails

This document defines ongoing guardrails to prevent large-file regressions and keep the codebase easy to navigate.

## File Size Thresholds

- **Ideal target**: Keep most implementation files at or below ~200 lines.
- **Review threshold**: At ~250 lines, prefer extraction before adding more logic.
- **Hard-stop threshold**: At 400+ lines, do not continue adding logic without splitting first.

## Extraction Policy

- If a touched file is already above ~250 lines and your change adds meaningful logic, include extraction in the same workstream when practical.
- If immediate extraction is not safe for current scope, add a concrete follow-up item to `ROADMAP.md` in the same workstream.
- Keep screen route files focused on orchestration; move business logic to hooks/services/utilities.
- When extracting, preserve behavior and add/update focused regression tests.

## Review Checklist

Before opening a PR, confirm:

1. No file crossed the hard-stop threshold without a split.
2. Large-file edits include extraction or an explicit roadmap follow-up.
3. New helper logic is centralized instead of duplicated.
4. Behavior-changing refactors include tests.

## Related Docs

- `AGENTS.md`
- `CONTRIBUTING.md`
- `ROADMAP.md`
- `docs/codebase-breakdown-plan.md` (historical breakdown record)
