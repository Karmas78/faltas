# Cómo guardar datos desde la PWA hacia Google Sheets

Para que tu aplicación web pueda escribir (añadir nuevas ausencias) directamente en tu archivo de Excel en Google Sheets, necesitas crear un pequeño "puente" usando **Google Apps Script**.

Sigue estos pasos exactamente como se indican:

### Paso 1: Crear el Script en tu hoja de cálculo
1. Abre tu archivo `REGISTRO AUSENCIAS LABORALES 2026.xlsx` en **Google Sheets** (desde tu navegador).
2. En el menú superior, haz clic en **Extensiones** > **Apps Script**.
3. Se abrirá una nueva pestaña con un editor de código. Borra todo lo que haya allí y pega el siguiente código:

```javascript
function doPost(e) {
  // Buscar la hoja que se llama '2026', si no existe toma la primera
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("2026");
  if (!sheet) {
    sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  }
  
  var params = e.parameter;
  
  // Construir la nueva fila respetando el orden de tus columnas:
  // FECHA | NOMBRE FUNCIONARIO | PERSONA | MEDIO | N° HRS/DÍAS | FECHA INICIO | FECHA TERMINO | REINTEGRO | DOC | OBS | TIPO AUS | REEMPLAZO | CARGO
  var newRow = [
    params.fechaRegistro || "",
    params.nombre || "",
    "", // Persona a quien avisa
    "", // Medio
    params.dias || "",
    params.inicio || "",
    params.termino || "",
    "", // Reintegro
    "", // Doc
    params.obs || "",
    params.tipo || "",
    "", // Reemplazo
    ""  // Cargo
  ];
  
  sheet.appendRow(newRow);
  
  return ContentService.createTextOutput(JSON.stringify({
    "status": "success", 
    "message": "Guardado correctamente"
  })).setMimeType(ContentService.MimeType.JSON);
}
```

### Paso 2: Publicar el Script como Aplicación Web
1. Arriba en el editor de Apps Script, ponle un nombre al proyecto (ej. "API Ausencias").
2. Haz clic en el botón azul **Implementar** (Deploy) arriba a la derecha y selecciona **Nueva implementación**.
3. Haz clic en el ícono de engranaje ⚙️ junto a "Seleccionar tipo" y elige **Aplicación web**.
4. Configúralo exactamente así:
   - **Descripción**: v1
   - **Ejecutar como**: *Tú (tu correo)*
   - **Quién tiene acceso**: *Cualquier persona* (Esto es VITAL para que la PWA pueda enviar datos).
5. Haz clic en **Implementar**.
6. Google te pedirá **Autorizar acceso**. Haz clic ahí, selecciona tu cuenta de Google. (Si te sale un aviso de "App no verificada", haz clic en "Avanzado" abajo y luego en "Ir a API Ausencias (inseguro)" y dale a **Permitir**).
7. Al terminar, te dará una **URL de la aplicación web** (suele terminar en `/exec`). **Copia esa URL**.

### Paso 3: Conectar la PWA
1. Ve a tu aplicación web (la PWA).
2. En la sección "Fuente de Datos" verás un nuevo campo llamado **"URL del Google Apps Script"**.
3. Pega ahí la URL que acabas de copiar y haz clic en **Guardar Script**.

¡Listo! Ahora cuando hagas clic en el botón verde **"Nueva Ausencia"** en la barra superior de tu PWA y llenes el formulario, los datos aparecerán automáticamente en tu hoja de Google Sheets en tiempo real.
