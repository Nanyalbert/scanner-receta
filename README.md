# Black Recetas

Asistente de mostrador para leer una receta óptica, verificar su graduación y comparar opciones de cristales para el paciente.

## Uso

Abrí `index.html` desde un servidor web estático o activá GitHub Pages con la rama `main` y la carpeta `/ (root)`. No hay compilación ni servidor de aplicación. Para probar localmente:

```sh
python3 -m http.server 8000
```

Después abrí `http://localhost:8000`.

1. Tocá **Tomar foto** para abrir la cámara, o **Elegir archivo** para entrar a Archivos y elegir JPG, PNG, WEBP o PDF (máximo 15 MB). También podés arrastrar un archivo.
2. Revisá la transcripción. Se puede corregir y volver a interpretar. Si falla la lectura, ingresá OD y OI manualmente.
3. Elegí **solo lejos**, **solo cerca** o **lejos y cerca**. Para esta última opción, completá la ADD.
4. Confirmá cada valor con el documento original antes de ver las opciones. Copiá el resumen si querés usarlo en una conversación de mostrador.

La lectura admite coma decimal, signo negativo, y cilindro/eje escritos como `-0,50 x 180°`, `-0,50 × 180°` o `-0,50*180°`. Los valores dudosos quedan pendientes de revisión; no se infiere una corrección faltante.

## Alcance y privacidad

La imagen y la interpretación se procesan en el navegador. La app no envía la receta a un servidor ni guarda datos. El motor de OCR Tesseract.js y PDF.js se cargan desde jsDelivr al necesitarlos; el navegador requiere conexión para cargar esos componentes y los modelos de idioma por primera vez.

En PDF se analiza **la primera página**. Si la receta está en otra página, guardá esa página como imagen o PDF independiente. Las opciones son orientativas: los nombres de la línea Smart y los tratamientos sirven para conversar sobre alternativas, sin prometer disponibilidad, rango de fabricación, precio ni beneficio clínico individual. Confirmá diseño, material, medidas, armazón y catálogo vigente con el laboratorio antes de cotizar. La lectura automática puede confundir letras, signos, eje y decimales.

## Desarrollo

`parser.js` contiene la interpretación y validación; `app.js` maneja la carga, OCR, estado y recomendaciones; `styles.css` contiene la interfaz. Para verificar el parser:

```sh
node --test tests/*.test.mjs
node --check app.js
```

Se requiere Node 22 o superior para las pruebas. La app funciona como sitio estático y no necesita Node en producción.
