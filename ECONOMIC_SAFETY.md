# Protección económica y modelo de costes

Revisión: 8 de septiembre de 2026. Las cantidades internas son estimaciones de
aplicación; no sustituyen el panel ni la factura del proveedor.

## Diagnóstico

Antes de esta fase, una cuenta gratuita podía reservar hasta 50 GiB y repetir un
ZIP que recorría R2 → Railway → cliente en cada descarga. La comprobación de
cuota ocurría antes de insertar, de modo que dos solicitudes cercanas podían
superar el límite. Tampoco existían interruptores independientes, reservas de
cuota, límite global de concurrencia ni métricas económicas agregadas.

El riesgo principal no era R2 egress —R2 no cobra egress— sino CPU y egress de
Railway al comprimir y reenviar repetidamente, además del almacenamiento
permanente de galerías y del abuso mediante cuentas múltiples.

## Límites implantados

| Cuenta | Transferencia | Subidas/mes | Temporales simultáneas | Subidas simultáneas | ZIP | ZIP/mes |
|---|---:|---:|---:|---:|---:|---:|
| Invitado | 2 GiB | 5 GiB por navegador | 5 GiB por navegador | 1 | Según acceso público | Según acceso público |
| Gratis | 5 GiB | 5 GiB | 5 GiB | 1 | 1 GiB | 1 trabajo / 1 GiB |
| Creador (4,99 €) | 25 GiB | 250 GiB | 50 GiB | 2 | 5 GiB | 5 trabajos / 10 GiB |
| Pro (9,99 €) | 50 GiB | 1 TiB | 250 GiB | 4 | 10 GiB | 20 trabajos / 50 GiB |

La subida anónima usa una sesión temporal sin acceso al panel. Tiene un máximo
predeterminado de 2 GiB por envío, conserva la cuota gratuita de 5 GiB por
navegador y añade topes compartidos de 25 GiB almacenados y 100 GiB subidos al
mes. Estos contadores son defensas de aplicación y una persona puede intentar
eludir la cuota borrando cookies; el rate limiting y los umbrales globales siguen
siendo necesarios. Los 50 GiB permanecen como capacidad técnica del plan Pro.

Globalmente se admiten por defecto 8 subidas, 2 ZIP y 2 conversiones simultáneas, 2 TiB subidos
al mes, 250 GiB temporales activos, 4 TiB de descargas estimadas, 250 GiB
procesados en ZIP, 1.000 ZIP y 5.000 errores. Todas las cifras son configurables.

Las reservas de subida se realizan dentro de `BEGIN IMMEDIATE` en SQLite. Una
reserva se transforma de forma idempotente en consumo al completar; cancelar o
caducar una subida libera la reserva. La concesión de tres horas se renueva con
cada petición de bloques, por lo que una subida de 50 GiB puede continuar
mientras tenga actividad sin dejar multipart abandonados indefinidamente. Este
diseño requiere una sola instancia,
como el resto de la aplicación actual.

## Recorrido de bytes

| Operación | ¿Pasa el archivo por Railway? | Motivo |
|---|---|---|
| Multipart de transferencia | No | El navegador sube a una URL R2 firmada. |
| Archivo individual de transferencia R2 | No | Railway solo emite una redirección firmada. |
| ZIP de transferencia R2 | Una vez al crearlo | Railway lee los objetos y sube un único ZIP temporal a R2; después se reutiliza y descarga directo. |
| Galería: original R2 individual | No | URL R2 firmada. |
| Galería: original local o calidad reducida | Sí | El archivo/preview reside en el volumen de Railway. |
| ZIP de galería | Sí | El ZIP aún se crea al vuelo; queda limitado por plan y concurrencia. |
| Convertir transferencia R2 → galería R2 | No para el original si `CopyObject` está autorizado | R2 copia internamente; Railway lee 64 bytes de firma y una copia de cada imagen para crear su miniatura. |
| Conversión con copia R2 no autorizada | Sí, una vez | Se usa streaming secuencial R2 → Railway → R2 como recuperación compatible. |

No se comprimen archivos ya comprimidos: `archiver` usa modo `store`. Esto
reduce CPU y hace que el coste dependa principalmente de mover bytes.

## Interruptores y procedimiento de emergencia

- `PHOCLOUD_ACCEPT_NEW_TRANSFERS=false`: rechaza nuevas reservas, pero conserva
  las transferencias existentes, sus descargas y todo el acceso administrativo.
- `PHOCLOUD_GUEST_TRANSFERS_ENABLED=false`: pausa solo los envíos nuevos sin
  cuenta; las cuentas registradas y todos los enlaces existentes siguen funcionando.
