#!/usr/bin/env python3
# ============================================================
# dispensar.py — Escucha los cobros aprobados en Firestore y le
# manda a la Pukui los pulsos del validador de monedas ("impulse
# coin acceptor", 12V) para cargarle el crédito equivalente.
#
# Corre en la Raspberry Pi que también muestra el QR (Chromium en
# modo kiosco apuntando a cobro-qr/index.html). Este script va
# aparte, como servicio de systemd (ver dispensador.service).
#
# Flujo:
#   1) La pantalla de cobro crea un doc en cobros/{id} (estado: 'pendiente').
#   2) Cuando Mercado Pago confirma el pago, la Cloud Function
#      webhookMP pone estado: 'aprobado'.
#   3) Este script tiene un listener en tiempo real sobre
#      cobros donde estado == 'aprobado' y dispensado == false.
#      Apenas ve uno, manda N pulsos por el pin del optoacoplador/relé
#      conectado al "impulse point" del validador de monedas — la
#      máquina lo interpreta exactamente como si hubieran metido N
#      monedas — y marca dispensado: true (así nunca carga el mismo
#      cobro dos veces). El cliente elige el producto con los botones
#      de siempre; la Pukui dispensa con su propia lógica.
#
# ⚠️ CONFIRMAR CON EL FABRICANTE antes de conectar a la máquina real:
#   - VALOR_POR_PULSO_CENTAVOS: cuánto crédito representa cada pulso.
#   - PULSO_MS / PAUSA_ENTRE_PULSOS_MS: duración del pulso y separación
#     entre pulsos que la placa de la Pukui espera poder leer.
#   - Si el "impulse point" es un contacto seco (relé) o una salida
#     activa a 12V que hay que llevar a GND (optoacoplador) — de eso
#     depende qué módulo poner entre el GPIO y ese cable.
# Los valores de acá abajo son placeholders típicos de validadores de
# monedas por impulso — NO están confirmados para esta máquina.
# ============================================================

import logging
import signal
import sys
import time
from pathlib import Path

import RPi.GPIO as GPIO
import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud.firestore_v1.base_query import FieldFilter

# ── Configuración ───────────────────────────────────────────
CREDENCIALES_JSON = Path(__file__).parent / "service-account.json"

PULSO_PIN = 17                    # pin BCM conectado al módulo optoacoplador/relé
PULSO_ACTIVO_EN_BAJO = True       # True si el módulo es "active-low" (lo más común)

VALOR_POR_PULSO_CENTAVOS = 10000  # TODO CONFIRMAR: $ que representa 1 pulso (acá: $100,00)
PULSO_MS = 100                    # TODO CONFIRMAR: duración de cada pulso
PAUSA_ENTRE_PULSOS_MS = 100       # TODO CONFIRMAR: pausa entre pulso y pulso
MAX_PULSOS_POR_COBRO = 500        # límite de seguridad (evita quedar pulsando por error de config)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("dispensar")


# ── GPIO ─────────────────────────────────────────────────────
def inicializar_pulso():
    GPIO.setmode(GPIO.BCM)
    estado_reposo = GPIO.HIGH if PULSO_ACTIVO_EN_BAJO else GPIO.LOW
    GPIO.setup(PULSO_PIN, GPIO.OUT, initial=estado_reposo)


def _un_pulso():
    activo = GPIO.LOW if PULSO_ACTIVO_EN_BAJO else GPIO.HIGH
    reposo = GPIO.HIGH if PULSO_ACTIVO_EN_BAJO else GPIO.LOW
    GPIO.output(PULSO_PIN, activo)
    time.sleep(PULSO_MS / 1000)
    GPIO.output(PULSO_PIN, reposo)


