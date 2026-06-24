# PAI Work Profile — Fix Pass Plan

> Replaces the original plan. Fixes the 13 issues from critical review of Ultraplan delivery.

## Context

Ultraplan delivered the PAI Work Profile (963 lines, 13 files). Critical review found 5 runtime bugs, 4 design issues, and 4 minor issues. All templates and workflows are solid; the tooling has bugs and no tests. This plan fixes everything in one pass.

## Root Cause

Ultraplan ran on Claude Code web — no access to the personal machine's `settings.json` (hook event names), macOS `tar` (BSD vs GNU), or live skill directory structure. It made reasonable guesses that turned out wrong.

---

## Fixes by File

### 1. `tools/build-work-archive.ts` — 4 fixes

**F1: Replace `tar --transform` with staging directory.**
BSD tar (macOS default) doesn't support `--transform`. Instead of guessing at `gtar`:
- Create a temp staging dir with the desired archive structure (`hooks/`, `skills/`, `PAI/`)
- Copy/hardlink files into staging with correct relative paths
- `tar czf` the staging dir
- Clean up staging dir
This removes the manifest file approach entirely. Simpler, portable.

**F3: Make skill collection recursive.**
Replace the shallow `readdirSync(path)` on skill dirs (line 109) with the same recursive `walk()` function already used for `COPY_DIRS` (line 123). Skills have `Workflows/`, `Patterns/`, `Tools/` subdirectories that must be included.

**F4: Add `hooks/security/` collection.**
After the `hooks/lib/` collection (line 96), add identical collection for `hooks/security/` and its subdirectories (particularly `security/inspectors/`). SecurityPipeline.hook.ts imports from `./security/inspectors/` — without this directory the security hook fails at import time.

**F4b: Add `hooks/handlers/` collection (if needed).**
Check whether any work-safe hooks import from `hooks/handlers/`. If so, include those too.

### 2. `templates/work-settings.json` — 3 fixes

