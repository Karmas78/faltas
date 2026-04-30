# Cómo guardar datos desde la PWA hacia Google Sheets

Para que tu aplicación web pueda escribir (añadir nuevas ausencias) directamente en tu archivo de Excel en Google Sheets, necesitas crear un pequeño "puente" usando **Google Apps Script**.

Sigue estos pasos exactamente como se indican:

### Paso 1: Crear el Script en tu hoja de cálculo
1. Abre tu archivo `REGISTRO AUSENCIAS LABORALES 2026.xlsx` en **Google Sheets** (desde tu navegador).
2. En el menú superior, haz clic en **Extensiones** > **Apps Script**.
3. Se abrirá una nueva pestaña con un editor de código. Borra todo lo que haya allí y pega el siguiente código:

```javascript
function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("2026");
  if (!sheet) {
    sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  }
  
  var params = e.parameter;
  var action = params.action || "add";
  
  if (action === "add") {
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
  
  if (action === "delete" || action === "edit") {
    // IMPORTANTE: getDisplayValues() asegura que comparemos TEXTO
    var data = sheet.getDataRange().getDisplayValues();
    var headers = data[0];
    var nombreCol = -1, inicioCol = -1, terminoCol = -1;
    
    // Identificar columnas necesarias
    for (var j = 0; j < headers.length; j++) {
      var h = String(headers[j]).toUpperCase().trim();
      if (h === 'NOMBRE FUNCIONARIO' || h === 'NOMBRE') nombreCol = j;
      if (h === 'FECHA INICIO') inicioCol = j;
      if (h === 'FECHA TERMINO' || h === 'FECHA TÉRMINO') terminoCol = j;
    }
    
    var targetNombre = action === "edit" ? params.origNombre : params.nombre;
    var targetInicio = action === "edit" ? params.origInicio : params.inicio;
    var targetTermino = action === "edit" ? params.origTermino : params.termino;
    
    var rowIndex = -1;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][nombreCol]).trim() === targetNombre &&
          String(data[i][inicioCol]).trim() === targetInicio &&
          String(data[i][terminoCol]).trim() === targetTermino) {
        rowIndex = i + 1; // +1 porque sheet.deleteRow usa índice basado en 1
        break;
      }
    }
    
    if (rowIndex === -1) {
      return ContentService.createTextOutput(JSON.stringify({
        "status": "error", 
        "message": "Registro no encontrado"
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    if (action === "delete") {
      sheet.deleteRow(rowIndex);
      return ContentService.createTextOutput(JSON.stringify({
        "status": "success", 
        "message": "Borrado correctamente"
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    if (action === "edit") {
      var newRow = [
        params.fechaRegistro || "",
        params.nombre || "",
        "", "",
        params.dias || "",
        params.inicio || "",
        params.termino || "",
        "", "",
        params.obs || "",
        params.tipo || "",
        "", ""
      ];
      sheet.getRange(rowIndex, 1, 1, newRow.length).setValues([newRow]);
      return ContentService.createTextOutput(JSON.stringify({
        "status": "success", 
        "message": "Actualizado correctamente"
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }
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