def cargar_credito(monto_centavos: int):
    """Manda tantos pulsos como haga falta para cargar `monto_centavos`
    de crédito, simulando monedas insertadas."""
    n_pulsos = round(monto_centavos / VALOR_POR_PULSO_CENTAVOS)

    if n_pulsos <= 0:
        log.warning("Monto %s no llega a valer 1 pulso ($%.2f) — no se manda nada.",
                    monto_centavos, VALOR_POR_PULSO_CENTAVOS / 100)
        return
    if n_pulsos > MAX_PULSOS_POR_COBRO:
        log.error("El monto pedía %s pulsos, supera el límite de seguridad (%s). "
                   "Revisá VALOR_POR_PULSO_CENTAVOS antes de seguir.",
                   n_pulsos, MAX_PULSOS_POR_COBRO)
        return

    resto = monto_centavos - n_pulsos * VALOR_POR_PULSO_CENTAVOS
    if resto != 0:
        log.warning("El monto ($%.2f) no es múltiplo exacto del valor de pulso "
                     "($%.2f) — quedan $%.2f de crédito sin acreditar. Conviene que "
                     "la pantalla de cobro solo ofrezca montos múltiplos del pulso.",
                     monto_centavos / 100, VALOR_POR_PULSO_CENTAVOS / 100, resto / 100)

    log.info("Cargando crédito: %s pulsos ($%.2f c/u).", n_pulsos, VALOR_POR_PULSO_CENTAVOS / 100)
    for i in range(n_pulsos):
        _un_pulso()
        if i < n_pulsos - 1:
            time.sleep(PAUSA_ENTRE_PULSOS_MS / 1000)
    log.info("Crédito cargado.")


# ── Firestore ────────────────────────────────────────────────
def inicializar_firestore():
    if not CREDENCIALES_JSON.exists():
        log.error(
            "No se encontró %s. Descargá la clave de cuenta de servicio desde "
            "Firebase Console → Configuración del proyecto → Cuentas de servicio "
            "→ Generar nueva clave privada, y guardala con ese nombre.",
            CREDENCIALES_JSON,
        )
        sys.exit(1)

    cred = credentials.Certificate(str(CREDENCIALES_JSON))
    firebase_admin.initialize_app(cred)
    return firestore.client()


def procesar_cobro(cobro_id: str, db):
    """Manda los pulsos de crédito y marca el cobro como dispensado (con
    transacción, así dos eventos casi simultáneos nunca cargan el
    crédito dos veces)."""
    ref = db.collection("cobros").document(cobro_id)

    @firestore.transactional
    def marcar_si_corresponde(transaccion):
        snap = ref.get(transaction=transaccion)
        data = snap.to_dict() or {}
        if data.get("estado") != "aprobado" or data.get("dispensado"):
            return None
        transaccion.update(ref, {
            "dispensado": True,
            "dispensadoEn": firestore.SERVER_TIMESTAMP,
        })
        return data.get("monto")

    transaccion = db.transaction()
    monto = marcar_si_corresponde(transaccion)
    if monto is not None:
        log.info("Cobro %s aprobado por $%.2f → cargando crédito.", cobro_id, monto)
        cargar_credito(round(monto * 100))  # monto en Firestore está en pesos, no en centavos
    else:
        log.debug("Cobro %s ya estaba dispensado o no está aprobado, se ignora.", cobro_id)


def escuchar_cobros(db):
    consulta = (
        db.collection("cobros")
        .where(filter=FieldFilter("estado", "==", "aprobado"))
        .where(filter=FieldFilter("dispensado", "==", False))
    )

    def on_snapshot(col_snapshot, changes, read_time):
        for cambio in changes:
            if cambio.type.name in ("ADDED", "MODIFIED"):
                try:
                    procesar_cobro(cambio.document.id, db)
                except Exception:
                    log.exception("Error procesando el cobro %s", cambio.document.id)

    return consulta.on_snapshot(on_snapshot)


# ── Main ─────────────────────────────────────────────────────
def main():
    log.info("Iniciando dispensador…")
    inicializar_pulso()
    db = inicializar_firestore()
    watch = escuchar_cobros(db)
    log.info("Escuchando cobros aprobados en Firestore (pin BCM %s).", PULSO_PIN)

    detener = False

    def manejar_salida(signum, frame):
        nonlocal detener
        detener = True

    signal.signal(signal.SIGINT, manejar_salida)
    signal.signal(signal.SIGTERM, manejar_salida)

    try:
        while not detener:
            time.sleep(1)
    finally:
        log.info("Cerrando…")
        watch.unsubscribe()
        GPIO.cleanup()


if __name__ == "__main__":
    main()
