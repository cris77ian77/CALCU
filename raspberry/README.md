# Dispensador — Raspberry Pi

Script que corre en la Raspberry Pi (la misma que muestra el QR en modo
kiosco) y acciona un relé conectado al motor/traba de la expendedora
cuando un cobro se aprueba en Mercado Pago.

No hace falta ESP32 ni ningún otro controlador: usa los pines GPIO de la
propia Raspberry.

## Wiring

- Módulo relé (1 canal, 5V, tipo "active-low" — son los más comunes)
  conectado a: `5V`, `GND` y el pin `GPIO17` (BCM) de la Raspberry.
- La salida del relé (COM + NO, "normalmente abierto") va en serie con el
  cableado del motor/solenoide que dispara la entrega del producto —
  como si el relé fuera un interruptor que el script aprieta por vos.
- Si tu módulo de relé es "active-high" (se activa con 3.3V en vez de con
  GND), poné `RELAY_ACTIVO_EN_BAJO = False` en `dispensar.py`.
- Si usás otro pin GPIO, cambiá `RELAY_PIN` en `dispensar.py` (usa
  numeración BCM, no la física de la placa).

## Instalación

```bash
# 1) Clonar el repo en la Raspberry (o copiar solo esta carpeta)
git clone https://github.com/cris77ian77/CALCU.git ~/CALCU
cd ~/CALCU/raspberry

# 2) Entorno virtual e instalación de dependencias
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
deactivate

# 3) Credenciales de Firebase (Admin SDK)
#    Firebase Console → ⚙️ Configuración del proyecto → Cuentas de servicio
#    → "Generar nueva clave privada" → descarga un .json
#    Copiar ese archivo a esta carpeta con el nombre exacto:
#    ~/CALCU/raspberry/service-account.json
#    (NUNCA subir este archivo a git — ya está en .gitignore)

# 4) Probar el script a mano antes de instalarlo como servicio
python3 dispensar.py
#    Generá un cobro de prueba desde cobro-qr/index.html y pagalo con
#    credenciales de TEST de Mercado Pago: el relé debería accionarse
#    apenas la pantalla muestre "✔ Pago aprobado".

# 5) Instalarlo como servicio para que arranque solo con la Raspberry
sudo cp dispensador.service /etc/systemd/system/dispensador.service
sudo systemctl daemon-reload
sudo systemctl enable --now dispensador.service

# Ver logs en vivo:
journalctl -u dispensador.service -f
```

Si el usuario del sistema o la ruta de instalación no son `pi` /
`/home/pi/CALCU`, ajustá `User` y las rutas dentro de
`dispensador.service` antes del paso 5.

## Cómo funciona

1. La pantalla de cobro (`cobro-qr/index.html`) crea un documento en
   `cobros/{id}` con `estado: "pendiente"` y `dispensado: false`.
2. Cuando Mercado Pago confirma el pago, la Cloud Function `webhookMP`
   pone `estado: "aprobado"`.
3. Este script tiene un listener en tiempo real de Firestore sobre los
   cobros con `estado == "aprobado"` y `dispensado == false`.
4. Apenas detecta uno, hace una transacción para marcarlo
   `dispensado: true` (evita accionar el relé dos veces si el mismo
   evento llega repetido) y dispara el relé por `PULSO_SEGUNDOS`
   (2 segundos por defecto — ajustable en `dispensar.py`).

## Seguridad

El script usa credenciales de **Admin SDK**, que no pasan por las reglas
de Firestore (`firestore.rules`) — por eso puede escribir `dispensado`
aunque esas reglas bloqueen la escritura desde el navegador. Guardá
`service-account.json` con cuidado: quien tenga ese archivo tiene acceso
total al proyecto de Firebase.
