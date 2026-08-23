// ============================================================
// Cobros con QR de Mercado Pago — Cloud Functions (2ª gen)
// ============================================================
// Qué hace:
//   1) crearCobro   (callable) — genera un cobro y una preferencia de
//                     pago en Mercado Pago; el frontend arma el QR con
//                     la URL de pago (init_point) que devuelve.
//   2) webhookMP    (HTTP)     — recibe las notificaciones de Mercado
//                     Pago, confirma el pago contra su API y actualiza
//                     el estado del cobro en Firestore.
//
// El frontend (cobro-qr/index.html) escucha el documento en Firestore
// en tiempo real, así que no hace falta ninguna función más para
// consultar el estado.
//
// ── Configuración necesaria antes de deployar ─────────────────
//   firebase functions:secrets:set MP_ACCESS_TOKEN
//   firebase functions:secrets:set MP_WEBHOOK_SECRET   (opcional pero recomendado)
//
//   MP_ACCESS_TOKEN: Access Token de producción (o de prueba) de la
//     cuenta de Mercado Pago que va a cobrar. Se obtiene en
//     https://www.mercadopago.com.ar/developers/panel/app
//   MP_WEBHOOK_SECRET: "Clave secreta" que Mercado Pago muestra en la
//     configuración de esa misma webhook, para validar que las
//     notificaciones realmente vienen de Mercado Pago.
//
//   Deploy: firebase deploy --only functions,firestore:rules
// ============================================================

const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const crypto = require('crypto');

admin.initializeApp();
const db = admin.firestore();

const MP_ACCESS_TOKEN = defineSecret('MP_ACCESS_TOKEN');
const MP_WEBHOOK_SECRET = defineSecret('MP_WEBHOOK_SECRET');

// Región donde se despliegan las funciones. Si se cambia acá, también
// cambia la URL del webhook que se le pasa a Mercado Pago.
const REGION = 'us-central1';

// Dominio público del sitio (ver CNAME), usado para las páginas de
// vuelta luego de pagar desde el checkout de Mercado Pago.
const SITE_URL = 'https://calculadora.frigoinsumos.com';

function clienteMP(accessToken) {
  return new MercadoPagoConfig({ accessToken, options: { timeout: 8000 } });
}

function urlFunciones(projectId) {
  return `https://${REGION}-${projectId}.cloudfunctions.net`;
}

// ── 1) Crear un cobro y su QR de pago ──────────────────────────
exports.crearCobro = onCall({ secrets: [MP_ACCESS_TOKEN], region: REGION }, async (request) => {
  const { monto, descripcion } = request.data || {};
  const montoNum = Number(monto);

  if (!Number.isFinite(montoNum) || montoNum <= 0) {
    throw new HttpsError('invalid-argument', 'El monto debe ser un número mayor a 0.');
  }
  if (montoNum > 10_000_000) {
    throw new HttpsError('invalid-argument', 'El monto ingresado es demasiado alto.');
  }

  const desc = String(descripcion || 'Cobro Portal de Hielo').trim().slice(0, 200) || 'Cobro Portal de Hielo';
  const projectId = process.env.GCLOUD_PROJECT;
  const cobroRef = db.collection('cobros').doc();
  const cobroId = cobroRef.id;
  const expira = new Date(Date.now() + 30 * 60 * 1000); // el QR vale 30 min

  const preference = new Preference(clienteMP(MP_ACCESS_TOKEN.value()));
  let pref;
  try {
    pref = await preference.create({
      body: {
        items: [{
          id: cobroId,
          title: desc,
          quantity: 1,
          currency_id: 'ARS',
          unit_price: montoNum,
        }],
        external_reference: cobroId,
        notification_url: `${urlFunciones(projectId)}/webhookMP`,
        back_urls: {
          success: `${SITE_URL}/cobro-qr/gracias.html?cobro=${cobroId}`,
          pending: `${SITE_URL}/cobro-qr/gracias.html?cobro=${cobroId}`,
          failure: `${SITE_URL}/cobro-qr/gracias.html?cobro=${cobroId}`,
        },
        auto_return: 'approved',
        expires: true,
        expiration_date_to: expira.toISOString(),
      },
    });
  } catch (err) {
    logger.error('Error creando preferencia en Mercado Pago', err);
    throw new HttpsError('internal', 'No se pudo generar el cobro en Mercado Pago.');
  }

  await cobroRef.set({
    monto: montoNum,
    descripcion: desc,
    estado: 'pendiente',
    dispensado: false, // lo marca en true el script de la Raspberry al accionar el relé
    preferenceId: pref.id,
    initPoint: pref.init_point,
    creadoEn: admin.firestore.FieldValue.serverTimestamp(),
    expiraEn: admin.firestore.Timestamp.fromDate(expira),
  });

  return { cobroId, initPoint: pref.init_point };
});

// ── 2) Webhook de Mercado Pago ──────────────────────────────────
exports.webhookMP = onRequest({ secrets: [MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET], region: REGION }, async (req, res) => {
  try {
    const dataId = req.query['data.id'] || req.query.id || (req.body && req.body.data && req.body.data.id);
    const type = req.query.type || req.query.topic || (req.body && req.body.type);

    // Validación de firma — evita procesar notificaciones falsas.
    // https://www.mercadopago.com.ar/developers/es/docs/checkout-api/additional-content/security/signature
    const secret = MP_WEBHOOK_SECRET.value();
    if (secret) {
      const xSignature = req.get('x-signature');
      const xRequestId = req.get('x-request-id');
      if (!xSignature || !dataId) {
        res.status(400).send('Falta firma o data.id');
        return;
      }
      const partes = Object.fromEntries(
        xSignature.split(',').map((p) => p.trim().split('=')).filter((p) => p.length === 2)
      );
      const manifest = `id:${dataId};request-id:${xRequestId};ts:${partes.ts};`;
      const hmac = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
      if (hmac !== partes.v1) {
        logger.warn('Firma de webhook de Mercado Pago inválida', { dataId });
        res.status(401).send('Firma inválida');
        return;
      }
    }

    if (type !== 'payment' || !dataId) {
      res.status(200).send('ok'); // otros tipos de eventos: los ignoramos igual con 200
      return;
    }

    const paymentApi = new Payment(clienteMP(MP_ACCESS_TOKEN.value()));
    const pago = await paymentApi.get({ id: dataId });

    const cobroId = pago.external_reference;
    if (!cobroId) {
      res.status(200).send('ok');
      return;
    }

    const estadoMap = {
      approved: 'aprobado',
      pending: 'pendiente',
      in_process: 'pendiente',
      rejected: 'rechazado',
      cancelled: 'cancelado',
      refunded: 'reembolsado',
      charged_back: 'contracargo',
    };

    await db.collection('cobros').doc(cobroId).set({
      estado: estadoMap[pago.status] || pago.status,
      pagoId: pago.id,
      metodoPago: pago.payment_method_id || null,
      montoPagado: pago.transaction_amount ?? null,
      pagadorEmail: (pago.payer && pago.payer.email) || null,
      actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    res.status(200).send('ok');
  } catch (err) {
    logger.error('Error procesando webhook de Mercado Pago', err);
    // 500 para que Mercado Pago reintente la notificación más tarde.
    res.status(500).send('error');
  }
});
