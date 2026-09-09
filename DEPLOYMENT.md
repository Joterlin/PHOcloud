# Publicar Straclase

Straclase está preparado para ejecutarse como una única instancia Node dentro de
Docker, detrás de un proxy con HTTPS y con un volumen persistente. SQLite y los
archivos locales hacen que **no deba ejecutarse en varias instancias** ni en un
servidor cuyo disco se borre al reiniciar.

## Servicios necesarios

1. Un servidor o plataforma de contenedores con volumen persistente.
2. Un dominio con HTTPS terminado por el proveedor o por un proxy inverso.
3. Un proveedor de correo por API HTTPS (o SMTP donde esté permitido) para
   verificación, recuperación y envío de galerías.
4. Una ubicación externa para copiar periódicamente los backups.
5. Monitorización HTTP de `/healthz` y, para disponibilidad interna, `/readyz`.
6. Un bucket Cloudflare R2 para transferencias grandes por bloques.

## Variables obligatorias

Crea `.env.production` a partir de `.env.example` sin subirlo al repositorio.
En producción son obligatorias:

- `NODE_ENV=production`
- `PHOCLOUD_PUBLIC_URL=https://tu-dominio.com`
- `PHOCLOUD_DATABASE_PATH`, `PHOCLOUD_UPLOADS_DIRECTORY` y
  `PHOCLOUD_TRANSFERS_DIRECTORY` dentro del volumen
- `RESEND_API_KEY` y `PHOCLOUD_FROM_EMAIL`; como alternativa, todas las
  variables `SMTP_*` y `PHOCLOUD_FROM_EMAIL`
- `PHOCLOUD_LEGAL_EMAIL` y `PHOCLOUD_LEGAL_COUNTRY`
- `PHOCLOUD_LEGAL_NAME`, `PHOCLOUD_LEGAL_ADDRESS` y `PHOCLOUD_LEGAL_TAX_ID`
  son opcionales y quedan reservadas para un aviso legal revisado; no aparecen en
  Términos ni Privacidad.
- `PHOCLOUD_TRANSFER_STORAGE=r2` y las variables `PHOCLOUD_R2_*`
- `PHOCLOUD_GALLERY_STORAGE=r2`,
  `PHOCLOUD_GALLERY_R2_ACCESS_KEY_ID`,
  `PHOCLOUD_GALLERY_R2_SECRET_ACCESS_KEY` y
  `PHOCLOUD_GALLERY_R2_BUCKET`

## Transferencias grandes con R2

Crea un bucket privado exclusivo para transferencias temporales y un token que
solo pueda leer y escribir objetos en ese bucket. Configura:

- `PHOCLOUD_R2_ACCOUNT_ID`
- `PHOCLOUD_R2_ACCESS_KEY_ID`
- `PHOCLOUD_R2_SECRET_ACCESS_KEY`
- `PHOCLOUD_R2_BUCKET`

En el bucket, permite CORS desde el dominio exacto que elijas para Straclase. Para
una instalación de ejemplo en `https://app.tudominio.com`:

