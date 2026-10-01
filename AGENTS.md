# Repository Workflow

## Branch Policy

- Use `main` as the only long-lived branch.
- Commit completed changes directly to `main` unless the user explicitly requests a temporary branch.
- Do not recreate or use `dev` for normal work unless the user explicitly asks for it.

## Required Version and Push Flow

After completing each deliverable modification, always do all of the following before ending the task:

1. Increase the PATCH version by one. For example, change `2.9.23` to `2.9.24`.
2. Update every tracked source reference to the old version. Use `rg` to find all occurrences, especially in:
   - `sw.js`
   - `js/config.js`
   - `index.html`
   - `preferences.html`
   - `manifest.webmanifest`
   - JavaScript import query strings
   - `templates/help_modal.html`
3. Run lightweight validation relevant to the change, including `git diff --check` and JSON validation when JSON files change.
4. Commit with a concise message that includes the new version.
5. Push the commit to `origin/main`.

If one task requires several iterations, bump the version and push only once after the final modification is complete. Do not bump the version for intermediate edits.

Only skip the version bump, commit, or push when the user explicitly says not to perform it. If `origin/main` has new commits, fetch and integrate them before pushing; never force-push.
