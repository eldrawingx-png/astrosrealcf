@echo off
setlocal enabledelayedexpansion

REM S.H. AstroBot AI — Instalador automático por cable USB (ADB) para Windows
REM Uso:
REM   scripts\install-adb.bat              -> Instala apuntando a la URL Cloud HTTPS
REM   scripts\install-adb.bat --usb-local  -> Configura adb reverse tcp:3000 y apunta a http://127.0.0.1:3000

set "MODE=%~1"
set "ANDROID_DIR=%~dp0..\android"
set "PACKAGE_ID=com.sh.astrobot.ai"

echo ==^> Verificando dispositivo Android conectado por USB (adb devices)...
where adb >nul 2>nul
if errorlevel 1 (
    echo ERROR: 'adb' no esta instalado en el PATH. Instala Android Platform Tools primero.
    exit /b 1
)

adb get-state >nul 2>nul
if errorlevel 1 (
    echo ERROR: No se detecto ningun telefono autorizado por USB.
    echo Activa 'Depuracion por USB' en Opciones de desarrollador y acepta el aviso en tu telefono.
    exit /b 1
)

set "GRADLE_PROP="
if "%MODE%"=="--usb-local" (
    echo ==^> Configurando tunel USB: adb reverse tcp:3000 tcp:3000
    adb reverse tcp:3000 tcp:3000
    set "GRADLE_PROP=-PASTROBOT_SERVER_URL=http://127.0.0.1:3000"
) else (
    adb reverse tcp:3000 tcp:3000 >nul 2>nul
)

echo ==^> Compilando APK nativo de S.H. AstroBot AI...
pushd "%ANDROID_DIR%"
if exist "gradlew.bat" (
    call gradlew.bat assembleDebug %GRADLE_PROP%
) else (
    where gradle >nul 2>nul
    if errorlevel 1 (
        echo ERROR: No se encontro gradlew.bat ni gradle en el PATH.
        echo Abre la carpeta android\ en Android Studio o instala Gradle 8.9+.
        popd
        exit /b 1
    )
    call gradle assembleDebug %GRADLE_PROP%
)
if errorlevel 1 (
    echo ERROR: Fallo la compilacion del APK.
    popd
    exit /b 1
)
popd

set "APK_PATH=%ANDROID_DIR%\app\build\outputs\apk\debug\app-debug.apk"
echo ==^> Instalando APK en el telefono por ADB...
adb install -r "%APK_PATH%"
if errorlevel 1 (
    echo ERROR: Fallo adb install.
    exit /b 1
)

echo ==^> Iniciando S.H. AstroBot AI en el telefono...
adb shell am start -n %PACKAGE_ID%/.MainActivity

echo ==^> Listo. S.H. AstroBot AI instalada y ejecutandose en tu telefono Android.
endlocal
