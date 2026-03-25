---
name: zip-unzip-cli
description: Use this skill whenever the user wants to compress or decompress files with zip or unzip inside the Xpert sandbox. Trigger when they mention creating zip archives, extracting zip files, listing archive contents, testing integrity, excluding files during compression, password-based extraction, or split zip archives.
---

# Zip/Unzip CLI Skill

This skill explains how to use the system `zip` and `unzip` commands inside the Xpert sandbox through `sandbox_shell`.

## Mandatory Workflow

1. Run archive commands through `sandbox_shell`.
2. Before first use in a session, read this file with:
   ```bash
   cat /workspace/.xpert/skills/zip-unzip/SKILL.md
   ```
3. Use Ubuntu/Linux shell syntax.
4. Avoid interactive commands. The sandbox is non-interactive.

## Core Operations

### Compress Files or Directories

**Basic compression:**
```bash
zip archive.zip file1.txt file2.txt
zip -r archive.zip directory/
```

**Compression levels** (`1` = fastest, `9` = best compression):
```bash
zip -1 fast.zip largefile.txt
zip -9 small.zip largefile.txt
```

**Preserve symlinks:**
```bash
zip -ry archive.zip directory/
```

### Extract Archives

**Extract to current directory:**
```bash
unzip archive.zip
```

**Extract to a specific directory:**
```bash
unzip archive.zip -d /path/to/destination/
```

**Extract specific files:**
```bash
unzip archive.zip file1.txt folder/file2.txt
```

**Choose overwrite behavior explicitly when files may already exist:**
```bash
unzip -o archive.zip
unzip -n archive.zip
```

### View Archive Contents

**List files:**
```bash
unzip -l archive.zip
```

**Detailed listing with sizes and dates:**
```bash
unzip -v archive.zip
```

**Test archive integrity:**
```bash
unzip -t archive.zip
```

## Password Handling

### Non-interactive password extraction

```bash
unzip -P mypassword secure.zip -d /tmp/extracted
```

### Non-interactive password creation

```bash
zip -P mypassword secure.zip sensitive_file.txt
```

`zip -P` and `unzip -P` are non-interactive, but the password is visible in the command line, shell history, and process listing. Only use them when the user explicitly provided the password and understands that tradeoff.

### Do not use interactive password prompts

```bash
zip -e secure.zip sensitive_file.txt
```

Do not use `zip -e` in `sandbox_shell`. It prompts for a password and can hang. The middleware blocks it.

## Excluding Files

**Exclude specific files or patterns:**
```bash
zip -r archive.zip project/ -x "*.log" "*.tmp" "*/node_modules/*" "*/.git/*"
```

**Exclude hidden files:**
```bash
zip -r archive.zip directory/ -x "*/.*"
```

Quote glob patterns so the shell does not expand them before `zip` receives them.

## Split Archives

**Create a split archive** (size in `k`, `m`, or `g`):
```bash
zip -r -s 100m large.zip bigdirectory/
```

**Reassemble and extract a split archive:**
```bash
zip -F large.zip --out complete.zip
unzip complete.zip
```

## Update Existing Archives

**Add files to an existing archive:**
```bash
zip archive.zip newfile.txt
zip -r archive.zip newfolder/
```

**Update changed files only:**
```bash
zip -u archive.zip file.txt
```

**Delete files from an archive:**
```bash
zip -d archive.zip unwanted.txt "*.log"
```

## Common Patterns

### Backup with a timestamp
```bash
zip -r backup_$(date +%Y%m%d_%H%M%S).zip /path/to/data/
```

### Quiet extraction
```bash
unzip -q archive.zip
```

### Preserve Unix attributes when needed
```bash
zip -rX archive.zip directory/
```

## Sandbox Notes

- This middleware checks and installs `zip` / `unzip` automatically inside the sandbox. Do not suggest `apt` or `sudo` as the first step.
- If `unzip` might overwrite files, explicitly choose `-o` or `-n` instead of relying on a prompt.
- Prefer the smallest command that matches the user request.
- After creating an archive, consider verifying it with `unzip -t archive.zip`.

## Quick Reference

| Task | Command |
|------|---------|
| Compress file | `zip archive.zip file.txt` |
| Compress directory | `zip -r archive.zip dir/` |
| Extract | `unzip archive.zip` |
| Extract to path | `unzip archive.zip -d /path/` |
| Extract with password | `unzip -P mypassword secure.zip -d /path/` |
| List contents | `unzip -l archive.zip` |
| Exclude pattern | `zip -r archive.zip dir/ -x "*.log"` |
| Split 100MB | `zip -r -s 100m archive.zip dir/` |
| Delete from archive | `zip -d archive.zip file.txt` |
| Test integrity | `unzip -t archive.zip` |
