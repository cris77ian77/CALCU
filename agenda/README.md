# Agenda Polair

Página original de reservas para Cristián Polla. HTML, CSS y JavaScript sin dependencias ni recursos de Calendly. Los horarios se muestran siempre en hora de Rosario. Vive dentro del repo de la calculadora y se publica en https://calculadora.frigoinsumos.com/agenda/ (antes estaba en el repo `agenda-polair`).

## Probar localmente

Desde la raíz del repo ejecutá `python3 -m http.server 8000` y abrí `http://localhost:8000/agenda/`. Si `APPS_SCRIPT_URL` está vacío, se activa el modo demostración. También podés forzarlo agregando `?mock=1`. El aviso visible indica que no se crean eventos ni se envían emails. Las reservas simuladas duran hasta recargar la página.

## Preparar Google Apps Script

1. Iniciá sesión con la cuenta de Google que usará Cristián como organizador y creá un proyecto en Google Apps Script.
2. Copiá `apps-script/Code.gs` al archivo de código del proyecto. Revisá las constantes `SETTINGS` al principio; por defecto se usa el calendario `primary` de esa cuenta.
3. En Configuración del proyecto, activá la opción para mostrar el manifiesto `appsscript.json`. Reemplazalo con `apps-script/appsscript.json`. Incluye zona horaria de Buenos Aires, runtime V8 y servicio avanzado Calendar v3.
4. En Servicios, comprobá que Google Calendar API v3 esté agregado. Si usás un proyecto propio de Google Cloud, habilitá también Google Calendar API en ese proyecto.
5. Seleccioná **Implementar → Nueva implementación → Aplicación web**. Elegí **Ejecutar como: yo** y **Acceso: cualquiera** (incluye usuarios anónimos). Autorizá los permisos de Calendar con la cuenta organizadora. La cuenta debe permitir crear enlaces de Google Meet e invitar asistentes.
6. Copiá la URL de implementación terminada en `/exec`, no la URL de prueba `/dev`. Pegala en `APPS_SCRIPT_URL` dentro de `agenda/config.js`.
7. Probá desde una ventana sin sesión de Google. GET devuelve horarios libres; al reservar se consulta disponibilidad nuevamente bajo `LockService`, se crea el evento de 30 minutos, se solicita Meet y se envían invitaciones al email principal y hasta cinco invitados. El enlace puede tardar en generarse; en ese caso estará en la invitación de Calendar.
8. Al modificar el backend, actualizá la implementación a una versión nueva. Comprobá que la URL guardada siga apuntando a la implementación activa.

El cliente hace GET de horarios y POST con JSON y `Content-Type: text/plain`, sin encabezados adicionales, para evitar preflight CORS. Usá la URL pública `/exec` y permití las redirecciones de ContentService. Si aparece un error de conexión, verificá el acceso anónimo y los permisos de la cuenta. No uses `no-cors`: impide leer la confirmación.

## Publicación

Se publica con el resto del sitio: todo lo que se sube a `main` queda en https://calculadora.frigoinsumos.com/agenda/. Verificá que `agenda/config.js` contenga la URL `/exec`. No hacen falta compilación ni secretos en el frontend; la URL del backend es pública.

## Comprobaciones

Desde la carpeta `agenda/`:

```sh
node tests/slots.test.js
node --check app.js
node --check config.js
node --check slots.js
node --check tests/slots.test.js
node --check < apps-script/Code.gs
```

Las pruebas cubren fines de semana, pasado y aviso de dos horas, límites contiguos y solapamientos, ventana inclusiva de 15 días, zona de Rosario y ocho turnos por día hábil. Los criterios y supuestos se documentan en `SPEC.md`.

Para validar la integración después de desplegar, ocupá un turno en la agenda y comprobá que desaparezca; reservá uno libre con un invitado y verificá el evento, las tres respuestas, Meet y los emails. Dos reservas simultáneas del mismo turno dentro del proyecto deben producir un éxito y un rechazo. El bloqueo no incluye cambios hechos desde otros sistemas sobre Google Calendar. Si la red falla después de enviar una reserva, revisá tu correo y Calendar antes de reintentar.

La API pública permite reservar sin autenticación, como se solicitó; los datos del formulario quedan en el evento privado del organizador y sus asistentes. No se guardan en almacenamiento del navegador. El servicio de Google, sus permisos y el envío real de invitaciones requieren verificación con la cuenta desplegada.