- `PHOCLOUD_ZIP_ENABLED=false`: suspende todos los ZIP. Las descargas
  individuales, login, galerías existentes y panel siguen funcionando.
- `PHOCLOUD_CONVERSION_ENABLED=false`: impide reservar conversiones nuevas.
  No cancela trabajos ya reservados ni elimina sus fuentes o destinos.

Procedimiento:

1. Conserva una copia consistente de SQLite y verifica el estado de R2.
2. Activa primero `PHOCLOUD_ZIP_ENABLED=false` si el crecimiento viene de CPU o
   egress; activa además `PHOCLOUD_ACCEPT_NEW_TRANSFERS=false` si crece el
   almacenamiento o hay abuso.
3. Despliega solo esas variables. No borres el volumen, objetos ni tablas.
4. Consulta `GET /operations/economics` con `Authorization: Bearer <token>` y
   compara con Railway Usage y Cloudflare R2 Metrics/Billing.
5. Investiga, ajusta cuotas y vuelve a `true` de una en una.

El endpoint operativo no existe si falta `PHOCLOUD_OPERATIONS_TOKEN` y nunca
devuelve identidades, nombres de archivo ni secretos.

## Proveedor: alerta, límite de aplicación y tope real

- Una alerta avisa; no detiene gasto. Las alertas de presupuesto de Cloudflare
  son informativas y el panel de uso puede llevar retraso. La factura es la
  referencia definitiva.
- Los límites anteriores son controles de la aplicación. Reducen la causa del
  coste sin apagar el servicio, pero no son un tope contractual: fallos, tráfico
  ajeno a la aplicación o discrepancias de medición todavía pueden facturarse.
- Railway ofrece alertas y un **hard usage limit de compute**. Ese límite sí
  detiene workloads al alcanzarse, por lo que también deja la web fuera de
  servicio; debe considerarse última barrera, no el control cotidiano.
- La documentación de R2 consultada ofrece alertas, métricas y cuotas técnicas,
  pero no documenta un tope de facturación que garantice un gasto máximo. No se
  presenta aquí como tal.

