# DOCX Editor UI Fixes

## Scope

This change improves the DOCX editor workbench toolbar and menu behavior. It is limited to the remote component implementation and its generated browser assets.

## Changes

### 1. Menu layering and opaque surfaces

- Raised the title bar and menu bar stacking levels.
- Made the `文件`, `格式`, `插入`, and `帮助` popover surfaces opaque and positioned above the document and file-operation areas.
- Added consistent borders, text colors, and shadows for the fixed-position menu surfaces.

### 2. Reliable font-size changes

- Replaced the stale font-size interaction with a controlled `FontSizePicker`.
- Read the current ProseMirror font-size mark when the selection changes.
- Applied font sizes in the editor's half-point unit (`size * 2`).
- Kept the editor focused after a successful change so consecutive increase/decrease operations continue to work.

### 3. Font and background color selection

- Changed the font-color and background-color primary controls to open the full color picker.
- Added theme colors, standard colors, and custom HEX input.
- Preserved a visible color swatch in the toolbar so the selected color is not rendered as a blank button.
- Added localized labels for the new toolbar controls in Chinese and English.

### 4. Two-page toolbar navigation

- Removed the horizontal toolbar scrollbar.
- Split the toolbar into two logical pages.
- Added a compact left/right arrow control to switch pages in one click.
- Kept the custom font-size control on the first page and removed duplicate/stale controls from the second page.

### 5. Table-size selector rendering

- Converted host HSL component variables to valid CSS colors before assigning them to DOCX theme variables.
- Fixed `--doc-border`, `--doc-primary`, background, foreground, input, muted, card, and related variables.
- Restored table-grid borders, hover highlighting, and the selected table size label under `插入 -> 表格`.

## Files

- `src/lib/remote-components/docx-editor-workbench/src/main.tsx`
- `src/lib/remote-components/docx-editor-workbench/src/styles.ts`
- `src/lib/remote-components/docx-editor-workbench/src/i18n.ts`
- `src/lib/remote-components/docx-editor-workbench/app.js`
- `src/lib/remote-components/docx-editor-workbench/app.css`

## Validation

- `pnpm run build` passed.
- `pnpm run typecheck` passed.
- The DOCX unit tests passed (`2/2`).
- `git diff --check` passed.
- Local plugin installation/refresh completed through the platform plugin management flow.
- The API service was restarted on port `3000` so the refreshed plugin was loaded.
- Browser checks covered menu opacity and layering, consecutive font-size changes, standard/custom colors, two toolbar pages, and the table-size selector.

## Local restore point

A pre-change tag was created as:

```text
codex/docx-editor-before-ui-fixes-20260805
```

To create a separate restore branch from that point:

```bash
git switch -c codex/docx-editor-restore codex/docx-editor-before-ui-fixes-20260805
```

## Pull request procedure

The intended target is `xpert-ai/xpert-plugins`, base branch `main`, and plugin directory `xpertai/apps/docx-editor`.

1. Create or use a personal fork at `https://github.com/<your-user>/xpert-plugins`.
2. From the repository root, configure remotes. Keep the official repository as `upstream` and use the fork for pushing:

   ```bash
   git remote rename origin upstream
   git remote add origin https://github.com/<your-user>/xpert-plugins.git
   git remote -v
   ```

   If `origin` already points to your fork, do not rename or replace it.

3. Confirm the branch and review the exact files that will be submitted:

   ```bash
   git switch codex/docx-editor-ui-fixes
   git status --short
   git diff -- xpertai/apps/docx-editor
   ```

4. Stage only the DOCX plugin changes and this document:

   ```bash
   git add \
     xpertai/apps/docx-editor/src/lib/remote-components/docx-editor-workbench \
     xpertai/apps/docx-editor/DOCX_EDITOR_UI_FIXES.md
   git diff --cached --check
   ```

5. Commit the change:

   ```bash
   git commit -m "fix(docx-editor): improve toolbar and color controls"
   ```

6. Update the branch against the latest official `main` before pushing:

   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

   Resolve any conflicts, then run the build and tests again if the rebase changes files.

7. Push the branch to your fork:

   ```bash
   git push -u origin codex/docx-editor-ui-fixes
   ```

8. Open GitHub and choose **Compare & pull request**. Set:

   - **Base repository:** `xpert-ai/xpert-plugins`
   - **Base branch:** `main`
   - **Head repository:** your fork
   - **Compare branch:** `codex/docx-editor-ui-fixes`

9. Suggested PR title:

   ```text
   fix(docx-editor): improve toolbar, colors, and table selector
   ```

10. Suggested PR body:

   ```markdown
   ## Summary

   - Fix DOCX menu popovers overlapping the file-operation area.
   - Make consecutive font-size changes reliable.
   - Add visible standard/custom font and background color selection.
   - Replace the toolbar scrollbar with two-page arrow navigation.
   - Fix the blank table-size selector caused by invalid HSL variable usage.

   ## Validation

   - `pnpm run build`
   - `pnpm run typecheck`
   - DOCX unit tests (`2/2`)
   - `git diff --check`
   - Browser regression checks in the local Xpert platform

   Detailed change notes: `xpertai/apps/docx-editor/DOCX_EDITOR_UI_FIXES.md`
   ```

11. Submit the PR, wait for CI, and respond to review comments. Later fixes should be committed to the same branch and pushed with:

   ```bash
   git push
   ```

   GitHub will automatically update the open PR.

12. After the PR is merged, clean up the local branch if desired:

   ```bash
   git switch main
   git pull --ff-only upstream main
   git branch -d codex/docx-editor-ui-fixes
   git push origin --delete codex/docx-editor-ui-fixes
   ```
