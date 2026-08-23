#!/usr/bin/env python3
# ============================================================
# dispensar.py — Escucha los cobros aprobados en Firestore y
# acciona el relé de la expendedora para entregar el producto.
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
#      Apenas ve uno, acciona el relé y marca dispensado: true
#      (así nunca entrega el producto dos veces por el mismo cobro).
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

RELAY_PIN = 17              # pin BCM al que está conectado el módulo relé
RELAY_ACTIVO_EN_BAJO = True # la mayoría de los módulos de relé son "active-low"
PULSO_SEGUNDOS = 2.0        # cuánto tiempo se mantiene accionado el relé

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("dispensar")


# ── GPIO ─────────────────────────────────────────────────────
def inicializar_relay():
    GPIO.setmode(GPIO.BCM)
    estado_reposo = GPIO.HIGH if RELAY_ACTIVO_EN_BAJO else GPIO.LOW
    GPIO.setup(RELAY_PIN, GPIO.OUT, initial=estado_reposo)


def accionar_relay():
    log.info("Accionando relé por %.1fs…", PULSO_SEGUNDOS)
    activo = GPIO.LOW if RELAY_ACTIVO_EN_BAJO else GPIO.HIGH
    reposo = GPIO.HIGH if RELAY_ACTIVO_EN_BAJO else GPIO.LOW
    GPIO.output(RELAY_PIN, activo)
    time.sleep(PULSO_SEGUNDOS)
    GPIO.output(RELAY_PIN, reposo)
    log.info("Relé vuelto a reposo.")


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
    """Acciona el relé y marca el cobro como dispensado (con transacción,
    así dos eventos casi simultáneos nunca disparan el relé dos veces)."""
    ref = db.collection("cobros").document(cobro_id)

    @firestore.transactional
    def marcar_si_corresponde(transaccion):
        snap = ref.get(transaction=transaccion)
        data = snap.to_dict() or {}
        if data.get("estado") != "aprobado" or data.get("dispensado"):
            return False
        transaccion.update(ref, {
            "dispensado": True,
            "dispensadoEn": firestore.SERVER_TIMESTAMP,
        })
        return True

    transaccion = db.transaction()
    if marcar_si_corresponde(transaccion):
        log.info("Cobro %s aprobado → dispensando producto.", cobro_id)
        accionar_relay()
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
    inicializar_relay()
    db = inicializar_firestore()
    watch = escuchar_cobros(db)
    log.info("Escuchando cobros aprobados en Firestore (pin BCM %s).", RELAY_PIN)

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
