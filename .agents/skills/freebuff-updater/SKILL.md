---
name: freebuff-updater
description: >-
  Inspect, update, repair, and maintain Freebuff AI CLI and freebuff-termux in Termux (Android).
  Use whenever Freebuff gives an 'out of date' error, needs an update to the latest upstream release,
  or needs glibc-runner and binary synchronization.
---

# Freebuff Updater Skill for Termux

This skill provides procedures and utilities to inspect, update, and maintain **Freebuff** (and its Termux wrapper `freebuff-termux`) on Android Termux.

## Architecture Context

Freebuff is a native Linux binary built against glibc. On Android Termux:
- Direct execution fails under Bionic libc (`/system/bin/linker64`).
- It runs via glibc loader (`glibc-runner` / `grun` / `/data/data/com.termux/files/usr/glibc/lib/ld-linux-aarch64.so.1`).
- Bionic C wrapper is located at `/data/data/com.termux/files/usr/bin/freebuff`.
- Real glibc binary is located at `/data/data/com.termux/files/usr/share/freebuff/freebuff.real`.
- Node launcher / repository is located at `~/freebuff-termux`.
- Config / user binary is located at `~/.config/freebuff/freebuff`.

## When to Activate

Activate this skill when:
- User asks to update Freebuff or check Freebuff version.
- Freebuff CLI outputs: `This version of Freebuff is out of date. Update to the latest version to keep coding`.
- Freebuff fails to start due to missing glibc runner or corrupted binary.
- Updating `freebuff-termux` repository with upstream changes.

## Quick Update Workflow

### 1. Automated Script (Recommended)
Run the bundled update script:
```bash
~/.agents/skills/freebuff-updater/scripts/update.sh
```
To force re-download even if version matches:
```bash
~/.agents/skills/freebuff-updater/scripts/update.sh --force
```

### 2. Via `freebuff-termux` Launcher
If working from the repo:
```bash
cd ~/freebuff-termux
node bin/freebuff.js update
node bin/freebuff.js doctor --fix
```

### 3. Verification
Verify the update was applied:
```bash
freebuff --version
```
Must match the latest version reported by:
```bash
curl -s https://registry.npmjs.org/freebuff/latest | grep -o '"version":"[^"]*"'
```

## Troubleshooting
- **Bad system call / linker error**: Ensure `pkg install glibc-repo glibc-runner ripgrep git -y` is installed.
- **HTTP redirect failure**: Codebuff releases redirect (301 -> 302 -> 302 -> 200 Azure Blob). Always use `curl -fL` or follow HTTP redirects in custom scripts.
