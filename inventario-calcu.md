# CALCU

## Función
Sitio de calculadoras/simuladores financieros para Polair (fabricante de máquinas de hielo y equipos de refrigeración industrial). Sirve para que un cliente potencial simule el flujo de fondos de instalar una fábrica de hielo (o una máquina vending, o una cámara de frío) con distintos modelos de equipo, y para que Polair haga seguimiento comercial de esos leads desde un panel admin.

## Qué se pidió originalmente
No se pudo determinar con precisión un pedido inicial único — el primer commit visible (`Create CNAME`) ya asume el dominio `calculadora.frigoinsumos.com` publicado, y la calculadora principal de flujo de fondos ya existía. El proyecto creció por partes agregadas incrementalmente (auth, panel admin, campañas, vending, boletín, cámara de frío), sin un documento de alcance original.

## Conectores / integraciones
- **Firebase** (Authentication + Firestore) — login de usuarios y guardado de sesiones/leads (`auth/firebase-config.js`, proyecto `calcula-tu-maquina`)
- **Microsoft Clarity** — analítica de comportamiento de usuario (tag `xuo46dsmox`), presente en `index.html`, `vending.html`, `simple/index.html`
- **EmailJS** — mencionado en historial de commits (`chore: eliminar logs de debug de EmailJS`), no se pudo confirmar si sigue activo en el código actual
- **SheetJS** (CDN) y **Chart.js** (CDN) — usados en `admin/index.html` para exportar Excel y graficar
- **GitHub Pages** (implícito por `CNAME`) — el sitio se publica en `calculadora.frigoinsumos.com`

## Información que usa
- Inputs del usuario en las calculadoras: precio del dólar, costo de cámara, alquiler, precio de kWh, sueldo de empleado, precio de venta del hielo, % de otros costos, modelo de máquina elegido, forma de pago
- Sesiones de uso (duración, cantidad de recálculos, valores finales) guardadas en Firestore para seguimiento comercial
- `produccion_polair.xlsx` — planilla de datos de producción (no se pudo determinar si el sitio la lee en tiempo de ejecución o es solo referencia/backup)
- Leads de campañas de WhatsApp importados a Firestore (`campana-import/index.html`, un importador puntual de 632 leads de julio 2026)

## Herramientas y tecnologías
HTML/CSS/JavaScript vanilla (sin build ni framework, todo `<script type="module">` directo en el navegador), Firebase SDK v10.14.1 vía CDN, PowerShell (`server.ps1`/`server.bat` para servidor local de desarrollo, `read_xl.ps1` para leer el Excel de producción vía COM de Excel — solo corre en Windows).

## Contexto general
Proyecto **activo**, con actividad de commits reciente y continua (último commit 2026-08-31). Es un sitio multi-página que fue creciendo orgánicamente:

- `index.html` / `simple/index.html` — calculadora de fábrica de hielo (dos versiones: completa y "explicada")
- `vending.html` / `vending/index.html` — simulador para máquina vending MV-450
- `camara.html` — calculadora de cámara de frío
- `admin/` — panel de administración con login separado (export a Excel, gráficos, gestión de usuarios y campañas)
- `boletin/` — landing/boletín de producto (Roll Ice I-1.500)
- `campana-import/` — herramienta puntual de importación de leads (probablemente descartable una vez usada, ligada a una campaña específica de julio 2026)
- `acompanamiento/` — landing de otro producto/servicio ("De la Idea a la Fábrica con Rentabilidad Real")
- `privacy/` — página de política de privacidad, agregada para integración con "OpenClaw" (mencionado en commit `42d4ea3`, no se pudo determinar qué es OpenClaw en este contexto)

Un commit reciente (`a6a139f` → revertido en `4bccbd6`) agregó y luego sacó scripts de análisis de cámaras de seguridad (descarga de DVR + detección de presencia por video) — quedó claro que no correspondían a este repo y se movieron al entorno local del usuario.

**Posible punto de atención:** la clave de Firebase en `auth/firebase-config.js` está commiteada en texto plano en el repo (es la práctica común para apps cliente de Firebase, protegida por las reglas de Firestore, pero vale confirmar que esas reglas de seguridad estén bien restringidas en producción).
