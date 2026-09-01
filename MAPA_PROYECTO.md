# PHOcloud — mapa del proyecto

## Objetivo

Construir una aplicación para que un fotógrafo cree una entrega de fotos y comparta con su cliente una galería privada, cuidada y fácil de usar.

La primera versión estará terminada cuando el fotógrafo pueda:

1. Crear una entrega con nombre y fotografías.
2. Obtener un enlace privado.
3. Compartirlo con el cliente.
4. Permitir que el cliente vea y descargue sus fotos.
5. Volver después para gestionar o eliminar la entrega.

## Mapa completo

```text
FOTÓGRAFO
   │
   ├── Panel de entregas
   │      ├── Crear entrega
   │      ├── Ver entregas anteriores
   │      └── Editar / eliminar / copiar enlace
   │
   └── Subida de fotografías
          │
          ▼
SERVIDOR PHOCLOUD
   ├── Guarda los datos de la entrega
   ├── Guarda y organiza las fotografías
   ├── Genera un identificador privado
   └── Protege y publica la galería
          │
          ▼
CLIENTE
   ├── Abre el enlace privado
   ├── Ve la galería
   ├── Amplía y navega por las fotos
   └── Descarga fotos
```

## Líneas funcionales

Cada línea funcional debe terminar en algo visible y utilizable de principio a fin.

### Línea 1 — Crear y abrir una galería ✅

Ya construida:

```text
Nueva entrega → seleccionar fotos → subir → crear carpeta e ID
→ generar enlace → abrir galería → ver fotos → usar visor
```

Qué aprendemos con ella:

- HTML: controles y estructura de las dos pantallas.
- CSS: aspecto de la creación y de la galería.
- JavaScript del navegador: selección, envío y presentación de datos.
- Express: rutas y respuestas del servidor.
- Multer: recepción de archivos.
- Sistema de archivos: almacenamiento por identificador.

### Línea 2 — Identificar la entrega ✅

Añadir nombre del cliente, mensaje y fecha. Estos datos aparecen tanto al crear la entrega como en la galería.

### Línea 3 — Descargar fotografías ✅

Descargar una foto individual y toda la entrega en un archivo ZIP.

### Línea 4 — Gestionar entregas ✅

Panel con entregas anteriores, botón para copiar el enlace y opciones para editar o eliminar una entrega. El editor permite añadir y quitar fotografías.

### Línea 5 — Persistencia real ✅

La información de las entregas se guarda en SQLite. Las fotografías continúan organizadas por carpetas.

### Línea 6 — Acceso y seguridad ✅

Ya construida:

- Creación segura del primer usuario del fotógrafo.
- Inicio y cierre de sesión.
- Panel, subida y gestión protegidos.
- Galerías compartidas accesibles solamente mediante su enlace privado.
- Contraseñas protegidas con hash `scrypt`, cookies de sesión seguras y protección contra intentos repetidos.
- Contraseña y fecha de caducidad opcionales para cada galería.
- Permisos independientes de descarga individual y completa.
- Comprobación del contenido real de los archivos, hasta 500 fotos, 50 MB por archivo y 10 GB por entrega.

### Línea 7 — Selección del cliente ✅

El cliente puede marcar sus fotografías favoritas y el fotógrafo ve la selección desde el editor de la entrega.

### Línea 8 — Rendimiento e identidad visual ✅

Ya construida:

- Selección visual de archivos antes de subir, eliminación y elección de portada.
- Progreso de subida y aviso durante el procesamiento.
- Miniaturas optimizadas para la visualización, conservando los originales intactos.
- Marca global del fotógrafo con logotipo, colores, web y redes sociales.
- Gestor global de enlaces para cualquier plataforma, con orden personalizado y compatibilidad con los enlaces antiguos.
- Personalización independiente de cada entrega y tres composiciones de galería.

### Línea 9 — Cuentas y modelo de negocio ✅

Ya construida:

- Registro independiente de fotógrafos.
- Confirmación del correo y recuperación de contraseña.
- Galerías, marca y almacenamiento separados por propietario.
- Plan gratuito con tres galerías activas y contador de uso.
- Límites aplicados en el servidor y estructura de planes profesionales.

### Línea 10 — Portadas profesionales ✅

Ya construida:

- Cinco composiciones de portada: inmersiva, dividida, enmarcada, minimalista y sin portada.
- Título, marca, descarga y selección integrados en la primera impresión.
- Punto focal horizontal y vertical para conservar el encuadre en móvil.
- Previsualización de la portada desde el editor.

### Línea 11 — Preparación para publicación ✅

Ya construida:

- Estados de borrador, publicada y archivada con vista previa privada.
- Correo opcional del cliente y envío real de la galería mediante SMTP.
- Términos, privacidad, consentimiento en el registro y cookies únicamente técnicas.
- Comprobaciones de salud, límites antiabuso, errores trazables y cabeceras de seguridad.
- Configuración de producción que exige HTTPS, correo, rutas persistentes y datos legales.
- Contenedor Docker endurecido, comprobación previa y copias de seguridad con retención.

Queda conectar esta preparación a cuentas externas de dominio, alojamiento,
correo, backups remotos y, más adelante, pagos.

## Arquitectura actual

```text
Frontend/index.html  → pantalla para crear la entrega
Frontend/script.js   → crea entregas y gestiona el panel
Frontend/login.html  → acceso privado del fotógrafo
Frontend/login.js    → creación de usuario, inicio y cierre de sesión
Backend/server.js    → coordina fotos, datos, descargas y enlaces
Backend/database.js  → guarda y consulta entregas con SQLite
Backend/auth.js      → contraseñas, sesiones y cookies
Backend/media.js     → crea miniaturas y adapta logotipos
Backend/mailer.js    → envía verificaciones y recuperaciones por SMTP
scripts/preflight.js → comprueba que producción esté configurada
scripts/backup.js    → crea copias de datos y fotografías
data/phocloud.db     → base de datos local
uploads/<id>/        → fotografías de cada entrega
public/gallery.html  → pantalla que recibe el cliente
public/gallery.js    → acceso, visor, descargas y selección del cliente
```

## Regla de trabajo

Para cada línea seguiremos siempre el mismo ciclo:

1. Ver dónde encaja en el mapa.
2. Explicar el recorrido de los datos.
3. Construir una versión mínima completa.
4. Probarla en el navegador.
5. Revisar el código y explicar lo aprendido.

## Siguiente paso

Elegir proveedor y desplegar la beta en una sola instancia con volumen
persistente, dominio HTTPS, SMTP y una copia externa. Después se prueba con
3–5 fotógrafos antes de decidir pagos y nuevas funciones.
