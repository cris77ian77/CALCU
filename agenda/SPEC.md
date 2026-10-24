# Especificación y evidencia

Los tags distinguen requisitos confirmados de decisiones de implementación. La fuente de CONFIRMED es el pedido del usuario; no se usaron código ni recursos de Calendly.

| Evidencia | Definición |
| --- | --- |
| CONFIRMED | Cristián Polla, Refrigeración Polair SRL, Rosario, Argentina. |
| CONFIRMED | Evento «Reunión Informativa», duración 30 minutos, Google Meet. |
| CONFIRMED | Descripción literal: «Reunión de 30 minutos para conversar sobre tu proyecto de fábrica de hielo. Vemos juntos qué equipo se ajusta mejor (producción diaria, espacio, inversión), resolvemos dudas técnicas y, si querés, armamos un número estimado de retorno. Sin compromiso. Si tenés fotos del lugar o ya pensaste en una zona, traelas a mano.» |
| CONFIRMED | Nombre y email obligatorios. Preguntas obligatorias: «¿De dónde sos?», «¿Ya fabricás hielo o querés emprender?», «Número de WhatsApp». Invitados por email opcionales. |
| CONFIRMED | Logo en agenda/logo.png. Color #8247f5. |
| CONFIRMED | Ventana de 15 días. Lunes a viernes, inicios a la hora de 09:00 a 16:00. Se excluyen ocupados y pasado. |
| INFERENCE | Se interpreta 17:00 como límite general de jornada; el último inicio confirmado es 16:00 y termina 16:30. No se agrega 16:30 ni 17:00. |
| INFERENCE | Aviso mínimo de 2 horas; parámetro explícito solicitado, tratado como supuesto operativo a validar por el negocio. Se permite igualdad exacta. |
| INFERENCE | Zona exacta America/Argentina/Buenos_Aires. La ventana incluye hoy en Rosario y los 14 días siguientes, incluso fines de semana. Se usa UTC−03:00 para construir los horarios (regla vigente de Argentina); Intl/Utilities determinan la fecha local. Un cambio legal de huso requiere revisar esa construcción. |
| INFERENCE | Hasta 5 invitados adicionales, emails sin duplicados al crear el evento. |

## Contrato

GET `?action=slots&from=YYYY-MM-DD&to=YYYY-MM-DD`: `{ok:true,timeZone,slots:[{start,end,date}]}`. Fechas de turno en ISO UTC; `date` corresponde a Rosario. El servidor recorta al rango permitido.

POST JSON con Content-Type `text/plain`: `{start,name,email,location,experience,whatsapp,guests:[]}`. Respuesta `{ok:true,start,end,meetUrl,eventId}` o `{ok:false,error}`. ContentService devuelve errores de aplicación en JSON; el cliente verifica `ok`.

El bloqueo serializa las reservas de este proyecto de Apps Script. Las ediciones externas de Google Calendar no comparten el bloqueo: se vuelve a consultar Freebusy inmediatamente antes de insertar, pero no existe una transacción atómica con escritores externos.

Modo mock: sin backend o con `?mock=1`, genera turnos locales y simula reservas en memoria de la pestaña. No consulta Google ni envía invitaciones. Los turnos se regeneran al recargar.
