# Seguridad

Las incidencias de seguridad no deben publicarse con datos de clientes. Envía el
informe al correo configurado en `PHOCLOUD_SECURITY_EMAIL` incluyendo la ruta
afectada, el impacto observado y pasos mínimos para reproducirlo. Si esa variable
no está configurada, el servicio no publica `/.well-known/security.txt`.

Ante una posible brecha: limita el acceso, conserva registros, cambia las
credenciales comprometidas, identifica datos y personas afectadas y evalúa las
obligaciones de notificación antes de reabrir el servicio.
