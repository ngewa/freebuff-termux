#!/data/data/com.termux/files/usr/bin/bash
# ============================================================
# Freebuff Termux - repair the broken terminal command broker
# ============================================================
#
# Symptom (the tool reports these inside Freebuff):
#   terminal command broker failed: terminal command broker protocol
#   response was missing
# and the process logs under $TMPDIR/codebuff-process-*/stderr.log contain:
#   .../glibc/lib/ld-linux-aarch64.so.1: unrecognized option '--terminal-command-broker'
#
# Root cause:
#   Freebuff is started *through the glibc dynamic loader* (glibc-runner / grun,
#   or the Bionic ELF helper at $PREFIX/bin/freebuff which execv's the loader
#   with `--library-path`). When the loader is invoked explicitly, the kernel's
#   /proc/self/exe stays the *loader*, so the CLI's own executable path
#   (process.execPath used for self-spawn) becomes
#     .../glibc/lib/ld-linux-aarch64.so.1
#   The broker it spawns for terminal commands is therefore started as
#     ld-linux-aarch64.so.1 --terminal-command-broker
#   and the loader rejects its own flag:
#     ld-linux-aarch64.so.1: unrecognized option '--terminal-command-broker'
#
# Fix:
#   1. Give the real binary a working PT_INTERP + RUNPATH (`grun -c`, i.e.
#      patchelf), so the kernel can start it directly.
#   2. Replace $PREFIX/bin/freebuff (the loader wrapper) with a tiny shell
#      launcher that execv's the real binary, so /proc/self/exe - and therefore
#      the CLI's self-path - is the real binary again.
#
# Every modified file is backed up first. Run this from a plain Termux shell,
# not from inside Freebuff, and restart Freebuff when it finishes.
#
# Usage: bash fix-terminal-broker.sh [--revert]

set -u

PREFIX="${PREFIX:-/data/data/com.termux/files/usr}"
GLIBC_PREFIX="$PREFIX/glibc"
LD_SO="$GLIBC_PREFIX/lib/ld-linux-aarch64.so.1"
SHARE_REAL="$PREFIX/share/freebuff/freebuff.real"
CFG_REAL="$HOME/.config/freebuff/freebuff"
WRAPPER="$PREFIX/bin/freebuff"
WRAPPER_BAK="$PREFIX/bin/freebuff-helper.bak"
REVERT=false

[ "${1:-}" = "--revert" ] && REVERT=true

say() { printf '%s\n' "$*"; }
ok() { printf '  \033[32m+\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
err() { printf '  \033[31mx\033[0m %s\n' "$*" >&2; }

# ---------------------------------------------------------------- revert ---
if $REVERT; then
  say ""
  say "== Revert launcher =="
  if [ -f "$WRAPPER_BAK" ]; then
    cp "$WRAPPER_BAK" "$WRAPPER.new" && chmod +x "$WRAPPER.new" && mv "$WRAPPER.new" "$WRAPPER"
    ok "restored $WRAPPER from $WRAPPER_BAK"
  else
    warn "no backup at $WRAPPER_BAK - nothing to restore"
  fi
  say ""
  say "Restart Freebuff. (The patchelf changes on the real binary are harmless and can stay.)"
  exit 0
fi

# ------------------------------------------------------------- preflight ---
say ""
say "== 1/5 Preflight =="

if [ ! -d "$GLIBC_PREFIX/lib" ]; then
  err "glibc not found at $GLIBC_PREFIX - run: pkg install glibc-repo glibc-runner"
  exit 1
fi
if [ ! -f "$LD_SO" ]; then
  err "loader $LD_SO not found"
  exit 1
fi
ok "glibc loader: $LD_SO"

REAL=""
if [ -f "$SHARE_REAL" ]; then
  REAL="$SHARE_REAL"
elif [ -f "$CFG_REAL" ]; then
  REAL="$CFG_REAL"
fi
if [ -z "$REAL" ]; then
  err "no Freebuff binary found ($SHARE_REAL / $CFG_REAL) - run: freebuff update"
  exit 1
fi
ok "real binary : $REAL"

if [ ! -f "$WRAPPER" ] || [ ! -x "$WRAPPER" ]; then
  err "launcher $WRAPPER missing - reinstall the freebuff package first"
  exit 1
fi
ok "launcher    : $WRAPPER"

if ! command -v patchelf >/dev/null 2>&1; then
  warn "patchelf not found, installing..."
  pkg install patchelf -y >/dev/null 2>&1 || true
fi
if ! command -v patchelf >/dev/null 2>&1; then
  # glibc-runner ships a glibc patchelf in $GLIBC_PREFIX/bin
  if [ -x "$GLIBC_PREFIX/bin/patchelf" ]; then
    PATH="$GLIBC_PREFIX/bin:$PATH"
    ok "using $GLIBC_PREFIX/bin/patchelf"
  else
    err "patchelf unavailable - run: pkg install patchelf"
    exit 1
  fi
fi

# ------------------------------------------------------------- configure ---
say ""
say "== 2/5 Configure real binary (interpreter + rpath) =="

configure_one() {
  local real="$1"
  [ -f "$real" ] || return 0
  if [ ! -f "$real.bak" ]; then
    cp -p "$real" "$real.bak" && ok "backup: $real.bak"
  else
    ok "backup already present: $real.bak"
  fi
  if grun -c "$real" >/dev/null 2>&1; then
    local interp
    interp=$(readelf -l "$real" 2>/dev/null | grep -m1 'Requesting program interpreter' | sed 's/.*interpreter: //; s/\]//')
    ok "interpreter set on $(basename "$real"): ${interp:-<unknown>}"
    case "$interp" in
      "$LD_SO"*) ok "interpreter points at the glibc loader" ;;
      *) warn "interpreter is '$interp', expected '$LD_SO'" ;;
    esac
  else
    err "grun -c failed on $real"
    return 1
  fi
}

