# Freebuff Termux Client

Client adapted to run Freebuff on Android through Termux. Supports the latest official Freebuff release (v0.2.x).

## Installation

One-liner (Termux). It installs Node.js if needed, then opens a small menu:

```bash
curl -fsSL https://raw.githubusercontent.com/ngewa/freebuff-termux/main/install.sh | bash
```

The menu offers **Install / Update**, installing a specific version, status, and
diagnostics. Non-interactive:

```bash
bash install.sh install          # install or update to the latest release
bash install.sh version 0.2.34   # install / switch to an exact version
bash install.sh check            # installed vs available versions + doctor
bash install.sh doctor           # diagnostics + automatic repair
```

Or with npm:

```bash
npm install -g @nyxur/freebuff
```

From this repository:

```bash
git clone https://github.com/ngewa/freebuff-termux.git
cd freebuff-termux
npm install -g .
```

## Configuration

Everything is installed automatically on the first run: engine, skills and the official
binary. Just start it:

```bash
freebuff
```

When a component is missing, `freebuff` installs it before launching, and on every start it
checks the npm registry for a newer upstream binary and updates itself. To skip that check:

```bash
freebuff --no-update
# or
FREEBUFF_NO_AUTO_UPDATE=1 freebuff
```

To run the guided setup instead:

```bash
freebuff setup
```

It will ask you about:
1. **Engine** (glibc-repo + glibc-runner) - Required for the binary to work on Termux
2. **Skills** (ripgrep) - For code_searcher
3. **Official binary download** (latest compatible version)

## Install / Update

`freebuff install` installs everything that is missing (engine, skills and the official
binary) without asking anything:

```bash
freebuff install
freebuff install 0.2.34   # pin an exact version
```

`freebuff update` installs or switches the binary version. With a terminal attached it
shows the recent upstream releases and lets you pick one (numbered list, `c` to type any
version, `0` to cancel), so you can upgrade **or** downgrade:

```bash
freebuff update             # interactive version selector
freebuff update 0.2.30      # exact version, no questions
freebuff update --check     # installed vs available versions, no changes
freebuff update --force     # reinstall even if the version matches
freebuff update --refresh   # ignore the 5-minute version cache
```

Versions are read from the npm registry and cached for 5 minutes in
`~/.cache/freebuff/releases.json`. Updates also happen automatically on every start; the
message *"This version of Freebuff is out of date"* is fixed by the next start or by:

```bash
freebuff update
freebuff doctor --fix
```

## Usage

```bash
# Start Freebuff
freebuff

# Install missing pieces (engine, skills, binary)
freebuff install

# Update / switch version (interactive selector)
freebuff update

# Installed vs available versions
freebuff update --check

# Without banner
freebuff --no-banner

# Show version
freebuff --version

# System diagnostics and version check
freebuff doctor

# Diagnostics + repair / auto-update
freebuff doctor --fix

# Changelog
freebuff changelog

# Clear cache
freebuff clean
```

## Environment variables

```bash
# Auto-configured by the launcher:
export CODEBUFF_rg_PATH=/data/data/com.termux/files/usr/bin/rg
export TERM=xterm-256color

# Proxy (optional):
export HTTP_PROXY=http://proxy:8080
export HTTPS_PROXY=http://proxy:8080
```

## Features

- One-line installer with an Install / Update menu (`install.sh`)
- Automatic terminal-broker repair: the binary runs directly instead of through the glibc loader
- `freebuff broker` shows the broker state, `--fix` repairs it, `--revert` restores the launcher
- `freebuff install` for a non-interactive full install
- `freebuff update` with a version selector (upgrade or downgrade)
- `freebuff update --check` shows installed and available versions
- Version list from the npm registry, cached for 5 minutes (`--refresh` to bypass)
- Automatic install of engine, skills and binary on first run
- Automatic update check on every start (`--no-update` / `FREEBUFF_NO_AUTO_UPDATE=1` to skip)
- Automatic Termux detection
- `grun` (glibc-runner) support for glibc binaries
- Automatic detection of the latest upstream version from the npm registry
- Direct `freebuff update` command
- Full HTTP redirect support (301, 302, 307, 308)
- Automatic sync with the binary in `/data/data/com.termux/files/usr/share/freebuff`
- Automatic `CODEBUFF_rg_PATH` configuration
- Step-by-step interactive setup
- Animated banner with the FREEBUFF logo and rotating gradients
- Native HTTP download (no curl dependency)
- Proxy support (HTTP_PROXY/HTTPS_PROXY)
- Download resume (HTTP Range)
- Retries with exponential backoff
- System diagnostics (`freebuff doctor`)
- Built-in skill for AI coding assistants (`.agents/skills/freebuff-updater`)

## AI Agent Skill (Antigravity, Claude, Cursor)

