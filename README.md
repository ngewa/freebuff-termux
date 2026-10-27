# Freebuff Termux Client

Cliente adaptado para ejecutar Freebuff en Android a través de Termux. Soporta la última versión oficial de Freebuff (v0.2.x).

## Instalación

```bash
npm install -g @nyxur/freebuff
```

O desde este repositorio:

```bash
git clone https://github.com/ngewa/freebuff-termux.git
cd freebuff-termux
npm install -g .
```

## Configuración

Después de instalar, ejecuta el setup interactivo:

```bash
freebuff setup
```

Esto te preguntará:
1. **Motor** (glibc-repo + glibc-runner) - Necesario para que el binario funcione en Termux
2. **Skills** (ripgrep) - Para code_searcher
3. **Descarga del binario oficial** (última versión compatible)

## Actualización (Update)

Si recibes el mensaje *"This version of Freebuff is out of date"*, puedes actualizar directamente con:

```bash
freebuff update
```

O reparar y actualizar automáticamente con:

```bash
freebuff doctor --fix
```

## Uso

```bash
# Iniciar Freebuff
freebuff

# Actualizar a la última versión
freebuff update

# Sin banner
freebuff --no-banner

# Mostrar versión
freebuff --version

# Diagnóstico del sistema y chequeo de versión
freebuff doctor

# Diagnóstico + reparación / auto-update
freebuff doctor --fix

# Historial de cambios
freebuff changelog

# Limpiar caché
freebuff clean
```

## Variables de entorno

```bash
# Auto-configurado por el launcher:
export CODEBUFF_rg_PATH=/data/data/com.termux/files/usr/bin/rg
export TERM=xterm-256color

# Proxy (opcional):
export HTTP_PROXY=http://proxy:8080
export HTTPS_PROXY=http://proxy:8080
```

## Características

- Detección automática de Termux
- Soporte `grun` (glibc-runner) para binarios glibc
- Detección automática de la última versión upstream desde npm registry
- Comando directo `freebuff update`
- Soporte completo de redirecciones HTTP (301, 302, 307, 308)
- Sincronización automática con binario en `/data/data/com.termux/files/usr/share/freebuff`
- Configuración automática de `CODEBUFF_rg_PATH`
- Setup interactivo paso a paso
- Banner animado con logo FREEBUFF y gradientes rotando
- Descarga HTTP nativa (sin dependencia de curl)
- Soporte proxy (HTTP_PROXY/HTTPS_PROXY)
- Resume de descarga (HTTP Range)
- Reintentos con backoff exponencial
- Diagnóstico del sistema (`freebuff doctor`)
- Skill bawaan untuk AI coding assistant (`.agents/skills/freebuff-updater`)

## AI Agent Skill (Antigravity, Claude, Cursor)

Repositori ini menyertakan skill agent bawaan di `.agents/skills/freebuff-updater/` untuk AI coding assistant. AI dapat langsung mendeteksi skill ini untuk memeriksa status, melakukan diagnosa, dan memperbarui biner Freebuff di Termux secara otomatis.

Kamu juga bisa mengeksekusi skrip pembaruannya langsung melalui:
```bash
npm run update:bin
# atau langsung:
bash .agents/skills/freebuff-updater/scripts/update.sh
```

## Issues conocidos

- `read_url` puede tener timeout DNS en algunas redes Android
- `python3` no incluido (opcional: `pkg install python`)

---

**Nota:** Este proyecto es un launcher adaptado para Termux y no oficial de Freebuff.
