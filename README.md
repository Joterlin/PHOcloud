# PHOcloud

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
- Proteger transferencias de hasta 50 GB con contraseña y caducidad automática a las 24 horas.
- Descargar un archivo concreto o el paquete completo en ZIP.
- Enviar el enlace por correo y registrar el número de descargas.

## Dónde se guarda la información

- `data/phocloud.db`: usuarios, sesiones, entregas, configuración y favoritas.
- `data/branding/`: logotipo global de cada fotógrafo.
- `uploads/<id>/`: archivos originales, miniaturas y marca específica de cada galería.
- `transfers/<id>/`: archivos originales de cada transferencia temporal.

Las contraseñas se guardan como hashes `scrypt`, nunca como texto legible.
Las fotografías protegidas se sirven mediante rutas que comprueban el acceso;
la carpeta `uploads` no está publicada directamente.

## Verificación por correo

En desarrollo, si no hay un servicio de correo configurado, PHOcloud muestra el
enlace de verificación o recuperación en la propia pantalla. Para enviar
correos reales en Railway configura `RESEND_API_KEY`, `PHOCLOUD_FROM_EMAIL` y
`PHOCLOUD_PUBLIC_URL`. Como alternativa, en un servidor que permita SMTP,
configura `SMTP_HOST`, `SMTP_USER` y `SMTP_PASS`.

El mismo servicio de correo permite enviar una galería con visualización activa al correo guardado
del cliente. Las contraseñas de galerías nunca se incluyen en el mensaje porque
PHOcloud no conserva una versión legible de ellas.

El archivo `.env` contiene secretos y está excluido del control de versiones.

## Planes

- `free`: 3 galerías activas y 5 GB.
- `professional`: preparado para 100 galerías y 250 GB.
- `studio`: preparado para 500 galerías y 1 TB.

El servidor comprueba los límites; no dependen de ocultar botones en el
navegador. El cobro real se conectará al proveedor de pagos al publicar el
producto.

## Publicación

La aplicación incluye `Dockerfile`, `compose.production.yml`, validación de
configuración, endpoints `/healthz` y `/readyz`, páginas legales y un sistema de
backup. La guía completa está en `DEPLOYMENT.md`.

La arquitectura actual requiere una única instancia y un volumen persistente:
SQLite y las fotografías no deben desplegarse en un disco efímero. Para crear
una copia manual ejecuta `npm run backup`.

Los enlaces locales siguen dependiendo de que este ordenador permanezca
encendido. Para que funcionen permanentemente todavía hay que contratar y
conectar alojamiento, dominio HTTPS, SMTP y una ubicación externa de backups.
Los pagos se integrarán después de elegir proveedor y probar la beta.
