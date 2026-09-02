# Publicar PHOcloud

PHOcloud está preparado para ejecutarse como una única instancia Node dentro de
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
- `PHOCLOUD_LEGAL_NAME`, `PHOCLOUD_LEGAL_EMAIL` y `PHOCLOUD_LEGAL_COUNTRY`
- `PHOCLOUD_TRANSFER_STORAGE=r2` y las variables `PHOCLOUD_R2_*`

## Transferencias grandes con R2

Crea un bucket privado exclusivo para transferencias temporales y un token que
solo pueda leer y escribir objetos en ese bucket. Configura:

- `PHOCLOUD_R2_ACCOUNT_ID`
- `PHOCLOUD_R2_ACCESS_KEY_ID`
- `PHOCLOUD_R2_SECRET_ACCESS_KEY`
- `PHOCLOUD_R2_BUCKET`

En el bucket, permite CORS desde el dominio exacto que elijas para PHOcloud. Para
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
comprueba el acceso a objetos usando el mismo token restringido que PHOcloud.
La política CORS se aplica con `deployment/r2-cors.json` mediante Wrangler y
la eliminación tras un día se configura en el panel o con Wrangler. `/readyz`
también comprueba el bucket cuando R2 está activo.

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

## Beta económica en Railway

El archivo `railway.json` hace que Railway construya el `Dockerfile`, espere a
`/healthz` y reinicie el proceso si falla. La configuración mínima es:

1. Crea un servicio desde este repositorio.
2. Añade un volumen y móntalo exactamente en `/app/storage`.
3. Copia las variables de `.env.example` en Railway, usando como
   `PHOCLOUD_PUBLIC_URL` el dominio que elijas para PHOcloud.
4. Configura R2 y SMTP antes de cambiar `NODE_ENV` a `production`.
5. Genera primero el dominio temporal de Railway y completa todas las pruebas.
6. Añade el dominio de PHOcloud como dominio personalizado y copia en tu proveedor
   DNS los registros CNAME y TXT que Railway muestre.

No aumentes el número de réplicas: PHOcloud usa SQLite y debe ejecutar una sola
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
