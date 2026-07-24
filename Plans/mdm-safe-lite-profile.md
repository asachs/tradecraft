# ISA — Tradecraft-lite: MDM-safe install profile

> Definition of done, written BEFORE work starts. Additive to the repo; upstream `install.ts` / `bootstrap-work-profile.ts` untouched.

## Problem

The existing install paths assume a machine the operator fully controls. On a managed corporate Mac (active `/Library/Managed Preferences/` config profiles — TCC automation, servicemanagement/launchd, notification, web-content-filter policies), three things the repo does are unsafe or dead-on-arrival:

1. `schedule.ts` installs launchd LaunchAgents and fires `osascript` notifications — both governed by MDM profiles, and `osascript` is even denied by the repo's own `work-settings.json`.
2. `bootstrap-work-profile.ts --force` overwrites `~/.claude/CLAUDE.md` and `settings.json` wholesale — destroying the operator's org-policy CLAUDE.md and the SSH-warning hook.
3. `work-settings.json` wires 9 PreToolUse/PostToolUse hooks that don't exist in this repo (they ship in the external PAI archive) and grants blanket `Bash`.

`~/.claude/CLAUDE.md` and `settings.json` are confirmed **user-owned** (not MDM-redeployed), so an additive, merge-based install is durable.

## Goal

A single additive installer (`install-lite.ts`) plus one `SessionStart` hook (`WorkBrief.hook.ts`) give the operator the offline report engine's value on a managed machine with **zero** launchd, **zero** osascript, **zero** file clobbering, and least-privilege permissions — verified by `bun test`.

## Criteria

- [x] ISC-1: `hooks/WorkBrief.hook.ts` exports a pure `buildBrief(workDir, now)` returning `{ text, marker }`; execution side effects are guarded behind `import.meta.main` so the module is importable in tests without blocking on stdin.
- [x] ISC-2: `buildBrief` surfaces overdue promises, promises due today, and whether today's EOD file exists — reusing `tools/lib/{ledger,eod,dates,config}.ts`, never reimplementing them.
- [x] ISC-3: The hook writes only a one-line `WORK_DIR/.pending` marker and prints to stdout; it never generates reports, never calls the network, never calls osascript, and never throws (always exits 0).
- [x] ISC-4: `install-lite.ts` merges a settings snippet into `~/.claude/settings.json`, preserving all unrelated keys and the existing `PreToolUse` SSH-warning hook; it backs up to `settings.json.bak` before writing.
- [x] ISC-5: The merged snippet references hooks at their **repo path** (no copy into `~/.claude/hooks/`) and self-guards each command as `[ -f <path> ] && bun <path> || true` so a missing file is a silent no-op.
- [x] ISC-6: `install-lite.ts` adds `permissions.allow` = `Bash(git *)`, `Bash(bun *)` (union-merged, deduped) and a deny list including `osascript`, `elevenlabs`, `telegram`, `t.me` — never a blanket `Bash` allow.
- [x] ISC-7: `install-lite.ts` appends an `@<abs>/CLAUDE.md` import line to an existing `~/.claude/CLAUDE.md` (backing it up first); idempotent — a second run appends nothing. If the file is absent it is created with just the import.
- [x] ISC-8: Anti: `install-lite.ts` never installs a launchd job, never writes a plist, never invokes `launchctl` or `osascript`, and never overwrites `CLAUDE.md` or `settings.json` content that it did not itself add.
- [x] ISC-9: `bun test` passes new suites covering buildBrief output, permission merge, import injection + idempotency, and settings-preservation.

## Decisions

- 2026-07-24: Event-driven `SessionStart` briefing over launchd scheduling — chosen by operator; sidesteps the TCC/servicemanagement/notification MDM profiles that are the actual enforced layer. `schedule.ts` stays in the repo for non-managed machines, uninstalled here.
- 2026-07-24: Hooks referenced at their repo path, not copied into `~/.claude/hooks/`. Lets `WorkBrief` import `tools/lib/*` (no logic duplication) and keeps the install footprint additive and upstream canonical.
- 2026-07-24: Hook surfaces and writes only the `.pending` marker; it does NOT auto-generate reports on session start. Silent file writes on a managed machine are exactly the surprising side effect to avoid; the brief prints the catch-up command instead. Honors `DA_IDENTITY_WORK.md:34` ("ask before creating files / touching services").
- 2026-07-24: `CLAUDE.md` layered via `@import` append, never overwrite — the org-policy file stays canonical (it is user-owned, so the append is durable).

## Verification

- ISC-1, ISC-9: `bun test tests/workbrief.test.ts tests/install-lite.test.ts` → "18 pass, 0 fail, 55 expect() calls". Full suite `bun test` → "141 pass, 0 fail, 342 expect() calls, 14 files" (was 123 before this change — 18 added, 0 regressions).
- ISC-2, ISC-3: live `SessionStart` invocation — piping a real event payload with `WORK_DIR` set to a fixture ledger (overdue OPS-9) on 2026-07-24 (Fri) printed the Work-brief block (Overdue section + EOD nudge) and wrote `.pending` = "1 overdue · 0 due today · EOD pending". Hook imports `tools/lib/{config,ledger,dates}`; no duplicated logic. `weekend`/`EOD-done`/`done-promise` suppression covered by workbrief.test.ts.
- ISC-4, ISC-5: end-to-end install against a simulated real `~/.claude` (model `opus[1m]`, theme `dark`, a `PreToolUse` SSH-warning hook) preserved all three and added `SessionStart` + `Stop` whose commands are `[ -f "<repo>/hooks/…" ] && bun "<repo>/hooks/…" || true`. `settings.json.bak` written. No file copied into `~/.claude/hooks/`.
- ISC-6: resulting `permissions.allow` = `["Bash(git *)","Bash(bun *)"]` (no blanket `Bash`); `deny` includes `Bash(osascript *)`, elevenlabs, telegram, t.me.
- ISC-7: the org-policy CLAUDE.md ("SSH commands are blocked…") was preserved verbatim with the `@<repo>/CLAUDE.md` import appended under a marker comment; `CLAUDE.md.bak` holds the original. Second run: "skipped (already wired)" / "skipped (import already present)" — `installed: 0`; single import line, single `Bash(bun *)` entry (idempotency test asserts this).
- ISC-8: install-lite.test.ts anti-test asserts the written settings contain no `launchctl` / `.plist` and no hook command contains `osascript`/`launchct`. `schedule.ts` left untouched and uninstalled.
- Hygiene: `grep -rinE "payroc|asachs|/Users/|andre|bluesnap"` over all 5 new files → clean; `bun tools/verify-clean.ts` → "no identity/employer strings found".
