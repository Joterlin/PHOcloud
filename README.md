# Straclase

Plataforma para crear galerías fotográficas privadas y transferir archivos de
trabajo con enlaces seguros, identidad propia y control desde una sola cuenta.

## Iniciar el proyecto

Requisitos: Node.js 24 o superior.

```powershell
npm install
npm start
```

Después abre <http://localhost:3000>. El servidor debe permanecer iniciado
mientras uses la web.

Para ejecutar las pruebas:

```powershell
npm run validate
```

## Qué puede hacer

- Cuenta privada del fotógrafo con sesión persistente.
- Registro de varios fotógrafos, confirmación de correo y recuperación de contraseña.
- Separación completa de cuentas, galerías, fotografías y marcas.
- Plan gratuito con tres galerías activas y 5 GB de almacenamiento.
- Panel de cuenta con consumo de galerías y almacenamiento.
- Crear galerías de hasta 500 fotografías, 50 MB por archivo y 10 GB por entrega.
- Revisar la selección antes de subirla, quitar archivos y elegir una portada.
- Ver el progreso de subida y el procesamiento de la galería.
- Configurar una identidad global con nombre de estudio, logotipo, colores, web y redes sociales.
- Añadir hasta 30 enlaces personalizados por marca o galería, aceptar dominios sin `https://` y ordenarlos libremente.
- Personalizar cada galería de forma independiente y elegir entre estilos mosaico, cuadrícula o editorial.
- Elegir entre cinco portadas, ajustar su encuadre horizontal y vertical y previsualizar el resultado.
- Servir miniaturas optimizadas para navegar con rapidez conservando los originales para la descarga.
- Mensaje, contraseña y caducidad opcionales por entrega.
- Activar o desactivar descargas individuales y descarga ZIP.
- Editar el nombre, el mensaje, los permisos y la privacidad.
- Añadir y quitar fotografías sin crear otra entrega.
- Selección de favoritas del cliente visible para el fotógrafo.
- Descargar fotos individualmente o toda la galería.
- Guardar galerías como borrador, publicarlas o archivarlas.
- Enviar por correo la galería publicada al cliente.
- Registrar cuándo se envió por última vez una entrega.
- Mostrar términos y privacidad configurables y exigir su aceptación al registrarse.
- Crear transferencias independientes de las galerías con cualquier archivo permitido.
- Portada pública en `/` y `/enviar` para subir, obtener un enlace o enviarlo por
  correo sin registro. Usa una identidad temporal no visible, caduca en 24 horas y mantiene
  cuotas, concurrencia, rate limiting e interruptores independientes.
- El envío por enlace no solicita correo. El envío directo por correo confirma al
  remitente con un código de seis dígitos que caduca en 10 minutos y recuerda la
  dirección verificada durante 30 días en esa sesión invitada. El mensaje sale
  desde el dominio de Straclase y usa el remitente confirmado como dirección de respuesta.
- Espacio registrado en `/app`, con una navegación sencilla entre
  Transferencias y Galerías; marca y plan se gestionan desde los controles de cuenta.
- Convertir una transferencia propia en galería sin volver a subir los
  originales: filtra formatos incompatibles, permite elegir portada, conserva
  la transferencia de 24 horas y crea una galería independiente.
- Transferir hasta 3 GiB como invitado, 5 GiB en Gratis, 25 GiB en Creador y 50 GiB en Pro, siempre con caducidad a las 24 horas.
- Descargar un archivo concreto o el paquete completo en ZIP.
- Enviar el enlace por correo y registrar el número de descargas.

## Dónde se guarda la información

- `data/phocloud.db`: usuarios, sesiones, entregas, configuración y favoritas.
- `data/branding/`: logotipo global de cada fotógrafo.
- `uploads/<id>/`: miniaturas, manifiesto y marca específica de cada galería.
  En modo local también contiene los originales; con R2, los originales se
  guardan en el bucket permanente y las galerías existentes se migran sin
  cambiar sus enlaces.
- `transfers/<id>/`: archivos originales de cada transferencia temporal.
- La tabla `transfer_conversion_jobs` conserva el estado, progreso e
  idempotencia de cada conversión para recuperarla después de un reinicio.

Las contraseñas se guardan como hashes `scrypt`, nunca como texto legible.
Las fotografías protegidas se sirven mediante rutas que comprueban el acceso;
la carpeta `uploads` no está publicada directamente.

## Verificación por correo

En desarrollo, si no hay un servicio de correo configurado, Straclase muestra el
enlace de verificación o recuperación en la propia pantalla. Para enviar
correos reales en Railway configura `RESEND_API_KEY`, `PHOCLOUD_FROM_EMAIL` y
`PHOCLOUD_PUBLIC_URL`. Como alternativa, en un servidor que permita SMTP,
configura `SMTP_HOST`, `SMTP_USER` y `SMTP_PASS`.

`PHOCLOUD_FROM_EMAIL` identifica al remitente de los correos transaccionales y
no se reutiliza como contacto legal. `PHOCLOUD_LEGAL_EMAIL` es el buzón público
para privacidad y cuestiones legales. En producción ambos deben ser direcciones
profesionales del dominio público; las cuentas personales, dominios de ejemplo y
marcadores se rechazan antes de iniciar el servicio.

El mismo servicio de correo permite enviar una galería con visualización activa al correo guardado
del cliente. Las contraseñas de galerías nunca se incluyen en el mensaje porque
Straclase no conserva una versión legible de ellas.