configure_one "$SHARE_REAL"
[ -f "$CFG_REAL" ] && configure_one "$CFG_REAL"

# ----------------------------------------------------- direct-exec check ---
say ""
say "== 3/5 Direct execution check =="
VER=$("$REAL" --version 2>&1)
if [ $? -eq 0 ] && [ -n "$VER" ]; then
  ok "direct exec works: $(printf '%s' "$VER" | head -n1)"
  DIRECT_OK=true
else
  warn "direct exec failed: $(printf '%s' "$VER" | head -n1)"
  warn "the launcher below will fall back to 'grun' (broker stays broken)"
  DIRECT_OK=false
fi

# -------------------------------------------------------- install launcher --
say ""
say "== 4/5 Install direct-exec launcher =="

if ! head -c4 "$WRAPPER" 2>/dev/null | grep -q 'ELF'; then
  warn "$WRAPPER is already a script - leaving it in place"
else
  if [ ! -f "$WRAPPER_BAK" ]; then
    cp -p "$WRAPPER" "$WRAPPER_BAK" && ok "backup: $WRAPPER_BAK"
  else
    ok "backup already present: $WRAPPER_BAK"
  fi

  NEW="$WRAPPER.new.$$"
  cat > "$NEW" <<EOF
#!/data/data/com.termux/files/usr/bin/bash
# Freebuff launcher: start the glibc binary directly (PT_INTERP + RUNPATH are
# set), so /proc/self/exe is the real binary and self-spawned helpers such as
# the terminal command broker work. Falls back to the glibc loader wrapper if
# the binary cannot be executed directly.
GLIBC_PREFIX="$GLIBC_PREFIX"
REAL="$REAL"
[ -f "\$HOME/.config/freebuff/freebuff" ] && REAL="\$HOME/.config/freebuff/freebuff"
export LD_LIBRARY_PATH="\$GLIBC_PREFIX/lib\${LD_LIBRARY_PATH:+:\$LD_LIBRARY_PATH}"
[ -f "$PREFIX/etc/tls/cert.pem" ] && export SSL_CERT_FILE="$PREFIX/etc/tls/cert.pem"
"\$REAL" "\$@"
status=\$?
if [ "\$status" = 126 ] || [ "\$status" = 127 ]; then
  exec grun "\$REAL" "\$@"
fi
exit \$status
EOF
  chmod +x "$NEW" && mv "$NEW" "$WRAPPER" && ok "launcher installed: $WRAPPER"
fi

# -------------------------------------------------------------- verify -----
say ""
say "== 5/5 Verify =="
OUT=$(freebuff --version 2>&1)
if [ -n "$OUT" ]; then
  printf '%s\n' "$OUT" | head -n3 | sed 's/^/    /'
  ok "freebuff --version responded"
else
  err "freebuff --version produced no output"
fi

say ""
if [ "$DIRECT_OK" = true ]; then
  say "Done. Restart Freebuff and test the terminal command again."
else
  say "Launcher installed, but the binary still cannot be exec'd directly,"
  say "so the launcher will keep using the loader and the broker will stay broken."
  say "Check: readelf -l '$REAL' | grep interpreter"
fi
say ""