This repository ships a built-in agent skill in `.agents/skills/freebuff-updater/` for AI coding assistants. The AI can discover it directly to check the status, run diagnostics, and update the Freebuff binary on Termux automatically.

You can also run the updater script straight from the repo:
```bash
npm run update:bin
# or directly:
bash .agents/skills/freebuff-updater/scripts/update.sh
```

## Known issues

- `read_url` may hit DNS timeouts on some Android networks
- `python3` is not bundled (optional: `pkg install python`)
- **Dead terminal tool**: the agent answers `terminal command broker failed ... protocol response was missing` because Freebuff starts through the glibc loader and its own broker is launched as `ld-linux-aarch64.so.1 --terminal-command-broker`. Repair it from a plain terminal (outside Freebuff) with:
  ```bash
  bash .agents/skills/freebuff-updater/scripts/fix-terminal-broker.sh
  ```
  and restart Freebuff. The launcher also repairs it automatically on start, and
  `freebuff broker --fix` forces the repair (see below).

## Troubleshooting: Terminal Command Broker

If the agent's terminal tool is dead — every command returns
`terminal command broker failed: terminal command broker protocol response was missing` —
the broker is being spawned through the glibc loader and the loader rejects its own flag.

### Symptoms

- Any command run by the agent inside Freebuff fails with the broker error above, in both
  foreground and background mode.
- Freebuff itself starts and answers normally (`freebuff --version` works).
- The per-run logs under `$TMPDIR/codebuff-process-*/stderr.log` end with:

  ```
  /data/data/com.termux/files/usr/glibc/lib/ld-linux-aarch64.so.1: unrecognized option '--terminal-command-broker'
  ```

### Root cause

Freebuff runs on Termux through the glibc loader (`glibc-runner` / `grun`, or the Bionic
helper at `$PREFIX/bin/freebuff`). When an ELF binary is started by executing the loader
explicitly (for example `ld-linux-aarch64.so.1 --library-path ... freebuff.real`), the kernel
keeps the **loader** as `/proc/self/exe`. Node.js derives `process.execPath` from that same
path, so the CLI believes its own executable is:

```
/data/data/com.termux/files/usr/glibc/lib/ld-linux-aarch64.so.1
```

When it self-spawns the terminal command broker, the command line therefore becomes:

```
ld-linux-aarch64.so.1 --terminal-command-broker
```

and the loader aborts because `--terminal-command-broker` is not one of its options.

### Fix

Run this from a **plain Termux shell, outside Freebuff** (the agent's terminal is broken, so
it cannot repair itself):

```bash
bash .agents/skills/freebuff-updater/scripts/fix-terminal-broker.sh
```

The launcher does the first half of this automatically: on every start it marks the real
binary with `PT_INTERP` + `RUNPATH` (`grun -c`) and executes it directly, so
`/proc/self/exe` is the binary again and the broker works. To force it, or to check the
state:

```bash
freebuff broker          # diagnosis: loader, binary, launcher, direct exec
freebuff broker --fix    # patch the binary and replace an ELF launcher with a script
freebuff broker --revert # restore $PREFIX/bin/freebuff from freebuff-helper.bak
```

Disable the automatic repair with `FREEBUFF_NO_BROKER_FIX=1`.

The script:

1. Sets a working `PT_INTERP` + `RUNPATH` on the real binary (`grun -c`, i.e. `patchelf`) so the
   kernel can start it directly. Backs the original up to `<binary>.bak`.
2. Replaces `$PREFIX/bin/freebuff` (the loader wrapper) with a small shell launcher that
   `exec`s the real binary, so `/proc/self/exe` — and therefore the CLI's self-path — points at
   the real binary again. The old helper is backed up to `$PREFIX/bin/freebuff-helper.bak`,
   and the launcher falls back to `grun` if direct execution is impossible.

Restart Freebuff afterwards.

### Verify

```bash
readelf -l "$PREFIX/share/freebuff/freebuff.real" | grep interpreter   # -> glibc loader path
freebuff --version                                                     # -> prints the version
```

Then ask the agent to run any command; the broker error must be gone.

### Revert

```bash
bash .agents/skills/freebuff-updater/scripts/fix-terminal-broker.sh --revert
```

This restores `$PREFIX/bin/freebuff` from `freebuff-helper.bak`. The `patchelf` changes on the
real binary are harmless and can stay.

### Notes

- Requires `glibc-runner` (loader) and `patchelf`; the script falls back to the `patchelf`
  shipped in `$PREFIX/glibc/bin` and tries `pkg install patchelf` when neither is available.
- If the loader path does not exist at all, run `pkg install glibc-repo glibc-runner` first.
- Reinstalling or updating the `freebuff` package recreates the loader wrapper, so the repair
  has to be reapplied after such an update.

---

**Note:** This project is an unofficial, adapted Termux launcher for Freebuff.