```json
[
  {
    "AllowedOrigins": ["https://app.tudominio.com"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Añade además una regla de ciclo de vida que elimine objetos tras un día. El
servidor borra las transferencias al caducar, y la regla del bucket funciona como
segunda protección si el proceso estuviera apagado en ese momento. No hagas
público el bucket: las subidas y descargas usan enlaces firmados de corta duración.

Con las variables R2 guardadas, ejecuta `npm run configure:r2`. Este comando
comprueba el acceso a objetos usando el mismo token restringido que Straclase.
La política CORS se aplica con `deployment/r2-cors.json` mediante Wrangler y
el aborto de multipart incompletos se define en `deployment/r2-lifecycle.json`:

```text
npx wrangler r2 bucket lifecycle set TU_BUCKET --file deployment/r2-lifecycle.json
```

Este archivo no caduca objetos completos. La eliminación tras 24 horas la hace
la aplicación, conservando una política de recuperación segura. `/readyz`
también comprueba el bucket cuando R2 está activo.

Para límites, métricas, costes y el procedimiento de emergencia consulta
`ECONOMIC_SAFETY.md`. La regla imprescindible y no destructiva para archivos
completos es abortar multipart incompletos al día; no apliques una caducidad al
bucket de galerías.

## Privacidad del titular y correos

No uses la dirección personal del titular en `PHOCLOUD_FROM_EMAIL` ni en
`PHOCLOUD_LEGAL_EMAIL`. El servicio exige que las direcciones visibles sean
profesionales y correspondan al mismo dominio base que `PHOCLOUD_PUBLIC_URL`.
También bloquea dominios personales, `.local`, `.invalid`, dominios de ejemplo y
textos como “pendiente de configurar”.

Los dos correos cumplen funciones diferentes:

- `PHOCLOUD_FROM_EMAIL`: remitente visible de verificaciones, recuperaciones,
  galerías y transferencias. Debe estar autorizado por Resend o por el servidor SMTP.
- `PHOCLOUD_LEGAL_EMAIL`: contacto público de privacidad y asuntos legales. No
  se utiliza como remitente transaccional.
- `PHOCLOUD_SECURITY_EMAIL`: contacto público opcional para `security.txt`.

Pasos en Railway, solo después de crear y probar los buzones del dominio:

1. En Resend, verifica el dominio y confirma que el remitente profesional puede enviar.
2. Comprueba desde otro correo que el buzón legal recibe y permite responder.
3. Abre el servicio de Railway y entra en **Variables** del entorno de producción.
4. Configura `PHOCLOUD_FROM_EMAIL` con el nombre de marca y el remitente verificado.
5. Configura `PHOCLOUD_LEGAL_EMAIL` con el buzón profesional operativo.
6. Añade `PHOCLOUD_LEGAL_COUNTRY` y un correo profesional del dominio en
   `PHOCLOUD_LEGAL_EMAIL`. Conserva los datos de identidad legal fuera de las
   páginas públicas hasta que un profesional determine qué aviso legal necesitas.
7. Añade `PHOCLOUD_LEGAL_REGISTRY` solo si corresponde y
   `PHOCLOUD_SECURITY_EMAIL` solo si atenderás ese canal.
8. Ejecuta `npm run preflight` y `npm run validate` antes de desplegar.
9. Revisa `/privacidad`, `/terminos` y, si se configuró, `/.well-known/security.txt`
   sin iniciar sesión. Confirma también que un correo transaccional muestra el
   remitente profesional y no el correo legal.

No guardes direcciones no operativas “para probar”: las páginas legales y los
correos son información pública. La aplicación no puede determinar por sí sola
qué identidad, domicilio o NIF corresponde publicar; debe confirmarlo un
profesional jurídico o fiscal.

## Galerías permanentes con R2

Usa un segundo bucket privado sin regla de caducidad y una credencial
`Object Read & Write` limitada únicamente a ese bucket. Al activar
`PHOCLOUD_GALLERY_STORAGE=r2`, los originales de las nuevas galerías se
guardan allí. Durante el arranque, las galerías locales existentes se copian a
R2; cada original local se elimina solo después de guardar correctamente el
objeto remoto y su manifiesto. La base de datos, miniaturas y logotipos siguen
en el volumen persistente y deben incluirse en las copias de seguridad.

Ejecuta `npm run preflight` antes de iniciar. El proceso se detendrá si falta una
configuración crítica o si la URL pública no usa HTTPS.

## Contenedor

`Dockerfile` contiene la imagen de producción. `compose.production.yml` ofrece
una configuración endurecida para un servidor propio y publica Node únicamente
en `127.0.0.1:3000`, donde debe recibir tráfico desde el proxy HTTPS.

## Copias de seguridad

`npm run backup` crea una copia consistente de SQLite y copia originales,
miniaturas, logotipos y transferencias vigentes. La retención predeterminada es de 30 días. Programa el
comando diariamente y sincroniza el resultado a otra máquina o almacenamiento;
una copia en el mismo volumen no protege frente a la pérdida total del servidor.

Prueba una restauración antes del lanzamiento: detén el servicio, coloca
`phocloud.db`, `uploads/`, `transfers/` y `branding/` en las rutas configuradas y vuelve a
iniciar. No sobrescribas datos activos sin conservar antes otra copia.

Para copias diarias externas, activa `PHOCLOUD_AUTOMATIC_BACKUPS=true`. De forma
predeterminada se reutilizan el bucket y las credenciales R2 de galerías y se
guardan ZIP privados bajo `_system/backups/`, con 30 días de retención. Para
aislarlas, configura `PHOCLOUD_BACKUP_R2_ACCESS_KEY_ID`,
`PHOCLOUD_BACKUP_R2_SECRET_ACCESS_KEY` y `PHOCLOUD_BACKUP_R2_BUCKET`. El ZIP
incluye una copia consistente de SQLite, miniaturas, metadatos y marcas; los
originales permanecen en el bucket privado de galerías.

## Suscripciones con Stripe

La facturación permanece apagada mientras `PHOCLOUD_BILLING_ENABLED` no sea
`true`. Para probarla utiliza una clave restringida de Stripe en modo test y
configura `STRIPE_CREATOR_PRICE_ID`, `STRIPE_PRO_PRICE_ID` y
`STRIPE_WEBHOOK_SECRET`. El webhook público es `/billing/webhook` y debe recibir
los eventos de Checkout, suscripciones e invoices. Checkout y Customer Portal
se habilitan solo cuando toda la configuración está presente.

No actives `automatic_tax` hasta haber confirmado y configurado los registros
fiscales correspondientes. Antes de cobrar de verdad, sustituye los precios y
la clave de prueba por recursos live, prueba el webhook live y conserva las
claves únicamente como secretos de Railway.

## Beta económica en Railway

El archivo `railway.json` hace que Railway construya el `Dockerfile`, espere a
`/healthz` y reinicie el proceso si falla. La configuración mínima es:

1. Crea un servicio desde este repositorio.
2. Añade un volumen y móntalo exactamente en `/app/storage`.
3. Copia las variables de `.env.example` en Railway, usando como
   `PHOCLOUD_PUBLIC_URL` el dominio que elijas para Straclase.
4. Configura R2 y SMTP antes de cambiar `NODE_ENV` a `production`.
5. Genera primero el dominio temporal de Railway y completa todas las pruebas.
6. Añade el dominio de Straclase como dominio personalizado y copia en tu proveedor
   DNS los registros CNAME y TXT que Railway muestre.

No aumentes el número de réplicas: Straclase usa SQLite y debe ejecutar una sola
instancia. El volumen guarda la base de datos y las galerías; R2 guarda únicamente
las transferencias temporales grandes.

En producción, `/auth/setup` está desactivado. La primera cuenta real se crea
desde el registro normal y debe confirmar su correo.

## Comprobación posterior

Ejecuta `npm run smoke:public` con `PHOCLOUD_PUBLIC_URL` apuntando al dominio
final. Es una comprobación de solo lectura de disponibilidad, R2, login, páginas
legales y cabeceras de seguridad.

- `/healthz` responde `200`.
- Registro, confirmación de correo y recuperación funcionan con un correo real.
- Una galería borrador devuelve `404` para un visitante y permite vista previa a su dueño.
- Una galería publicada abre desde otro dispositivo, acepta contraseña y descarga archivos.
- El envío al cliente llega y no revela la contraseña de la galería.
- Una transferencia protegida permite descarga individual y ZIP, reintenta bloques
  interrumpidos y desaparece al caducar.
- Se ha ejecutado y descargado al menos una copia de seguridad externa.

## Antes de cobrar

Revisa las páginas legales con un profesional, completa un acuerdo de encargo de
tratamiento para fotógrafos y documenta los proveedores que procesan datos. La
integración de pagos debe añadirse después de elegir proveedor y configurar sus
credenciales y webhooks.
