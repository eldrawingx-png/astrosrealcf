#!/usr/bin/env bash
set -euo pipefail

# S.H. AstroBot AI — Instalador automático por cable USB (ADB) para Linux / macOS
# Uso:
#   ./scripts/install-adb.sh              -> Instala apuntando a la URL Cloud HTTPS
#   ./scripts/install-adb.sh --usb-local  -> Configura adb reverse tcp:3000 y apunta a http://127.0.0.1:3000

MODE="${1:-cloud}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ANDROID_DIR="$ROOT_DIR/android"
PACKAGE_ID="com.sh.astrobot.ai"

echo "==> Verificando dispositivo Android conectado por USB (adb devices)..."
if ! command -v adb >/dev/null 2>&1; then
  echo "ERROR: 'adb' no está instalado en el PATH. Instala Android Platform Tools primero."
  exit 1
fi

DEVICES=$(adb devices | awk 'NR>1 && $2=="device" {print $1}')
if [ -z "$DEVICES" ]; then
  echo "ERROR: No se detectó ningún teléfono autorizado por USB."
  echo "Activa 'Depuración por USB' en Opciones de desarrollador y acepta el aviso en tu teléfono."
  exit 1
fi

echo "==> Dispositivo detectado: $DEVICES"

GRADLE_ARGS=()
if [ "$MODE" = "--usb-local" ]; then
  echo "==> Configurando túnel USB: adb reverse tcp:3000 tcp:3000"
  adb reverse tcp:3000 tcp:3000
  GRADLE_ARGS+=("-PASTROBOT_SERVER_URL=http://127.0.0.1:3000")
else
  # Configurar túnel de respaldo por si el usuario cambia a modo USB dentro de la app
  adb reverse tcp:3000 tcp:3000 || true
fi

echo "==> Compilando APK nativo de S.H. AstroBot AI..."
cd "$ANDROID_DIR"
if [ -x "./gradlew" ]; then
  ./gradlew assembleDebug "${GRADLE_ARGS[@]}"
elif command -v gradle >/dev/null 2>&1; then
  gradle assembleDebug "${GRADLE_ARGS[@]}"
else
  echo "ERROR: No se encontró './gradlew' ni 'gradle' instalado."
  echo "Abre la carpeta 'android/' en Android Studio una vez o instala Gradle 8.9+."
  exit 1
fi

APK_PATH="$ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk"
if [ ! -f "$APK_PATH" ]; then
  echo "ERROR: No se generó el APK en $APK_PATH"
  exit 1
fi

echo "==> Instalando APK en el teléfono por ADB..."
adb install -r "$APK_PATH"

echo "==> Iniciando S.H. AstroBot AI en el teléfono..."
adb shell am start -n "$PACKAGE_ID/.MainActivity"

echo "==> Listo. S.H. AstroBot AI instalada y ejecutándose en tu teléfono Android."