**F5: Fix hook event names.**
- `PreToolCall` → `PreToolUse`
- `PostToolCall` → `PostToolUse`
- `PostResponse` → `Stop` (PostResponse doesn't exist as an event)
- Move RepeatDetection and ISASync from `PostResponse` to `Stop` (alongside SessionActivityLog)

**F10: Relax Bash permissions.**
Replace the restrictive whitelist (`Bash(bun test*)`, `Bash(git *)`, etc.) with just `"Bash"` — same as the personal settings. A Principal DevOps Engineer needs `kubectl`, `docker`, `terraform`, `ssh`, `make`, `curl`, and whatever else the employer uses. The deny list still blocks personal service calls. Alternatively, keep it as a broader pattern: `Bash(*)`.

**F13: Fix deny patterns.**
`Bash(curl *elevenlabs*)` won't match `curl -H "..." https://api.elevenlabs.io/...` because flags appear between `curl` and the domain. Change to `Bash(*elevenlabs*)`, `Bash(*telegram*)`, `Bash(*pulse*)` to match the domain anywhere in the command string.

### 3. `templates/DA_IDENTITY_WORK.md` — 1 fix

**F6: Fix "tool" → "professional peer".**
Line 19: `No "we" framing that implies shared identity — you are a tool, not a companion`
Change to: `No "we" framing that implies shared life — you are a professional peer, not a personal companion`

This preserves the PAI relationship model (peers, not commander/executor) while still drawing the line against personal-life framing.

### 4. `templates/work-claude.md` — 1 fix

**F7: Fix @file syntax.**
Lines 3-4 use `@file PAI/USER/WORK_IDENTITY.md`. The personal CLAUDE.md uses `@PAI/USER/PRINCIPAL_IDENTITY.md` (no `file` keyword). Change to match the working pattern:
```
@PAI/USER/WORK_IDENTITY.md
@PAI/USER/DA_IDENTITY_WORK.md
```

### 5. `tools/bootstrap-work-profile.ts` — 1 fix

**F8: Copy lead-measures.md to work dir.**
In step 6 (create work directories), after creating the dirs, copy `templates/lead-measures.md` to `~/work/lead-measures.md` (using the same `copyIfMissing` pattern). MondayPlan.ts reads from there.

### 6. `tools/verify-isolation.ts` — 1 fix

**F9: Add USER/ forbidden dirs and files.**
Add to `FORBIDDEN_DIRS`:
- `PAI/USER/TELOS`
- `PAI/USER/HEALTH`
- `PAI/USER/FINANCES`
- `PAI/USER/BUSINESS`
- `PAI/USER/CONTACTS.md` (as file check)
- `PAI/USER/OUR_STORY.md` (as file check)
- `PAI/USER/OPINIONS.md` (as file check)
- `PAI/USER/PRINCIPAL_IDENTITY.md` (as file check)

Split into `FORBIDDEN_DIRS` and a new `FORBIDDEN_FILES` array, both checked.

### 7. `tools/build-work-archive.ts` — Phantom hooks (F2)

**F2: Don't reference PromptProcessing-work.hook.ts or ContainmentGuard-work.hook.ts in the archive builder.**

These were supposed to be modified versions of the originals. Two options:

**Option A (recommended):** The archive builder copies the ORIGINAL hooks (PromptProcessing.hook.ts, ContainmentGuard.hook.ts). The bootstrap script applies work-mode patches or the hooks themselves check an env var (`WORK_MODE=1`) to skip personal-only behavior. This avoids maintaining fork files.

**Option B:** Create the `-work` variants as actual files in the scaffold's `hooks/` directory. They'd be simplified versions. But this creates a maintenance burden — every time the personal hooks update, the work variants drift.

**Go with Option A.** Update the whitelist to use the original names. If PromptProcessing needs voice stripped, that's a runtime check (`if (process.env.WORK_MODE) skip voice curl`), not a separate file. Update `work-settings.json` to reference the original hook names too.

### 8. Tests — NEW FILES

**F11: `tests/build-work-archive.test.ts`**
- Test manifest generation with mock directory structure
- Test that missing hooks/skills log warnings but don't fail
- Test recursive skill collection includes nested dirs
- Test hooks/security/ and hooks/lib/ are included

**F11: `tests/bootstrap-work-profile.test.ts`**
- Test directory creation (mock filesystem)
- Test copyIfMissing skips existing files
- Test --force overwrites
- Test lead-measures.md gets copied to work dir

**F11: `tests/verify-isolation.test.ts`**
- Test forbidden dirs detected
- Test forbidden patterns detected
- Test allowed hooks pass
- Test unexpected hooks fail
- Test forbidden USER files detected
- Test clean state passes all checks

**F12: Add to `tests/eod.test.ts`**
- Test that `parseEodFiles` returns files in sorted order regardless of filesystem order

---

## Execution Order

Files are independent — can be done in any order. Logical grouping:

1. **Fix build-work-archive.ts** (F1, F2, F3, F4) — the most complex changes
2. **Fix work-settings.json** (F5, F10, F13) — critical correctness
3. **Fix templates** (F6, F7) — one-liners
4. **Fix bootstrap** (F8) — one addition
5. **Fix verify-isolation** (F9) — add arrays
6. **Write tests** (F11, F12) — depends on fixes being done

## Verification

- `bun test` — all existing 88 tests + new tests pass
- `bun tools/build-work-archive.ts --dry-run` — runs on macOS without tar errors
- `bun tools/verify-isolation.ts --verbose` — runs, checks are correct
- Manual review: `work-settings.json` hook events match personal `settings.json` event names
- Grep: no `PreToolCall`, `PostToolCall`, `PostResponse`, `@file` in any template

## Critical Files

| File | Action |
|------|--------|
| `tools/build-work-archive.ts` | MODIFY — staging dir, recursive skills, security dir, original hook names |
| `templates/work-settings.json` | MODIFY — event names, Bash permissions, deny patterns, hook file refs |
| `templates/DA_IDENTITY_WORK.md` | MODIFY — line 19 |
| `templates/work-claude.md` | MODIFY — lines 3-4 |
| `tools/bootstrap-work-profile.ts` | MODIFY — add lead-measures copy |
| `tools/verify-isolation.ts` | MODIFY — add USER/ forbidden dirs+files |
| `tests/build-work-archive.test.ts` | CREATE |
| `tests/bootstrap-work-profile.test.ts` | CREATE |
| `tests/verify-isolation.test.ts` | CREATE |
| `tests/eod.test.ts` | MODIFY — add sort order test |

---

## Future milestone — open-source release (Tradecraft)

**Intent:** release Tradecraft publicly as open source — *once the kinks are worked out*. Gate the release on real-world use proving the tooling holds up; do not ship on synthetic-fixture confidence alone.

**Release gate (the "kinks worked out" bar):**

- [ ] Used against real work data for a sustained period (≥2–3 weeks of actual EOD/weekly cadence), not just the fixture week
- [ ] Tooling shown reliable in practice — no manual fix-ups needed to make a report usable
- [ ] Repo confirmed employer- and person-agnostic: anti-leak sweeps green, no company names / hostnames / internal systems / personal-PAI paths anywhere in code, fixtures, docs, or git history
- [ ] `bun tools/verify-isolation.ts` and the network-call/identity-string sweeps pass clean

**Pre-publish checklist:**

- [ ] LICENSE added (choose: MIT / Apache-2.0)
- [ ] README rewritten for an external audience — what it is, the review-before-sharing / NDA-abstraction principle, quickstart, `WORK_DIR` config
- [ ] Decide repo identity: rename directory + git remote to `tradecraft`, or publish under current name
- [ ] CONTRIBUTING note + scrubbed git history (squash or fresh-init if any private data ever touched a commit)
- [ ] Strip or generalize anything in `templates/` that assumes a specific PAI install layout
