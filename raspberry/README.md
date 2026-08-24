# Dispensador — Raspberry Pi

Script que corre en la Raspberry Pi (la misma que muestra el QR en modo
kiosco) y le carga crédito a la Pukui cuando un cobro se aprueba en
Mercado Pago.

## Probar en tu PC antes de tener la Raspberry

`dispensar.py` detecta solo si `RPi.GPIO` está disponible; si no lo
está (porque no estás en una Raspberry) usa un reemplazo que imprime
los pulsos por consola en vez de mover pines reales — así se puede
probar el flujo completo (Firestore + Mercado Pago + cálculo de
pulsos) desde cualquier PC, sin hardware:

```bash
cd raspberry
python3 -m venv venv
source venv/bin/activate   # en Windows: venv\Scripts\activate
pip install -r requirements.txt
#   ↑ en una PC (no Raspberry), pip salta solo la instalación de
#   RPi.GPIO (requirements.txt ya lo marca solo para ARM) — no
#   hace falta hacer nada especial para que ande en simulado.

# Poné tu service-account.json (ver paso 3 más abajo) y corré:
python3 dispensar.py
```

Vas a ver en la consola algo como:

```
[WARNING] RPi.GPIO no disponible — corriendo en MODO SIMULADO...
[INFO] Cargando crédito: 3 pulsos ($100.00 c/u).
[INFO]   · [SIMULADO] pin 17 → BAJO
[INFO]   · [SIMULADO] pin 17 → ALTO
```

Generá un cobro real desde `cobro-qr/index.html` (podés abrirlo en tu
mismo navegador, en paralelo) y pagalo con credenciales de **test** de
Mercado Pago — vas a ver los pulsos simulados en la consola apenas se
apruebe. Cuando pases esto mismo a la Raspberry con `RPi.GPIO`
instalado, el script detecta el hardware real solo y deja de simular.

## Cómo entiende la Pukui el pago

La máquina no tiene ningún periférico de pago propio para QR — según nos
confirmó el fabricante, la entrada que sí tiene disponible es el
**"impulse point"** del validador de monedas (12V, tipo "impulse"): un
cable que la máquina espera ver cerrado brevemente una vez por cada
"moneda" — la placa cuenta esos pulsos como crédito, igual que si el
cliente hubiera metido monedas de verdad. El cliente elige el producto
con los botones que la máquina ya tiene; nosotros solo simulamos las
monedas.

No hace falta ESP32 ni ningún otro controlador aparte: la Raspberry
manda esos pulsos con sus propios pines GPIO.

## ⚠️ Datos pendientes de confirmar con el fabricante

Antes de conectar esto a la máquina real hacen falta tres datos que
**todavía no tenemos** — están como placeholders en `dispensar.py`,
marcados `TODO CONFIRMAR`:

1. **`VALOR_POR_PULSO_CENTAVOS`** — cuánto crédito representa 1 pulso
   (y si es configurable en el menú de la máquina).
2. **`PULSO_MS` / `PAUSA_ENTRE_PULSOS_MS`** — duración de cada pulso y
   la pausa entre uno y otro que la placa necesita para contarlos bien.
3. **Tipo de señal del "impulse point"**: si es un **contacto seco**
   (la máquina no pone voltaje, espera que vos cierres el circuito — ahí
   alcanza con un relé común) o una **salida activa a 12V** (la máquina
   ya tiene tensión en ese cable y espera que la lleves a GND — ahí hace
   falta un optoacoplador para no conectar 12V directo a un GPIO de
   3.3V y quemarlo).

## Wiring

Con un **optoacoplador** (recomendado — aísla los 3.3V de la Raspberry
de los 12V de la máquina, funciona para los dos casos de arriba):

- Lado de la Raspberry: `GPIO17` (BCM) + `GND` manejan el LED del
  optoacoplador (con su resistencia limitadora, según el módulo).
  Ver también `PULSO_ACTIVO_EN_BAJO` en `dispensar.py` — si el módulo
  es "active-high", ponelo en `False`.
- Lado de la máquina: la salida del optoacoplador (fototransistor) se
  conecta en lugar de donde iría el contacto del validador de monedas
  original, en el "impulse point" de 12V.
- Si usás otro pin GPIO, cambiá `PULSO_PIN` en `dispensar.py` (numeración
  BCM, no la física de la placa).

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

# 4) Antes de nada: completar los 3 datos "TODO CONFIRMAR" en
#    dispensar.py con lo que confirme el fabricante.

# 5) Probar el script a mano antes de instalarlo como servicio
python3 dispensar.py
#    Generá un cobro de prueba desde cobro-qr/index.html y pagalo con
#    credenciales de TEST de Mercado Pago: deberías ver en la consola
#    "Cargando crédito: N pulsos" apenas se apruebe el pago, y la
#    máquina debería reflejar ese crédito igual que con monedas.

# 6) Instalarlo como servicio para que arranque solo con la Raspberry
sudo cp dispensador.service /etc/systemd/system/dispensador.service
sudo systemctl daemon-reload
sudo systemctl enable --now dispensador.service

# Ver logs en vivo:
journalctl -u dispensador.service -f
```

Si el usuario del sistema o la ruta de instalación no son `pi` /
`/home/pi/CALCU`, ajustá `User` y las rutas dentro de
`dispensador.service` antes del paso 6.

## Cómo funciona

1. La pantalla de cobro (`cobro-qr/index.html`) crea un documento en
   `cobros/{id}` con `estado: "pendiente"` y `dispensado: false`.
2. Cuando Mercado Pago confirma el pago, la Cloud Function `webhookMP`
   pone `estado: "aprobado"`.
3. Este script tiene un listener en tiempo real de Firestore sobre los
   cobros con `estado == "aprobado"` y `dispensado == false`.
4. Apenas detecta uno, hace una transacción para marcarlo
   `dispensado: true` (evita cargar el crédito dos veces si el mismo
   evento llega repetido) y manda tantos pulsos como haga falta para
   cubrir el monto pagado (`cargar_credito()` en `dispensar.py`).
5. Si el monto no es múltiplo exacto del valor de un pulso, queda un
   resto sin acreditar (se loguea como advertencia) — por eso conviene
   que la pantalla de cobro solo ofrezca montos múltiplos del valor de
   pulso una vez que lo confirmemos.

## Seguridad

El script usa credenciales de **Admin SDK**, que no pasan por las reglas
de Firestore (`firestore.rules`) — por eso puede escribir `dispensado`
aunque esas reglas bloqueen la escritura desde el navegador. Guardá
`service-account.json` con cuidado: quien tenga ese archivo tiene acceso
total al proyecto de Firebase.
