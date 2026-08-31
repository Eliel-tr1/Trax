# Project Guidelines for AI Agents (Claude Code)

This file is auto-loaded by Claude Code at the start of every session in this
repo — every human and every AI session reads it, so it's the one place that
reliably reaches all of them. Keep it under ~200 lines. For each line, ask
"would removing this cause mistakes?" — if not, cut it. Recurring, occasional,
or domain-specific knowledge (e.g. how to work with one integration) belongs
in a skill under `.claude/skills/`, not here — skills load on demand instead
of costing tokens every session. Update this file in the same commit as the
change it describes, not a follow-up.

## 0. Read before you act

Before writing or changing anything, in this order:
1. This file (CLAUDE.md).
2. `docs/architecture.md` — what the system is, how the pieces connect.
3. `docs/decisions/` — why things are the way they are (see §3).
4. `git log --oneline -20` and `git status` — what actually happened recently,
   not what you assume happened.
5. The specific code you're about to touch — read the whole file, not a
   snippet, before editing it.

Never assume the state of the repo from memory (yours or a prior session's
summary). Memory files under `.claude/` (personal, per-operator) are context,
not truth — the repo is truth.

## 1. Code tree structure

```
/src            application code, organized by feature/domain not by type
/data           schemas, migrations, seed/fixture data (never real customer
                data — see §5)
/scripts        one-off and recurring operational scripts (deploy, backfill,
                sync) — each script has a one-line header comment: what it
                does and who/what runs it
/deploy         deployment configs, CI/CD, infra-as-code
/docs
  architecture.md     current-state system map — update when it changes
  decisions/          ADRs — see §3
  runbooks/           step-by-step ops procedures (deploy, rollback, restore)
/.claude
  sessions/            per-session handoff notes — see §4
/tests
```

Rules:
- A new top-level directory needs a one-line reason recorded in
  `docs/architecture.md`.
- Don't create a parallel structure for "temporary" or "experimental" code —
  either it's real (goes in `/src`) or it's scratch (doesn't get committed).

## 2. Updating repo context when you make a change

Every change that affects how the system works, not just what a function
does, updates documentation **in the same commit**, not a follow-up:

| Change type                          | Update                              |
|---------------------------------------|--------------------------------------|
| New service/integration/data flow     | `docs/architecture.md`               |
| A non-obvious decision (why X not Y)  | new file in `docs/decisions/`        |
| New/changed deploy or ops step        | `docs/runbooks/`                     |
| New env var / secret                  | `.env.example` (name only, no value) |
| Breaking change to an existing flow   | `docs/architecture.md` + changelog   |

**Decision records** (`docs/decisions/NNNN-short-title.md`): plain text,
~10 lines. Context → decision → why this over the alternative. Only write one
when the "why" isn't obvious from the code itself — don't log routine work.

**Do not** duplicate this information into `.claude/` memory files. Personal
memory is for *your own* working habits and client context outside this repo;
anything another session or a teammate needs to function belongs in `docs/`
or this file, because that's the only thing every session reliably reads.

## 3. Running multiple sessions on the same repo without colliding

- **One branch per active thread of work.** Never have two sessions
  (human or AI) committing to the same branch at the same time.
- **Use git worktrees for parallel AI sessions** so each session has its own
  checkout and can't stomp on uncommitted changes in another:
  ```bash
  git worktree add ../repo-feature-x feature-x
  ```
  Run each Claude Code session in its own worktree directory. Use
  [cross-session messaging](https://code.claude.com/docs/en/cross-session-messaging)
  when two sessions genuinely need to pass findings to each other.
- **Claim before you start.** Before beginning non-trivial work, write a
  one-line entry in `.claude/sessions/ACTIVE.md`:
  `<date> | <branch> | <who/agent> | <one-line scope>`. Remove the line when
  the branch is merged or abandoned. Check this file before starting work on
  an area someone else claimed.
- **Small, frequent commits + push.** Long-lived uncommitted state is what
  causes collisions. Commit and push at natural checkpoints, not once at the
  end of a multi-hour session.
- **Pull before you plan.** At the start of a session, `git fetch` and check
  if the branch you're about to touch has moved.
- **Never force-push a shared branch.** Only ever force-push a branch that is
  exclusively yours and unreviewed.

## 4. Session handoff (context that must survive a new session)

For work that won't finish in one session, write
`.claude/sessions/<branch-name>.md` before stopping:
- What's done, what's left, exact next step.
- Any decision made mid-work not yet promoted to `docs/decisions/`.
- Blockers (waiting on a credential, a client answer, a review).

The next session (yours or someone else's) reads this file first — it is
disposable once the branch merges (delete it in the merge commit).

## 5. Secrets and data

- Real credentials never enter git, chat context, or `docs/`. `.env` is
  gitignored; `.env.example` lists names only.
- No real customer/production data in `/data` fixtures — synthetic only.
- If a session needs a secret to act, it reads it from `.env` at runtime, it
  is never pasted into a commit, a doc, or a decision record.

## 6. UI copy

- No em-dashes (—) in user-facing Hebrew text — client flagged this
  explicitly. Use a comma, period, or plain hyphen instead. Code comments are
  exempt.

## 7. Commits and PRs

- Commit message states *why*, not just *what* (the diff already shows what).
- One logical change per commit — don't bundle an unrelated doc fix into a
  feature commit.
- PRs get reviewed (`/code-review` or a human) before merge to the main
  branch; no direct pushes to main once the team is more than one person.
