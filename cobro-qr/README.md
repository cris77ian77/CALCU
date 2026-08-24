# Cobro con QR de Mercado Pago

Sistema para cobrar mostrando un QR en pantalla (mostrador, tablet, PC). El
cliente lo escanea con la app de Mercado Pago o la cámara del celular, paga,
y la pantalla del comercio se actualiza sola cuando el pago se acredita.

## Cómo funciona

1. `cobro-qr/index.html` — pantalla del comercio: se ingresa el monto y un
   concepto, y arma un QR que apunta al checkout de Mercado Pago
   (Checkout Pro).
2. `functions/index.js` (Cloud Function `crearCobro`) — crea la preferencia
   de pago en Mercado Pago y guarda el cobro en Firestore (`cobros/{id}`)
   con estado `pendiente`.
3. El cliente escanea el QR, paga desde su celular.
4. Mercado Pago notifica el pago a la Cloud Function `webhookMP`, que
   confirma el pago contra la API de Mercado Pago y actualiza el estado del
   cobro en Firestore (`aprobado`, `rechazado`, etc.).
5. `index.html` está escuchando ese documento en tiempo real (Firestore
   `onSnapshot`) y muestra "✔ Pago aprobado" apenas se acredita.
6. `cobro-qr/gracias.html` es la página a la que vuelve el **celular del
   cliente** luego de pagar en Mercado Pago.

No hace falta ningún hardware de Mercado Pago (Point): el QR es simplemente
el link de pago de una preferencia de Checkout Pro.

Si esta pantalla corre en una Raspberry Pi montada en una expendedora
automática, ver `../raspberry/README.md` para accionar el relé que
entrega el producto apenas se aprueba el pago.

## Configuración (una sola vez)

Requiere el CLI de Firebase (`npm i -g firebase-tools`) y una cuenta de
Mercado Pago (Developers → Tus integraciones → Credenciales).

```bash
# 1) Instalar dependencias del backend
cd functions && npm install && cd ..

# 2) Iniciar sesión en Firebase (proyecto: calcula-tu-maquina)
firebase login

# 3) Cargar el Access Token de Mercado Pago como secreto
firebase functions:secrets:set MP_ACCESS_TOKEN
#   → pegar el Access Token (usar el de PRUEBA para testear, el de
#     PRODUCCIÓN cuando esté listo para cobrar de verdad)

# 4) (Recomendado) Cargar la clave secreta del webhook, para validar que
#    las notificaciones realmente vienen de Mercado Pago.
#    Se obtiene en: Developers → Tu app → Webhooks → Configurar
#    notificaciones → "Clave secreta"
firebase functions:secrets:set MP_WEBHOOK_SECRET

# 5) Deployar backend + reglas de Firestore
firebase deploy --only functions,firestore:rules
```

Después del deploy, en el panel de Mercado Pago (Developers → Tu app →
Webhooks) se puede configurar la URL pública que la función `webhookMP`
imprime en `firebase deploy` (con forma
`https://us-central1-calcula-tu-maquina.cloudfunctions.net/webhookMP`) —
aunque no es obligatorio porque `crearCobro` ya le pasa esa URL a Mercado
Pago en cada preferencia (`notification_url`).

## Probar

1. Abrir `cobro-qr/index.html` (subido al hosting, o localmente con
   `server.ps1` / `server.bat`).
2. Ingresar un monto y tocar "Generar QR".
3. Escanear el QR con el celular (con credenciales de **prueba** de
   Mercado Pago se puede pagar con una tarjeta de test, sin plata real).
4. La pantalla debería pasar a "✔ Pago aprobado" en pocos segundos.

## Notas

- El QR vence a los 30 minutos de generado (configurable en
  `functions/index.js`, variable `expira`).
- Los documentos de `cobros/{id}` tienen id aleatorio e impredecible, y las
  reglas de Firestore (`firestore.rules`) no permiten listar la colección
  ni escribir desde el cliente — solo el backend (Admin SDK) puede
  escribir.
- Si se cambia la región de las funciones (`REGION` en
  `functions/index.js`), hay que actualizar también la región usada en
  `getFunctions(app, 'us-central1')` dentro de `cobro-qr/index.html`.
