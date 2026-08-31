"""
Analiza un video de cámara de seguridad, tomando una captura cada N segundos
(por defecto 60 = 1 minuto), detecta si hay una persona en el puesto de
trabajo (una zona del cuadro que vos delimitás) y calcula cuánto tiempo
estuvo presente vs. ausente.

Requisitos:
    pip install ultralytics opencv-python

La primera vez que corras esto, ultralytics descarga automáticamente el
modelo yolov8n.pt (~6 MB), necesita internet esa única vez.

Uso básico:
    python analizar_presencia.py video.mp4

    Se va a abrir una ventana con el primer frame del video para que
    marques con el mouse la zona del puesto de trabajo (ROI). Arrastrá un
    rectángulo y apretá ENTER (o "c" para cancelar y usar el cuadro
    completo).

Uso con más opciones:
    python analizar_presencia.py video.mp4 --intervalo 60 --confianza 0.4 \
        --salida reporte

Salida:
    - reporte.csv          -> timestamp, presente (Sí/No), confianza
    - reporte_resumen.txt  -> totales y % de tiempo presente/ausente
    - capturas/            -> (opcional, con --guardar-capturas) imágenes
                               de cada muestra con la detección marcada
"""

import argparse
import csv
import os
from datetime import timedelta

import cv2
from ultralytics import YOLO

PERSON_CLASS_ID = 0  # clase "person" en el dataset COCO usado por YOLOv8


def seleccionar_roi(frame):
    print("\nMarcá con el mouse la zona del puesto de trabajo.")
    print("Arrastrá un rectángulo y apretá ENTER o ESPACIO para confirmar.")
    print("Si no marcás nada (click sin arrastrar), se analiza el cuadro completo.\n")
    roi = cv2.selectROI("Marcar puesto de trabajo - ENTER para confirmar", frame, showCrosshair=True)
    cv2.destroyAllWindows()
    x, y, w, h = roi
    if w == 0 or h == 0:
        return None  # sin ROI = frame completo
    return (int(x), int(y), int(x + w), int(y + h))


def centro_en_roi(box, roi):
    x1, y1, x2, y2 = box
    cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
    rx1, ry1, rx2, ry2 = roi
    return rx1 <= cx <= rx2 and ry1 <= cy <= ry2


def formatear_tiempo(segundos):
    return str(timedelta(seconds=int(segundos)))


def main():
    ap = argparse.ArgumentParser(description="Analiza presencia en video de cámara de seguridad")
    ap.add_argument("video", help="ruta al archivo de video (.mp4, .avi, .dav convertido, etc.)")
    ap.add_argument("--intervalo", type=int, default=60, help="segundos entre cada captura (default: 60)")
    ap.add_argument("--confianza", type=float, default=0.4, help="confianza mínima de detección (default: 0.4)")
    ap.add_argument("--salida", default="reporte", help="prefijo de los archivos de salida (default: reporte)")
    ap.add_argument("--sin-roi", action="store_true", help="no pedir selección de zona, analizar el cuadro completo")
    ap.add_argument("--guardar-capturas", action="store_true", help="guardar cada captura analizada con la detección marcada")
    args = ap.parse_args()

    if not os.path.exists(args.video):
        raise SystemExit(f"No se encontró el video: {args.video}")

    cap = cv2.VideoCapture(args.video)
    if not cap.isOpened():
        raise SystemExit(f"No se pudo abrir el video: {args.video}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 25
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duracion_seg = total_frames / fps
    print(f"Video: {args.video}")
    print(f"Duración aproximada: {formatear_tiempo(duracion_seg)} ({fps:.1f} fps)")

    roi = None
    if not args.sin_roi:
        ok, primer_frame = cap.read()
        if ok:
            roi = seleccionar_roi(primer_frame)
            if roi:
                print(f"Zona marcada: {roi}")
            else:
                print("No se marcó zona, se analiza el cuadro completo.")

    print("\nCargando modelo de detección (YOLOv8n)...")
    model = YOLO("yolov8n.pt")

    if args.guardar_capturas:
        os.makedirs("capturas", exist_ok=True)

    filas = []
    t = 0.0
    while t < duracion_seg:
        frame_idx = int(t * fps)
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
        ok, frame = cap.read()
        if not ok:
            break

        resultados = model(frame, classes=[PERSON_CLASS_ID], conf=args.confianza, verbose=False)[0]

        presente = False
        mejor_confianza = 0.0
        for box in resultados.boxes:
            xyxy = box.xyxy[0].tolist()
            conf = float(box.conf[0])
            if roi is None or centro_en_roi(xyxy, roi):
                presente = True
                mejor_confianza = max(mejor_confianza, conf)

        filas.append({
            "segundo": int(t),
            "timestamp": formatear_tiempo(t),
            "presente": presente,
            "confianza": round(mejor_confianza, 2),
        })

        estado = "presente" if presente else "AUSENTE"
        print(f"  {formatear_tiempo(t)}  ->  {estado}" + (f" ({mejor_confianza:.2f})" if presente else ""))

        if args.guardar_capturas:
            anotado = resultados.plot()
            if roi:
                cv2.rectangle(anotado, (roi[0], roi[1]), (roi[2], roi[3]), (0, 255, 255), 2)
            cv2.imwrite(f"capturas/{int(t):06d}s.jpg", anotado)

        t += args.intervalo

    cap.release()

    # ── Guardar CSV ──
    csv_path = f"{args.salida}.csv"
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["segundo", "timestamp", "presente", "confianza"])
        writer.writeheader()
        writer.writerows(filas)

    # ── Calcular resumen ──
    total_muestras = len(filas)
    muestras_presente = sum(1 for r in filas if r["presente"])
    muestras_ausente = total_muestras - muestras_presente

    tiempo_presente = muestras_presente * args.intervalo
    tiempo_ausente = muestras_ausente * args.intervalo
    pct_presente = (muestras_presente / total_muestras * 100) if total_muestras else 0
    pct_ausente = 100 - pct_presente

    resumen = (
        f"Video analizado: {args.video}\n"
        f"Duración total: {formatear_tiempo(duracion_seg)}\n"
        f"Intervalo de muestreo: cada {args.intervalo} s\n"
        f"Total de muestras: {total_muestras}\n\n"
        f"Tiempo PRESENTE en el puesto: {formatear_tiempo(tiempo_presente)}  ({pct_presente:.1f}%)\n"
        f"Tiempo AUSENTE del puesto:   {formatear_tiempo(tiempo_ausente)}  ({pct_ausente:.1f}%)\n"
    )
    print("\n" + "=" * 50)
    print(resumen)

    resumen_path = f"{args.salida}_resumen.txt"
    with open(resumen_path, "w", encoding="utf-8") as f:
        f.write(resumen)

    print(f"CSV detallado guardado en: {csv_path}")
    print(f"Resumen guardado en: {resumen_path}")
    if args.guardar_capturas:
        print("Capturas guardadas en: capturas/")


if __name__ == "__main__":
    main()
