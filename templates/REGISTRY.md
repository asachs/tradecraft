# Initiative Registry — scored on the prioritisation filter

> Portfolio view across org and personal initiatives, scored against your org's prioritisation filter. Purpose: see at a glance what survives grooming, what needs an owner or finish line, and which personal initiatives are worth promoting to org.
>
> First-pass scoring by reading each ISA — the owner adjusts. Where an ISA has no definition of done yet, score `?`, not a guess.

## The filter

Define your org's prioritisation questions in `company.md` (they're employer-specific). Score each initiative against them. Example shape — replace with your org's actual questions:

1. <does it speed up delivery?>
2. <does it protect something critical?>
3. <clear owner and finish line?>
4. <does the definition of done include automation that improves the customer experience?>

**Legend:** ✓ yes · ~ partial · ✗ no · ? undefined (no DoD yet).

## How to read it

- The filter is an org-grooming lens. **Personal ramp-up / advocacy items score low by design** — not a mark against them; they serve a different purpose.
- Watch for the *discriminator* — often the automation/outcome question, which analysis-only initiatives (DoD = "a recommendation") fail. Reframe their DoD toward the enforcing automation to survive grooming.

## Org-assigned

| Initiative | Role | Owner | Q1 | Q2 | Q3 | Q4 | Read |
|---|---|---|:--:|:--:|:--:|:--:|---|
| <name> | 1st/2nd | <owner> | | | | | <verdict + key gap> |

## Personal

| Initiative | Candidate org | Q1 | Q2 | Q3 | Q4 | Read |
|---|---|:--:|:--:|:--:|:--:|---|
| <name> | <org or none> | | | | | <verdict + key gap> |

## Portfolio signal (the "so what")

- **Promote:** personal initiatives that clear the filter and name a candidate org.
- **Reframe the DoD:** initiatives that protect something critical but end in a document, not automation.
- **Define a finish line:** initiatives with no DoD — unscoreable defaults to dropped.

## Maintenance

- Hand-maintained first pass; re-score after each grooming / reprioritisation.
- Possible automation: add a `score:` block to each ISA's frontmatter and generate this table (pairs with `tools/Reconcile.ts`). Only if the registry earns its keep.
