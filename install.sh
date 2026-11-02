#!/data/data/com.termux/files/usr/bin/bash
set -e

# ==============================================================================
# Freebuff Termux — Installer & Updater
# Repository: https://github.com/ngewa/freebuff-termux
# Alur menu mengikuti https://github.com/ngewa/termux-ai-tools
# ==============================================================================

NPM_PKG="@nyxur/freebuff"
PREFIX="${PREFIX:-/data/data/com.termux/files/usr}"

GREEN="\033[32m"
YELLOW="\033[33m"
CYAN="\033[36m"
RED="\033[31m"
BOLD="\033[1m"
RESET="\033[0m"

log_info() { echo -e "${CYAN}[INFO]${RESET} $1"; }
log_ok()   { echo -e "${GREEN}[OK]${RESET} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${RESET} $1"; }
log_err()  { echo -e "${RED}[ERROR]${RESET} $1"; }

has() { command -v "$1" >/dev/null 2>&1; }

is_termux() {
    [ -n "${TERMUX_VERSION:-}" ] || [ -d /data/data/com.termux ]
}

# Pregunta compatible con `curl ... | bash` (stdin ocupado por el pipe)
ASK=""
ask() {
    ASK=""
    if [ -e /dev/tty ]; then
        read -r -p "$1" ASK < /dev/tty || ASK=""
    else
        read -r -p "$1" ASK || ASK=""
    fi
}

banner() {
    echo -e "${BOLD}${CYAN}"
    echo "=================================================="
    echo "     Freebuff Termux — Installer & Updater       "
    echo "        Freebuff CLI + motor glibc (Termux)       "
    echo "=================================================="
    echo -e "${RESET}"
}

ensure_node() {
    if has node && has npm; then
        log_ok "Node.js $(node --version 2>/dev/null) + npm listos"
        return 0
    fi
    if ! is_termux; then
        log_err "Node.js/npm no encontrado. Instala Node.js >= 16 y reintenta."
        return 1
    fi
    log_info "Node.js/npm no encontrado, instalando nodejs-lts..."
    pkg install nodejs-lts -y >/dev/null 2>&1 || pkg install nodejs -y
}

ensure_launcher() {
    ensure_node || return 1
    if ! has freebuff; then
        log_info "Launcher freebuff no encontrado, instalando ${NPM_PKG}..."
        npm install -g "${NPM_PKG}@latest" --no-fund --no-audit
    fi
}

# 1) Install / Update: paquete npm + motor glibc + skills + binario
install_update() {
    ensure_node || return 1
    log_info "Instalando / actualizando el paquete ${BOLD}${NPM_PKG}${RESET}..."
    npm install -g "${NPM_PKG}@latest" --no-fund --no-audit
    log_ok "Paquete ${NPM_PKG} al día."
    log_info "Preparando motor glibc, skills y binario oficial..."
    FREEBUFF_NO_AUTO_UPDATE=1 freebuff install
    log_ok "Freebuff listo. Ejecuta: freebuff"
}

# 2) Instalar / cambiar a una versión concreta (upgrade o downgrade)
install_version() {
    local ver="${1:-}"
    ver="${ver#v}"
    if [ -z "$ver" ]; then
        ask "Versión objetivo (ej. 0.2.34): "
        ver="${ASK#v}"
    fi
    if [ -z "$ver" ]; then
        log_err "No se indicó ninguna versión."
        return 1
    fi
    ensure_launcher || return 1
    log_info "Instalando Freebuff v${ver}..."
    FREEBUFF_NO_AUTO_UPDATE=1 freebuff update "$ver" --force
}

# 3) Estado, versiones instalada/disponibles y diagnóstico
show_status() {
    echo -e "\n${BOLD}${CYAN}=== Estado de Freebuff en Termux ===${RESET}"
    if ! has freebuff; then
        log_warn "El launcher freebuff aún no está instalado. Usa la opción 1."
        return 0
    fi
    FREEBUFF_NO_AUTO_UPDATE=1 freebuff update --check || true
    echo ""
    FREEBUFF_NO_AUTO_UPDATE=1 freebuff doctor || true
}

# 4) Diagnóstico + reparación (motor, skills, binario, actualización)
run_doctor() {
    ensure_launcher || return 1
    FREEBUFF_NO_AUTO_UPDATE=1 freebuff doctor --fix
}

show_menu() {
    echo -e "${BOLD}Pilih opsi / Elige una opción:${RESET}"
    echo -e "  ${GREEN}1)${RESET} Install / Update Freebuff (versión más reciente)"
    echo -e "  ${GREEN}2)${RESET} Instalar versión concreta (upgrade / downgrade)"
    echo -e "  ${GREEN}3)${RESET} Ver estado, versión instalada y disponibles"
    echo -e "  ${GREEN}4)${RESET} Diagnóstico + reparación automática"
    echo -e "  ${YELLOW}5)${RESET} Salir"
    echo ""
    ask "Pilihan Anda [1-5]: "
    case "$ASK" in
        1) install_update ;;
        2) install_version ;;
        3) show_status ;;
        4) run_doctor ;;
        5|"") log_info "Selesai." ;;
        *) log_err "Opción no válida." ;;
    esac
}

banner

case "${1:-}" in
    install|update|--install|--update)
        install_update
        ;;
    version|--version|v)
        install_version "${2:-}"
        ;;
    check|status|--check)
        show_status
        ;;
    doctor|--doctor|fix)
        run_doctor
        ;;
    -h|--help|help)
        echo -e "${BOLD}Uso:${RESET} bash install.sh [install|version <v>|check|doctor]"
        echo -e "Sin argumentos abre el menú interactivo."
        ;;
    *)
        show_menu
        ;;
esac