Fuentes oficiales: [Railway Pricing](https://docs.railway.com/pricing),
[Railway Cost Control](https://docs.railway.com/pricing/cost-control),
[R2 Pricing](https://developers.cloudflare.com/r2/pricing/),
[R2 Limits](https://developers.cloudflare.com/r2/platform/limits/),
[R2 Metrics](https://developers.cloudflare.com/r2/platform/metrics-analytics/),
[Cloudflare Budget Alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/),
[R2 lifecycle](https://developers.cloudflare.com/r2/buckets/object-lifecycles/).

## Tarifas empleadas y supuestos

- Railway Hobby: mínimo 5 USD/mes con 5 USD de uso incluido; RAM
  10 USD/GB-mes, CPU 20 USD/vCPU-mes, volumen 0,15 USD/GB-mes y egress
  0,05 USD/GB. El periodo parcial accesible (1–8 septiembre de 2026) mostraba
  0,293758 USD; no se extrapola como factura mensual.
- R2 Standard: 0,015 USD/GB-mes, Class A 4,50 USD/millón, Class B
  0,36 USD/millón y egress R2 gratuito. El modelo aplica la conversión
  1 GiB = 1,073741824 GB.
- Conversión ilustrativa: referencia BCE de 1 septiembre 2026,
  1 EUR = 1,1590 USD. La factura real usa su propia fecha y redondeo.
- Stripe: tarjeta estándar EEE 1,5 % + 0,25 € y Billing PAYG 0,7 %. No incluye
  IVA, reembolsos, contracargos ni otros métodos de pago.
- Cada escenario supone una transferencia por usuario/mes, 10 archivos por
  transferencia, retención media de 24 h y partes de 64 MiB. No se inventa uso
  real de R2: no estaba disponible mediante las credenciales accesibles.

Fuentes: [Stripe España](https://stripe.com/es/pricing),
[Stripe Billing](https://stripe.com/es/billing/pricing) y
[referencia BCE](https://www.ecb.europa.eu/stats/shared/pdf/eurofxref.pdf).

## Escenarios de transferencia

Coste variable estimado en EUR para **tres descargas**, sin contar el mínimo ni
CPU/RAM de Railway. `Directa` descarga cada archivo desde R2; `ZIP` crea un ZIP
cacheado una vez y después lo sirve R2.

| Usuarios | Tamaño medio | Directa | ZIP cacheado |
|---:|---:|---:|---:|
| 10 | 1 / 5 / 10 / 50 GiB | 0,01 / 0,03 / 0,05 / 0,26 € | 0,47 / 2,37 / 4,74 / 23,69 € |
| 100 | 1 / 5 / 10 / 50 GiB | 0,05 / 0,26 / 0,53 / 2,63 € | 4,74 / 23,69 / 47,37 / 236,86 € |
| 1.000 | 1 / 5 / 10 / 50 GiB | 0,54 / 2,64 / 5,27 / 26,28 € | 47,39 / 236,88 / 473,75 / 2.368,65 € |
| 10.000 | 1 / 5 / 10 / 50 GiB | 5,42 / 26,44 / 52,71 / 262,84 € | 473,92 / 2.368,83 / 4.737,45 / 23.686,49 € |

Una, tres y diez descargas están calculadas en el resultado completo de
`npm run economics`. Las descargas repetidas casi no cambian el coste directo
porque R2 no cobra egress; sí aumentan operaciones Class B. En ZIP, el coste
dominante es la única creación por Railway, no las descargas repetidas.

Almacenamiento permanente R2, antes de operaciones: 10 / 100 / 1.000 / 10.000
usuarios llenando 50 GiB cuestan aproximadamente 6,95 / 69,48 / 694,83 /
6.948,27 € al mes; llenando 150 GiB, 20,84 / 208,45 / 2.084,48 /
20.844,76 €. Normalmente no todos llenarán su cuota: debe compararse cada mes
con R2 Analytics.

## Margen por plan

Con las tarifas anteriores, Creador deja aproximadamente 4,63 € tras Stripe y
3,94 € si además llena sus 50 GiB de galerías. Pro deja 9,52 € tras Stripe y
7,44 € si llena 150 GiB. Son márgenes de contribución: todavía faltan Railway,
operaciones, ZIP, correo, backups, IVA, soporte, impagos y devoluciones.

Los precios actuales son razonables solo mientras se controle el ZIP y la cuota
de almacenamiento se use de forma estadística, no si cada usuario consume al
máximo de manera constante. Creador no debe recibir ZIP de 25 GiB ilimitados:
cada creación movería unos 26,84 GB desde Railway y costaría alrededor de
1,34 USD solo en egress. El límite implantado de 5 GiB reduce ese riesgo.

Con las cuotas mensuales definitivas, el egress máximo estimado de creación ZIP
es de unos 0,46 € por cuenta Creador (10 GiB/mes) y 2,32 € por cuenta Pro
(50 GiB/mes), antes de operaciones y CPU. Si además se llenase toda la cuota de
galerías, quedarían aproximadamente 3,47 € y 5,12 € respectivamente después de
Stripe, almacenamiento y ese egress ZIP. El umbral global de 250 GiB limita el
egress mensual de todos los ZIP a unos 11,58 € con el cambio usado en este
modelo; no es una garantía de factura y debe compararse con Railway.

## Abuso y decisión para 50 GiB

- Correo verificado dificulta cuentas múltiples, pero no las impide. Antes de
  ampliar Gratis, añade reputación de cuenta, límites por IP/dispositivo,
  CAPTCHA solo ante riesgo y bloqueo de dominios desechables.
- Los enlaces firmados caducan, pero pueden solicitarse repetidamente. Los
  contadores son una señal, no facturación exacta.
- No amplíes Gratis por encima de 5 GiB hasta disponer de al menos 60 días de
  cohortes, percentiles p50/p95 de subida/descarga, coste por usuario y alertas
  probadas. Habilita 50 GiB únicamente para Pro, con R2 directo, ZIP máximo
  10 GiB y margen mensual observado superior a 3 veces el coste variable p95.

## Checklist manual

### Railway

1. Copiar las variables de protección de `.env.example` y generar
   `PHOCLOUD_OPERATIONS_TOKEN` sin reutilizar ninguna clave existente.
2. Configurar una alerta de presupuesto temprana y revisar Usage semanalmente.
3. Configurar un hard compute limit solo si se acepta que al alcanzarlo la web
   se detendrá; dejar margen para backups y limpieza.
4. Mantener una réplica y el volumen persistente; verificar backups antes de
   cada migración.

### Cloudflare R2

1. Mantener privados y separados los buckets de transferencias, galerías y,
   preferiblemente, backups.
2. Configurar CORS solo para el dominio de producción.
3. Configurar `AbortIncompleteMultipartUpload` a 1 día. No aplicar caducidad al
   bucket de galerías.
4. Crear alertas de presupuesto; recordar que no detienen el gasto.
5. Comparar mensualmente R2 Metrics/Analytics y factura con
   `/operations/economics`. Documentar diferencias de redondeo y retraso.

Correo y backups no se presupuestan sin sus planes/consumo reales. Deben añadirse
como líneas separadas en cuanto sus paneles muestren importes facturados.
