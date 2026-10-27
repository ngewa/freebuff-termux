#!/data/data/com.termux/files/usr/bin/bash
set -e

# ========================================================
# Freebuff Termux Updater
# Automatically downloads & updates Freebuff to latest version
# ========================================================

PREFIX="${PREFIX:-/data/data/com.termux/files/usr}"
SHARE_DIR="$PREFIX/share/freebuff"
CONFIG_DIR="$HOME/.config/freebuff"
TMP_DIR="${TMPDIR:-$PREFIX/tmp}"

mkdir -p "$TMP_DIR"

echo "🔍 Memeriksa versi Freebuff terbaru..."
LATEST_VER=$(curl -s --connect-timeout 8 https://registry.npmjs.org/freebuff/latest | grep -o '"version":"[^"]*"' | cut -d'"' -f4)

if [ -z "$LATEST_VER" ]; then
    echo "⚠️  Gagal mengambil versi dari npm registry. Mencoba fallback ke releases..."
    LATEST_VER=$(curl -s --connect-timeout 8 https://api.github.com/repos/CodebuffAI/codebuff-community/releases | grep -o '"tag_name": "freebuff-v[^"]*"' | head -n1 | cut -d'"' -f4 | sed 's/freebuff-v//')
fi

if [ -z "$LATEST_VER" ]; then
    echo "❌ Error: Tidak dapat menghubungi server untuk mengecek versi terbaru." >&2
    exit 1
fi

CURRENT_VER=""
if [ -x "$PREFIX/bin/freebuff" ]; then
    CURRENT_VER=$("$PREFIX/bin/freebuff" -v 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -n1 || true)
fi

echo "📌 Versi terpasang: ${CURRENT_VER:-Tidak terdeteksi}"
echo "🚀 Versi terbaru : v${LATEST_VER}"

if [ "$1" != "--force" ] && [ "$CURRENT_VER" = "$LATEST_VER" ]; then
    echo "✅ Freebuff sudah dalam versi paling baru (v${CURRENT_VER}). Tidak perlu update."
    exit 0
fi

ARCH=$(uname -m)
case "$ARCH" in
    aarch64|arm64)
        TARGET_ARCH="arm64"
        ;;
    x86_64|amd64)
        TARGET_ARCH="x64"
        ;;
    *)
        echo "❌ Arsitektur tidak didukung: $ARCH" >&2
        exit 1
        ;;
esac

TARBALL="freebuff-linux-${TARGET_ARCH}.tar.gz"
DOWNLOAD_URL="https://codebuff.com/api/releases/download/${LATEST_VER}/${TARBALL}"
WORK_DIR="$TMP_DIR/freebuff_update_$$"

mkdir -p "$WORK_DIR"
trap 'rm -rf "$WORK_DIR"' EXIT

echo "⬇️  Mengunduh Freebuff v${LATEST_VER} (${TARGET_ARCH})..."
curl -fL --progress-bar "$DOWNLOAD_URL" -o "$WORK_DIR/$TARBALL"

echo "📦 Mengekstrak biner..."
tar -xzf "$WORK_DIR/$TARBALL" -C "$WORK_DIR"

if [ ! -f "$WORK_DIR/freebuff" ]; then
    echo "❌ Error: Biner freebuff tidak ditemukan di dalam arsip." >&2
    exit 1
fi

chmod +x "$WORK_DIR/freebuff"

# 1. Update ke /usr/share/freebuff jika sistem deb ada
if [ -d "$SHARE_DIR" ]; then
    echo "🔄 Menyinkronkan ke $SHARE_DIR..."
    cp "$WORK_DIR/freebuff" "$SHARE_DIR/freebuff.real"
    chmod +x "$SHARE_DIR/freebuff.real"
    if [ -f "$WORK_DIR/tree-sitter.wasm" ]; then
        cp "$WORK_DIR/tree-sitter.wasm" "$SHARE_DIR/tree-sitter.wasm"
    fi
fi

# 2. Update ke ~/.config/freebuff untuk launcher node/grun
mkdir -p "$CONFIG_DIR"
cp "$WORK_DIR/freebuff" "$CONFIG_DIR/freebuff"
chmod +x "$CONFIG_DIR/freebuff"
if [ -f "$WORK_DIR/tree-sitter.wasm" ]; then
    cp "$WORK_DIR/tree-sitter.wasm" "$CONFIG_DIR/tree-sitter.wasm"
fi

cat > "$CONFIG_DIR/freebuff-metadata.json" <<EOF
{
  "version": "$LATEST_VER",
  "target": "linux-$TARGET_ARCH",
  "installed": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF

# 3. Verifikasi
echo "🔍 Memverifikasi instalasi..."
VERIFY_VER=$("$PREFIX/bin/freebuff" -v 2>/dev/null || true)

echo ""
echo "🎉 Update berhasil! Freebuff kini di versi: ${VERIFY_VER:-v$LATEST_VER}"
echo "Ketik 'freebuff' untuk mulai menggunakan."
exit 0
