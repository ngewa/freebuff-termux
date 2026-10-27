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
- The agent's own terminal tool dies with a terminal command broker error.

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

## Terminal Command Broker Repair

If the agent's terminal tool fails with `terminal command broker failed: ... protocol response was missing`, and `$TMPDIR/codebuff-process-*/stderr.log` shows:

```
.../glibc/lib/ld-linux-aarch64.so.1: unrecognized option '--terminal-command-broker'
```

then Freebuff is being started through the glibc loader (`grun`, or the Bionic helper at `$PREFIX/bin/freebuff`). The kernel then keeps the *loader* as `/proc/self/exe`, so the CLI's self-path (`process.execPath`) is the loader and the broker is spawned as `ld-linux-aarch64.so.1 --terminal-command-broker`, which the loader rejects.

Repair (from a plain Termux shell, not from inside Freebuff):

```bash
bash ~/.agents/skills/freebuff-updater/scripts/fix-terminal-broker.sh
```

It configures the real binary with `grun -c` (patchelf interpreter + rpath), replaces `$PREFIX/bin/freebuff` with a direct-exec launcher (backing the old helper up to `freebuff-helper.bak`), and falls back to `grun` if direct execution is impossible. Revert with `--revert`. Restart Freebuff afterwards.

## Troubleshooting
- **Bad system call / linker error**: Ensure `pkg install glibc-repo glibc-runner ripgrep git -y` is installed.
- **Terminal tool dead / broker protocol error**: see "Terminal Command Broker Repair" above.
- **HTTP redirect failure**: Codebuff releases redirect (301 -> 302 -> 302 -> 200 Azure Blob). Always use `curl -fL` or follow HTTP redirects in custom scripts.
