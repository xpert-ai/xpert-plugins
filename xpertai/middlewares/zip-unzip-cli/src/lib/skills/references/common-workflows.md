# Common Zip/Unzip Workflows

## 1. Backup a project directory with exclusions

Goal: compress a project while excluding `node_modules`, `.git`, and `*.log` files.

```bash
zip -r project-backup.zip /tmp/test-project \
  -x "*/node_modules/*" "*/.git/*" "*.log"
```

Notes:

- Use `-r` for recursive traversal.
- Keep glob patterns quoted.
- Prefer excluding both `node_modules` and `.git` recursively with `*/.../*`.

## 2. Extract a password-protected archive to a target directory

Goal: unpack a protected archive when the user already supplied the password.

```bash
unzip -P mypass123 secure-data.zip -d /tmp/extracted
```

Notes:

- `-P` is non-interactive and works in `sandbox_shell`.
- The password is visible in the command line, so only use it when the user explicitly provided it.
- If destination files may already exist, add either `-o` or `-n`.

## 3. Create 100MB split archives for upload limits

Goal: compress a large directory into multi-volume zip files.

```bash
zip -r -s 100m large-dataset.zip /tmp/large-dataset
```

Notes:

- This produces files like `large-dataset.z01`, `large-dataset.z02`, and `large-dataset.zip`.
- To extract later, reassemble first if needed:

```bash
zip -F large-dataset.zip --out large-dataset-complete.zip
unzip large-dataset-complete.zip
```
