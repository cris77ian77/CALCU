# Modo kiosco — pantalla de cobro

Deja la Raspberry mostrando `cobro-qr/index.html` a pantalla completa
apenas arranca, sin barra de navegador, sin cursor de mouse, sin
protector de pantalla, y reabriéndose sola si el navegador se cierra o
crashea.

## 1) Autologin al escritorio

El kiosco necesita que la Raspberry arranque directo al escritorio, sin
pedir usuario/contraseña (después nadie va a estar ahí para tipearla):

```bash
sudo raspi-config
# → System Options → Boot / Auto Login → Desktop Autologin
```

## 2) Confirmar que estás en X11 (no Wayland)

Este kiosco usa `autostart` de LXDE, que es X11. Raspberry Pi OS
(Bookworm en adelante) viene con **Wayland** por defecto — hay que
cambiarlo:

```bash
sudo raspi-config
# → Advanced Options → Wayland → X11
```

(Si preferís quedarte en Wayland con el compositor `labwc`, la lógica es
la misma pero el autostart va en `~/.config/labwc/autostart` con
`bash /home/pi/CALCU/raspberry/kiosco/kiosk.sh &` al final — avisame si
es tu caso y te lo dejo armado así en vez de LXDE.)

## 3) Instalar unclutter (oculta el cursor del mouse)

```bash
sudo apt update && sudo apt install -y unclutter
```

## 4) Copiar el autostart

```bash
mkdir -p ~/.config/lxsession/LXDE-pi
cp ~/CALCU/raspberry/kiosco/autostart ~/.config/lxsession/LXDE-pi/autostart
chmod +x ~/CALCU/raspberry/kiosco/kiosk.sh
```

Si tu usuario o la ruta del repo no son `pi` / `/home/pi/CALCU`, editá
la línea `@bash /home/pi/CALCU/...` del `autostart` copiado antes de
seguir.

## 5) De dónde sirve la página

`kiosk.sh` apunta por defecto a `http://localhost/cobro-qr/index.html`
— es decir, espera que el sitio esté servido localmente en la propia
Raspberry (por ejemplo con `server.ps1`/`server.bat` adaptado a Linux, o
cualquier servidor estático apuntando a la carpeta del repo). Esto evita
que, si se corta internet, la pantalla se quede en blanco — aunque igual
va a hacer falta internet para que el QR y el estado del pago
funcionen.

Si preferís apuntar directo al sitio publicado (GitHub Pages,
`calculadora.frigoinsumos.com`), cambiá la variable `URL` dentro de
`kiosk.sh` por esa dirección.

## 6) Reiniciar y probar

```bash
sudo reboot
```

Debería arrancar directo en la pantalla de cobro, a pantalla completa,
sin cursor visible. Para salir del kiosco durante pruebas: `Alt+F4`
cierra Chromium, pero el script lo vuelve a abrir en 1 segundo — para
frenarlo de verdad, entrá por SSH y matá el proceso `kiosk.sh`
(`pkill -f kiosk.sh`) o comentá esa línea del `autostart` temporalmente.

## Extra: apagar el monitor de noche (opcional)

Si la máquina no funciona 24hs y preferís apagar la pantalla en horario
de cierre para cuidarla, se puede agregar un cronjob con `vcgencmd
display_power 0` / `1` a las horas que quieras — avisame si te interesa
y te lo dejo armado.
