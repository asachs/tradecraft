# End-of-Day Summary

Draft one-liners from today's work, for the user to review before sharing.

## Inputs

- `~/work/worklog/activity.jsonl` — today's entries
- This session's own context, if work happened here
- `~/work/WORK_LEDGER.md` — to flag promises touched today

## Instructions

1. Read today's activity entries.
2. Produce 1-6 one-liners, each prefixed with exactly one type:
   - `done:` — something finished or shipped
   - `decided:` — a consequential call (include the one-clause "because")
   - `promised:` — a new commitment made (who, what, when)
   - `learned:` — domain/system knowledge worth keeping
   - `met:` — a meeting with an outcome worth recording
   - `blocked:` — a blocker someone else needs to know about
3. **Keep every line shareable:** own words; ticket/PR IDs as bare references; no code, secrets, hostnames, customer data, or internal-system detail beyond what is safe to say publicly.
4. Flag any line that looks brag-worthy with a trailing `[BRAG?]` so the user can promote it.
5. Output the lines and STOP. Do not send anything anywhere. The user copies what they approve.

## Example output

```
done: staging deploy pipeline migrated to OIDC, removing long-lived credentials (DEVOPS-214) [BRAG?]
decided: blue-green over canary for the gateway rollout, because traffic shape makes canary signal unreadable
promised: cost-comparison summary to platform lead by Friday
learned: settlement batch jobs run on a fixed 17:00 window — deploys must avoid it
```
