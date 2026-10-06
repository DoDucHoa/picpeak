# Upstream sync log

This fork takes changes from upstream (`https://github.com/PicPeak/picpeak`) by
cherry-picking chosen commits, never by merging `upstream/main`. A cherry-pick
gets a new SHA, so `git log main..upstream/main` keeps listing commits that are
already in the fork. This file and two git conventions record what was reviewed,
what was taken and what was left out on purpose.

## How to tell what is new

The annotated tag `upstream-reviewed` points at the last upstream commit that was
reviewed. Everything after it has not been looked at yet:

```bash
git fetch upstream --tags
git fetch origin --tags
git log --oneline upstream-reviewed..upstream/main
```

## How to tell what was taken

Every upstream commit is cherry-picked with `-x`, which appends
`(cherry picked from commit <upstream sha>)` to the message. That line survives
conflict resolution, so it is the reliable record:

```bash
git log main --format=%b | grep -o 'cherry picked from commit [0-9a-f]\{40\}' | awk '{print $5}'
```

`git cherry -v main upstream/main` compares patches instead and marks a commit
already in the fork with `-`, but only when it applied unchanged. A commit whose
conflicts were resolved by hand has a different patch and still shows as `+`.

## How to run a sync round

1. `git log --oneline upstream-reviewed..upstream/main` and classify every
   commit. Upstream's `chore(main): release` commits are always skipped: this
   fork has its own version line.
2. Never drop an upstream security fix silently. Take it, or record here why not.
3. Cherry-pick with `-x`, oldest first, on one branch in a worktree.
4. Resolve conflicts hunk by hunk. Never resolve a whole file with
   `git checkout --theirs`: in a cherry-pick that takes upstream's entire file
   and silently reverts every fork change in it.
5. After resolving, load every touched backend module and grep for removed or
   upstream-only names. A clean merge can still import a module this fork does
   not have.
6. Add a round to the log below, move the tag, and push it:

   ```bash
   git tag -fa upstream-reviewed <last reviewed upstream sha> -m "Upstream reviewed through <sha> on <date>"
   git push -f origin upstream-reviewed
   ```

## Known divergence that shapes conflicts

| Area | Upstream | This fork |
|---|---|---|
| Download allowance | Download limit, issue 1560 (`services/downloadQuota`, `event_download_grants`) | Own allowance (`services/downloadQuotaService.js`, migration 214). Never take upstream's quota calls |
| Client gallery | Themable gallery, `color_theme`, `galleryTheme` | Fixed client gallery redesign; migration 263 dropped the theme columns |
| Admin screens | Upstream's gallery settings, `PasswordResetModal`, event-details `draft.ts` | Rebuilt or removed in the fork |
| Locales | Eight UI locales | `en`, `de`, `vi` offered; date formatting through `utils/dateLocale.ts` |

## Log

### 2026-10-06: reviewed through `178f436f` (upstream 3.164.0-beta.0)

52 commits reviewed. Landed through PR #18.

Taken:

| Upstream | What |
|---|---|
| `16e91d6f` | fix(security): 95 findings of the October security scan (#1809). Adapted in five files; see the commit message |
| `f214df62` | fix(deps): sixteen Trivy findings in the dependencies |
| `665ad2f4` | test(engagement): poll instead of sleeping |
| `4782ddde` | ci(tests): backend job headroom, named timeouts |
| `474eae56` | test(settings): decode app_settings rows by engine. The test for upstream's video feature dropped |
| `6a30510c` | fix(public-site): self-host Inter instead of Google Fonts |
| `e452cb4f` | fix(archives): delete an event's child rows first, so PostgreSQL accepts the delete |
| `9fcb8875` | fix(db): four PostgreSQL-only query defects |
| `5cb13481` | fix(gallery): event date as a calendar date. Only `toDateOnly` taken from the conflicting imports |
| `9f1b128d` | fix(notifications): activity timestamps as UTC |
| `8101c7ba` | fix(downloads): invalidate in-flight zips, answer a failed single-file send |

Skipped on purpose:

| Upstream | Why |
|---|---|
| `4e00ad73` | fix(frontend): surfaced from this fork's own `beada2e76`, already on `main`; the date part would drop Vietnamese |
| `bc0c99d0` | fix(events): surfaced from this fork's own `d71b1de3b` and `0195f0b8d`; the rest touches admin screens the fork removed |
| `ba428882` | fix(expiry): SQLite only, and carries a migration |
| `b61402cb`, `b1e93f86`, `97ee1d03` | Wording and preview polish on screens the fork rebuilt |
| `2aaa12fb`, `09ea6b7a`, `76492c11`, `db5e0509`, `4df74565`, `09424e1e`, `bbe44274`, `0c0d0b9b`, `44d6dea2`, `21b4274a`, `4652ef21`, `b2ca7b9d`, `f093d466`, `04b29a61`, `382d9e2a`, `fa7e3e15`, `8337d480` | Features, not fixes. Each is a candidate for its own PR if wanted |
| `b3004083` | perf(gallery): targets upstream's gallery layouts, which the fork replaced |
| `e3a1b696` | docs: upstream's frontend UX guide |
| 16 `chore(main): release` commits | Upstream's version line |
