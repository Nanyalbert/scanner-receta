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
3. Elegí **solo lejos**, **solo cerca** o **lejos y cerca**. Si la receta escribe los valores de cerca en otras dos filas, activá **La receta también detalla los valores de cerca** y cargá ambos ojos. La app puede sugerir la ADD cuando las esferas, cilindros y ejes son consistentes; tenés que confirmarla.
4. Confirmá cada valor con el documento original antes de ver las opciones. Copiá el resumen si querés usarlo en una conversación de mostrador.

La interpretación del texto admite coma decimal, signo negativo, cilindro/eje escritos como `-0,50 x 180°`, `-0,50 × 180°` o `-0,50*180°`, y filas en orden `eje° cilindro esfera`. Podés ampliar la imagen al cargarla. Los valores dudosos quedan pendientes de revisión; no se infiere una corrección faltante.

## Alcance y privacidad

La lectura básica se procesa en el navegador. El motor de OCR Tesseract.js y PDF.js se cargan desde jsDelivr al necesitarlos; el navegador requiere conexión para cargar esos componentes y los modelos de idioma por primera vez. La interpretación opcional con IA **envía la imagen** al Worker y a la API de OpenAI solo cuando la persona toca el botón. La app no guarda la receta. El Worker envía `store: false`, pero el tratamiento de datos por el proveedor se rige por sus condiciones y configuración de API.

En PDF se analiza **la primera página**. Si la receta está en otra página, guardá esa página como imagen o PDF independiente. El OCR local puede fallar por completo con letra manuscrita: si la confianza es baja, la app no pasa los números al formulario y requiere ingreso manual sobre la imagen ampliada. Las opciones son orientativas: los nombres de la línea Smart y los tratamientos sirven para conversar sobre alternativas, sin prometer disponibilidad, rango de fabricación, precio ni beneficio clínico individual. Confirmá diseño, material, medidas, armazón y catálogo vigente con el laboratorio antes de cotizar.

## Desarrollo

`parser.js` contiene la interpretación y validación; `app.js` maneja la carga, OCR, estado y recomendaciones; `styles.css` contiene la interfaz. Para verificar el parser:

```sh
node --test tests/*.test.mjs
node --check app.js
```

Se requiere Node 22 o superior para las pruebas. La app funciona como sitio estático y no necesita Node en producción.

## Activar interpretación manuscrita con IA

La app puede leer una receta con un modelo de visión mediante la API de OpenAI. Es un servicio **separado de la suscripción de ChatGPT** y requiere facturación y clave de API propias. La clave nunca debe estar en el repositorio, en GitHub Pages ni en `config.js`.

El código del servidor está en `worker/handler.mjs` y está preparado para Cloudflare Workers:

1. Instalá Wrangler y autenticá una cuenta de Cloudflare. Desde `worker/`, ejecutá `npx wrangler secret put OPENAI_API_KEY` y pegá la clave en el prompt privado.
2. En el mismo directorio, ejecutá `npx wrangler secret put APP_ACCESS_TOKEN` y elegí un código de acceso largo y único para el personal. No lo subas a GitHub.
3. Ejecutá `npx wrangler deploy`. Si la app usa un dominio distinto de `https://nanyalbert.github.io`, cambiá `ALLOWED_ORIGIN` en `worker/wrangler.toml` y volvé a desplegar.
4. Copiá la URL HTTPS del Worker en `AI_ENDPOINT` dentro de `config.js`, publicá el cambio en GitHub Pages y recargá la app. Aparecerá **Interpretar con IA** al cargar una imagen o PDF.

El Worker admite solo el origen configurado y el código de acceso, limita el tamaño de imagen y devuelve campos estructurados. No registra la imagen ni devuelve datos personales del paciente. El modelo puede equivocarse con letra manuscrita: campos ilegibles deben quedar vacíos, la ADD solo se transcribe si está escrita y la app nunca confirma valores automáticamente. Probá la integración con recetas de muestra antes de usarla en mostrador. Sin los secretos y el Worker desplegado, sigue disponible el OCR local y la carga manual.
