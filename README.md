# Gestión de Ausencias Laborales - PWA

Esta es una Progressive Web App (PWA) diseñada para ejecutarse en GitHub Pages y gestionar ausencias de funcionarios leyendo datos en tiempo real desde una hoja de cálculo en Google Sheets.

## Características

- **Dashboard en Tiempo Real:** Contadores de ausentes de hoy, de mañana y retornos inminentes.
- **Regla de Negocio P.A.:** Si un funcionario acumula más de 6 días de Permisos Administrativos (P.A.), el sistema mostrará una advertencia visual.
- **Filtros Inteligentes:** Búsqueda por nombre de funcionario y tipo de ausencia.
- **Alerta de Errores:** Identifica y destaca visualmente los registros cuyas fechas de término sean anteriores a las de inicio.
- **PWA Ready:** Instalable en escritorio y dispositivos móviles, optimizada con caché local para activos de la app.

## Instrucciones para Configurar Google Sheets

Para que la aplicación funcione, necesita consumir los datos desde tu archivo Excel (`REGISTRO AUSENCIAS LABORALES 2026.xlsx`) previamente subido a Google Sheets.

Sigue estos pasos para obtener la URL correcta:

1. **Sube tu archivo a Google Drive** y ábrelo con **Google Sheets**.
2. Ve al menú superior y haz clic en **Archivo** (File) > **Compartir** (Share) > **Publicar en la web** (Publish to web).
3. En la ventana que aparece:
   - En el primer desplegable (donde dice "Todo el documento"), selecciona la hoja específica que quieres cargar, por ejemplo: **`2026`**.
   - En el segundo desplegable (donde dice "Página web"), elige **`Valores separados por comas (.csv)`**.
4. Haz clic en el botón verde **Publicar** (y confirma si te pide permisos).
5. Copia el **enlace que se generará** en pantalla.
6. Abre la aplicación (tu archivo `index.html` en el navegador o en GitHub Pages).
7. En la sección **Fuente de Datos** de la aplicación, pega el enlace y haz clic en "Cargar Datos".

¡Listo! La aplicación guardará la URL en tu navegador de forma segura para las siguientes visitas.

## Estructura de Datos Requerida

La aplicación está programada para leer (sin importar el orden de las columnas) las siguientes cabeceras exactas. Asegúrate de que no tengan espacios en blanco adicionales al inicio o final:

- `FECHA`
- `NOMBRE FUNCIONARIO`
- `N° HRS/DÍAS`
- `FECHA INICIO`
- `FECHA TERMINO` (o `FECHA TÉRMINO`)
- `TIPO AUS`

## Despliegue en GitHub Pages

1. Inicializa un repositorio Git y sube los 4 archivos principales: `index.html`, `app.js`, `style.css` (no requerido al usar CDN) y `manifest.json`, `sw.js`.
2. Ve a los **Settings** de tu repositorio en GitHub.
3. En el menú izquierdo, ve a **Pages**.
4. En **Source**, selecciona `main` branch (o tu rama principal) y `/ (root)`.
5. Haz clic en **Save**.
6. En unos minutos, tu aplicación estará disponible globalmente en la URL proporcionada por GitHub.