El archivo `.env` contiene secretos y está excluido del control de versiones.

## Almacenamiento de galerías

Las transferencias temporales y las galerías usan buckets separados. El bucket
de transferencias elimina los objetos tras 24 horas. El bucket de galerías no
debe tener una regla de caducidad. Para activarlo configura
`PHOCLOUD_GALLERY_STORAGE=r2`, `PHOCLOUD_GALLERY_R2_ACCESS_KEY_ID`,
`PHOCLOUD_GALLERY_R2_SECRET_ACCESS_KEY` y
`PHOCLOUD_GALLERY_R2_BUCKET`. Las miniaturas y los logotipos permanecen en el
volumen de la aplicación para responder rápidamente.

## Planes

- `free`: 3 galerías activas y 5 GB.
- `professional`: 25 galerías activas, 50 GiB para galerías y 250 GiB de transferencias al mes.
- `studio`: 100 galerías activas, 150 GiB para galerías y 1 TiB de transferencias al mes.

El servidor comprueba los límites; no dependen de ocultar botones en el
navegador. El cobro real se conectará al proveedor de pagos al publicar el
producto.

## Conversión de transferencias a galerías

La conversión solo está disponible para el propietario autenticado y para
transferencias completas que aún no hayan caducado. Acepta únicamente los
formatos de foto y vídeo admitidos por galerías, con los mismos límites por
archivo, un máximo de 500 archivos y 10 GiB por galería. Los demás archivos se
muestran como excluidos antes de confirmar.

Con R2, el servidor intenta `CopyObject` entre el bucket temporal y el
permanente, por lo que los originales no atraviesan Railway. Si el token del
bucket de galerías no puede leer el bucket de transferencias, usa streaming
secuencial como alternativa. Solo se descargan unos bytes para validar el tipo
y, en imágenes, una copia temporal para crear la miniatura. La transferencia
original no se modifica ni se borra.

Las reservas de número de galerías, almacenamiento y concurrencia se realizan
en SQLite con `BEGIN IMMEDIATE`. `PHOCLOUD_CONVERSION_ENABLED=false` pausa
trabajos nuevos sin borrar galerías ni transferencias. Los límites recomendados
son una conversión por cuenta y dos globales. Para que la copia interna R2
funcione, el token de galerías debe tener lectura sobre el bucket de
transferencias y escritura sobre el bucket de galerías.

## Publicación

La aplicación incluye `Dockerfile`, `compose.production.yml`, validación de
configuración, endpoints `/healthz` y `/readyz`, páginas legales y un sistema de
backup. La guía completa está en `DEPLOYMENT.md`.

La arquitectura actual requiere una única instancia y un volumen persistente:
SQLite y las fotografías no deben desplegarse en un disco efímero. Para crear
una copia manual ejecuta `npm run backup`.

La instalación pública utiliza Railway, el dominio HTTPS configurado, correo
transaccional y almacenamiento externo. Los enlaces locales siguen dependiendo
de que este ordenador permanezca encendido. Antes de activar cambios de
facturación o configuración legal en producción hay que ejecutar las pruebas y
el preflight y revisar el resultado en un entorno de prueba.

## Datos públicos y privacidad del titular

Las páginas legales no incorporan nombres, correos, domicilios ni identificadores
hardcodeados. Se generan desde variables separadas. Si falta un valor obligatorio
o se detecta un placeholder, la página se bloquea y no publica datos de ejemplo.

- `PHOCLOUD_LEGAL_NAME`: dato opcional reservado para un futuro aviso legal revisado
  revisada; no se inserta en Privacidad ni Términos.
- `PHOCLOUD_LEGAL_EMAIL`: correo profesional público para privacidad y asuntos legales.
- `PHOCLOUD_LEGAL_COUNTRY`: país de establecimiento.
- `PHOCLOUD_LEGAL_ADDRESS`: domicilio legal para revisión; no se inserta en
  Privacidad ni Términos.
- `PHOCLOUD_LEGAL_TAX_ID`: NIF para revisión; no se inserta en esas páginas.
- `PHOCLOUD_LEGAL_REGISTRY`: datos registrales, únicamente cuando sean aplicables.
- `PHOCLOUD_SECURITY_EMAIL`: contacto público opcional de seguridad; si falta,
  `/.well-known/security.txt` no se publica.

La identidad, domicilio, NIF, datos registrales aplicables, información de
consumo, fiscalidad y tratamiento de imágenes deben revisarse con un profesional
jurídico antes de cobrar o abrir el servicio a terceros.

## Acceso con Google

El acceso con Google es opcional y convive con correo y contraseña. Straclase usa
Authorization Code, PKCE, `state` y `nonce`; no guarda los tokens de Google ni
solicita acceso a Drive, contactos u otros datos.

1. En Google Cloud, configura la pantalla de consentimiento OAuth con el dominio
   `straclase.com` y publica la aplicación cuando corresponda.
2. Crea un cliente OAuth 2.0 de tipo **Aplicación web**.
3. Añade `https://straclase.com/auth/google/callback` como URI de redirección
   autorizada. Para desarrollo puede añadirse también
   `http://localhost:3000/auth/google/callback`.
4. En Railway añade `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` al mismo entorno
   del servicio. Nunca expongas el secreto en el frontend ni lo confirmes en Git.
5. Despliega y comprueba que `/auth/status` devuelve `googleAuthEnabled: true`.

Si solo se configura una de las dos variables, el preflight de producción detiene
el arranque para evitar mostrar un acceso incompleto.
