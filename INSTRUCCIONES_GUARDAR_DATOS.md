# Instrucciones para la Persistencia de Datos (v1.4.3)

Esta PWA permite registrar, editar y borrar ausencias directamente en tu Google Sheets. Para que esto funcione, debes configurar un "puente" usando Google Apps Script y añadir una columna de ID en tu Excel.

### Paso 0: Preparar tu Excel
1. Abre tu archivo `REGISTRO AUSENCIAS LABORALES 2026.xlsx` en **Google Sheets**.
2. **IMPORTANTE:** Inserta una nueva columna al principio del todo (Columna A) y llámala **ID**.
3. (Opcional) Para que los registros antiguos se puedan editar/borrar, asígnales un número único manual (1, 2, 3...) en esa nueva columna A. Los registros nuevos recibirán un ID automático.

### Paso 1: Crear el Script en tu hoja de cálculo
1. En el menú superior de tu Google Sheets, haz clic en **Extensiones** > **Apps Script**.
2. Borra todo el código existente y pega el siguiente:

```javascript
function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("2026");
  if (!sheet) sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  
  var params = e.parameter;
  var action = params.action || "add";
  
  // 1. Obtener todos los datos con texto visible
  var data = sheet.getDataRange().getDisplayValues();
  var headers = data[0];
  
  // 2. Localizar columna ID (buscamos "ID")
  var idColIndex = 0; 
  for (var j = 0; j < headers.length; j++) {
    if (headers[j].toUpperCase().trim() === "ID") {
      idColIndex = j;
      break;
    }
  }

  // ACCIÓN: AGREGAR
  if (action === "add") {
    var newId = "ID-" + Date.now(); // Generamos un ID único
    var newRow = [
      newId,
      params.fechaRegistro || "",
      params.nombre || "",
      "", "", // Persona, Medio
      params.dias || "",
      params.inicio || "",
      params.termino || "",
      "", "", // Reintegro, Doc
      params.obs || "",
      params.tipo || "",
      "", ""  // Reemplazo, Cargo
    ];
    sheet.appendRow(newRow);
    return ContentService.createTextOutput(JSON.stringify({"status": "success", "id": newId})).setMimeType(ContentService.MimeType.JSON);
  }
  
  // ACCIÓN: EDITAR O BORRAR
  if (action === "edit" || action === "delete") {
    var targetId = params.id;
    var rowIndex = -1;

    // Buscar la fila por ID (mucho más fiable)
    if (targetId) {
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][idColIndex]).trim() === targetId) {
          rowIndex = i + 1;
          break;
        }
      }
    }

    if (rowIndex === -1) {
      return ContentService.createTextOutput(JSON.stringify({
        "status": "error", 
        "message": "No se encontró el ID: " + targetId + ". Asegúrate de que el registro tenga un ID en la columna A del Excel."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "delete") {
      sheet.deleteRow(rowIndex);
    } else if (action === "edit") {
      var updatedRow = [
        targetId, 
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
      sheet.getRange(rowIndex, 1, 1, updatedRow.length).setValues([updatedRow]);
    }
    return ContentService.createTextOutput(JSON.stringify({"status": "success"})).setMimeType(ContentService.MimeType.JSON);
  }
}
```

### Paso 2: Implementar el Script
1. Haz clic en el botón azul **Implementar** > **Nueva implementación**.
2. En el engranaje de la izquierda, asegúrate de que esté seleccionado **Aplicación web**.
3. **Descripción:** Pon "Puente Ausencias v1.4.3".
4. **Ejecutar como:** Selecciona "Yo" (tu cuenta de Google).
5. **Quién tiene acceso:** Selecciona **Cualquier persona**. (Esto es fundamental).
6. Haz clic en **Implementar**.
7. Google te pedirá autorizar el acceso a tu hoja de cálculo. Acéptalo.
8. Copia la **URL de la aplicación web** que aparece (termina en `/exec`).

### Paso 3: Configurar la PWA
1. Abre tu PWA en el navegador o móvil.
2. Ve a la sección inferior **"Fuente de Datos"** (icono de engranaje).
3. Pega la URL que copiaste en el campo **"URL del Google Apps Script"**.
4. Haz clic en **"Guardar Configuración de Script"**.

---
**Nota sobre Seguridad:** Solo las personas que tengan la URL de tu script podrán enviar datos. No compartas esa URL públicamente.
