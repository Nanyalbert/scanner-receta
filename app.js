import { asNumber, emptyPrescription, parseDetailedPrescription, suggestAdd, validatePrescription } from "./parser.js";

const $ = id => document.getElementById(id);
const fileInputs = ["cameraInput", "fileInput", "cameraAgain", "fileAgain"].map($);
const fields = ["od-sphere", "od-cylinder", "od-axis", "oi-sphere", "oi-cylinder", "oi-axis", "add",
  "near-od-sphere", "near-od-cylinder", "near-od-axis", "near-oi-sphere", "near-oi-cylinder", "near-oi-axis"];
const state = { rx: emptyPrescription(), near: emptyPrescription(), nearEnabled: false, type: null, busy: false, confirmed: false, previewUrl: null, options: [] };
const sample = {
  od: { sphere: "-2.00", cylinder: "-0.75", axis: "180" },
  oi: { sphere: "-1.75", cylinder: "-0.50", axis: "175" },
  add: "+1.75",
};

function setStatus(message) {
  $("scanStatus").textContent = message;
  $("scanStatus").hidden = !message;
}

function setBusy(value) {
  state.busy = value;
  fileInputs.forEach(input => { input.disabled = value; });
  $("dropZone").classList.toggle("disabled", value);
  render();
}

function syncInputs() {
  for (const eye of ["od", "oi"]) {
    for (const field of ["sphere", "cylinder", "axis"]) {
      $(`${eye}-${field}`).value = state.rx[eye][field];
      $(`near-${eye}-${field}`).value = state.near[eye][field];
    }
  }
  $("add").value = state.rx.add;
  $("nearToggle").checked = state.nearEnabled;
  document.querySelectorAll('input[name="rxType"]').forEach(input => {
    input.checked = input.value === state.type;
  });
}

function readInputs() {
  for (const eye of ["od", "oi"]) {
    for (const field of ["sphere", "cylinder", "axis"]) {
      state.rx[eye][field] = $(`${eye}-${field}`).value.trim();
      state.near[eye][field] = $(`near-${eye}-${field}`).value.trim();
    }
  }
  state.rx.add = $("add").value.trim();
}

function render() {
  const issues = validatePrescription(state.rx, state.type);
  const hasNear = state.type === "both" && state.nearEnabled;
  const suggestedAdd = hasNear ? suggestAdd(state.rx, state.near) : null;
  if (hasNear) {
    issues.push(...validatePrescription(state.near, "near").map(issue => `Cerca ${issue}`));
    if (!suggestedAdd && !validatePrescription(state.near, "near").length) {
      issues.push("Lejos y cerca no coinciden en cilindro/eje o ADD entre ojos. Revisá la receta antes de ofrecer un multifocal.");
    }
    if (suggestedAdd && state.rx.add && Math.abs(asNumber(state.rx.add) - asNumber(suggestedAdd)) > .01) {
      issues.push("La ADD no coincide con la diferencia entre cerca y lejos.");
    }
  }
  document.querySelectorAll(".usage-choices label").forEach(label => {
    label.classList.toggle("selected", label.querySelector("input").checked);
  });
  $("addRow").hidden = state.type !== "both";
  $("nearToggleRow").hidden = state.type !== "both";
  $("nearSection").hidden = !hasNear;
  $("addSuggestion").hidden = !suggestedAdd;
  $("useAddButton").hidden = !suggestedAdd;
  if (suggestedAdd) $("addSuggestion").textContent = `ADD calculada a partir de las esferas: ${suggestedAdd}. Confirmala con la receta.`;
  const typeNote = state.type === "near"
    ? "OD y OI son valores para cerca. La app no suma una ADD."
    : state.type === "distance" ? "OD y OI son valores para lejos." : "";
  $("typeNote").textContent = typeNote;
  $("typeNote").hidden = !typeNote;
  $("confirmButton").disabled = state.busy || issues.length > 0;
  const hasAnyValue = Boolean(state.rx.od.sphere || state.rx.oi.sphere);
  $("issues").hidden = !hasAnyValue || issues.length === 0;
  $("issues").replaceChildren(...issues.map(issue => {
    const li = document.createElement("li");
    li.textContent = issue;
    return li;
  }));
  $("sourceActions").hidden = !state.previewUrl;
  $("uploadEmpty").hidden = Boolean(state.previewUrl);
  $("preview").hidden = !state.previewUrl;
  $("copyButton").hidden = !state.confirmed;
  $("resultContext").hidden = !state.confirmed;
  $("optionGrid").hidden = !state.confirmed;
  $("resultFoot").hidden = !state.confirmed;
  $("emptyResults").hidden = state.confirmed;
  if (state.confirmed) {
    const typeLabel = state.type === "near" ? "solo cerca" : state.type === "both" ? "lejos y cerca" : "solo lejos";
    $("resultContext").textContent = `Receta: ${typeLabel}`;
    $("optionGrid").replaceChildren(...state.options.map((option, index) => {
      const article = document.createElement("article");
      article.className = "option";
      article.innerHTML = `<div class="option-top"><span>${String(index + 1).padStart(2, "0")}</span><span class="tier"></span></div><h3></h3><strong></strong><p></p>`;
      article.querySelector(".tier").textContent = option.tier;
      article.querySelector("h3").textContent = option.name;
      article.querySelector("strong").textContent = option.benefit;
      article.querySelector("p").textContent = option.reason;
      return article;
    }));
  }
}

function invalidate() {
  state.confirmed = false;
  state.options = [];
  render();
}

function applyText(text, fromScan = false) {
  const parsed = parseDetailedPrescription(text);
  state.rx = parsed.far;
  state.near = parsed.near || emptyPrescription();
  state.nearEnabled = Boolean(parsed.near?.od.sphere || parsed.near?.oi.sphere);
  if (fromScan) state.type = parsed.far.add || state.nearEnabled ? "both" : null;
  syncInputs();
  invalidate();
  return Boolean(parsed.far.od.sphere && parsed.far.oi.sphere);
}

let ocrScriptPromise;
function getTesseract() {
  if (window.Tesseract?.createWorker) return Promise.resolve(window.Tesseract);
  if (!ocrScriptPromise) {
    ocrScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js";
      script.onload = () => window.Tesseract?.createWorker ? resolve(window.Tesseract) : reject(new Error("OCR no disponible"));
      script.onerror = () => reject(new Error("No se pudo cargar el motor de lectura"));
      document.head.append(script);
    }).catch(error => { ocrScriptPromise = null; throw error; });
  }
  return ocrScriptPromise;
}

async function recognize(image) {
  const Tesseract = await getTesseract();
  const worker = await Tesseract.createWorker("spa+eng", 1, {
    logger: event => {
      if (event.status === "recognizing text") {
        setStatus(`Leyendo la receta… ${Math.round((event.progress || 0) * 100)}%`);
      }
    },
  });
  try {
    const result = await worker.recognize(image);
    return { text: result.data.text.trim(), confidence: result.data.confidence || 0 };
  } finally {
    await worker.terminate();
  }
}

async function readPdf(file) {
  const pdfjs = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.worker.mjs";
  const loading = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const pdf = await loading.promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const scale = Math.min(2, 2200 / Math.max(viewport.width, viewport.height));
    const canvas = document.createElement("canvas");
    const scaled = page.getViewport({ scale });
    canvas.width = Math.round(scaled.width);
    canvas.height = Math.round(scaled.height);
    await page.render({ canvas, canvasContext: canvas.getContext("2d"), viewport: scaled }).promise;
    const content = await page.getTextContent();
    const text = content.items.map(item => `${item.str || ""}${item.hasEOL ? "\n" : " "}`).join("").trim();
    return { preview: canvas.toDataURL("image/png"), canvas, text, pages: pdf.numPages };
  } finally {
    await loading.destroy();
  }
}

function showPreview(url) {
  if (state.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(state.previewUrl);
  state.previewUrl = url;
  $("preview").src = url;
  render();
}

async function handleFile(file) {
  if (!file || state.busy) return;
  if (file.size > 15 * 1024 * 1024) {
    setStatus("El archivo supera 15 MB. Reducí su tamaño y probá otra vez.");
    return;
  }
  const pdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  const image = /^(image\/(jpeg|png|webp|bmp))$/.test(file.type) || /\.(jpe?g|png|webp|bmp)$/i.test(file.name);
  if (!pdf && !image) {
    setStatus("Elegí una imagen JPG, PNG o WEBP, o un PDF.");
    return;
  }
  setBusy(true);
  if (state.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(state.previewUrl);
  state.previewUrl = null;
  $("preview").removeAttribute("src");
  state.confirmed = false;
  state.type = null;
  state.rx = emptyPrescription();
  state.near = emptyPrescription();
  state.nearEnabled = false;
  syncInputs();
  $("rawText").value = "";
  $("rawDetails").hidden = true;
  setStatus("Preparando el archivo…");
  try {
    let text, pages = 1, confidence = 100;
    if (pdf) {
      const pdfResult = await readPdf(file);
      showPreview(pdfResult.preview);
      pages = pdfResult.pages;
      text = pdfResult.text;
      const parsed = parseDetailedPrescription(text).far;
      if (!parsed.od.sphere || !parsed.oi.sphere) {
        const result = await recognize(pdfResult.canvas);
        text = result.text;
        confidence = result.confidence;
      }
    } else {
      showPreview(URL.createObjectURL(file));
      const result = await recognize(file);
      text = result.text;
      confidence = result.confidence;
    }
    $("rawText").value = text;
    $("rawDetails").hidden = !text;
    const found = confidence >= 50 && applyText(text, true);
    const pageNote = pages > 1 ? " Se analizó solo la primera página del PDF." : "";
    if (!found) setStatus("La lectura automática no es confiable para esta foto. Ampliá la receta y cargá los valores a mano; verificá lejos y cerca por separado." + pageNote);
    else setStatus("Lectura preliminar lista. Verificá signos, eje y tipo de receta con el original." + pageNote);
  } catch (error) {
    console.error("Lectura de receta:", error);
    setStatus("No se pudo completar la lectura automática. La imagen sigue disponible para cargar los valores a mano.");
  } finally {
    setBusy(false);
  }
}

function optionsFor(rx, type) {
  const stronger = [rx.od, rx.oi].some(eye =>
    Math.abs(asNumber(eye.sphere) || 0) >= 4 || Math.abs(asNumber(eye.cylinder) || 0) >= 2);
  if (type === "both") return [
    { name: "Smart ONE", tier: "Esencial", benefit: "Lejos y cerca en un mismo anteojo", reason: "La ADD permite evaluar un multifocal para alternar distancias." },
    { name: "Smart NEW", tier: "Equilibrado", benefit: "Transición entre distancias", reason: "Para alternar lectura, conversación y visión lejana." },
    { name: "Smart FREE", tier: "Mayor comodidad", benefit: "Libertad en el uso cotidiano", reason: "Comparar diseño, amplitud de campos y adaptación." },
    { name: "Smart AILENS", tier: "Personalizado", benefit: "Diseño ajustado a medidas", reason: "Requiere confirmar parámetros de montaje y disponibilidad." },
  ];
  const location = type === "near" ? "cerca" : "lejos";
  return [
    { name: `Orgánico blanco · ${location}`, tier: "Esencial", benefit: `Corrección monofocal para ${location}`, reason: "Base para comparar alternativas de materiales y tratamientos." },
    { name: `Antirreflejo · ${location}`, tier: "Confort", benefit: "Menos reflejos en el cristal", reason: "Misma corrección con tratamiento antirreflejo." },
    stronger
      ? { name: "Índice y espesor a evaluar", tier: "Estética", benefit: "Posible menor espesor y peso", reason: "Confirmar material, diámetro y armazón con el laboratorio." }
      : { name: `Filtro azul · ${location}`, tier: "Opcional", benefit: "Tratamiento a elección del paciente", reason: "Ofrecer por preferencia, sin prometer reducción de fatiga visual." },
  ];
}

function signed(value) {
  const n = asNumber(value);
  return n === null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(2)}`;
}

async function copySummary() {
  const type = state.type === "near" ? "Solo cerca" : state.type === "both" ? "Lejos y cerca" : "Solo lejos";
  const lines = ["Opciones para conversar en Black Óptica", `Receta: ${type}`];
  for (const key of ["od", "oi"]) {
    const eye = state.rx[key];
    lines.push(`${key.toUpperCase()}: ESF ${signed(eye.sphere)} / CIL ${signed(eye.cylinder || "0")} / EJE ${eye.axis || "—"}°`);
  }
  if (state.type === "both") lines.push(`ADD: ${signed(state.rx.add)}`);
  if (state.type === "both" && state.nearEnabled) {
    for (const key of ["od", "oi"]) {
      const eye = state.near[key];
      lines.push(`Cerca ${key.toUpperCase()}: ESF ${signed(eye.sphere)} / CIL ${signed(eye.cylinder || "0")} / EJE ${eye.axis || "—"}°`);
    }
  }
  lines.push("", ...state.options.map(option => `• ${option.name}: ${option.benefit}.`), "", "Sujeto a verificación de receta, medidas, stock y disponibilidad del laboratorio.");
  try {
    await navigator.clipboard.writeText(lines.join("\n"));
    $("copyButton").textContent = "Copiado";
    setTimeout(() => { $("copyButton").textContent = "Copiar resumen"; }, 2200);
  } catch {
    setStatus("No se pudo copiar desde este navegador.");
  }
}

for (const input of fileInputs) {
  input.addEventListener("change", event => {
    void handleFile(event.target.files?.[0]);
    event.target.value = "";
  });
}
$("dropZone").addEventListener("dragover", event => { event.preventDefault(); $("dropZone").classList.add("dragging"); });
$("dropZone").addEventListener("dragleave", () => $("dropZone").classList.remove("dragging"));
$("dropZone").addEventListener("drop", event => {
  event.preventDefault();
  $("dropZone").classList.remove("dragging");
  void handleFile(event.dataTransfer.files?.[0]);
});
for (const id of fields) {
  $(id).addEventListener("input", () => { readInputs(); invalidate(); });
}
$("nearToggle").addEventListener("change", event => {
  state.nearEnabled = event.target.checked;
  invalidate();
});
$("useAddButton").addEventListener("click", () => {
  const add = suggestAdd(state.rx, state.near);
  if (!add) return;
  state.rx.add = add;
  $("add").value = add;
  invalidate();
});
$("zoomButton").addEventListener("click", () => {
  $("dialogImage").src = state.previewUrl;
  $("imageDialog").showModal();
});
$("closeDialog").addEventListener("click", () => $("imageDialog").close());
document.querySelectorAll('input[name="rxType"]').forEach(input => input.addEventListener("change", () => {
  state.type = input.value;
  invalidate();
}));
$("confirmButton").addEventListener("click", () => {
  readInputs();
  if (validatePrescription(state.rx, state.type).length) return;
  state.options = optionsFor(state.rx, state.type);
  state.confirmed = true;
  render();
  $("results").scrollIntoView({ behavior: "smooth", block: "start" });
});
$("copyButton").addEventListener("click", copySummary);
$("manualButton").addEventListener("click", () => $("od-sphere").focus());
$("exampleButton").addEventListener("click", () => {
  state.rx = structuredClone(sample);
  state.near = emptyPrescription();
  state.nearEnabled = false;
  state.type = "both";
  syncInputs();
  invalidate();
  setStatus("Ejemplo cargado. Podés reemplazar los valores.");
});
$("reparseButton").addEventListener("click", () => {
  const found = applyText($("rawText").value);
  setStatus(found ? "Texto aplicado. Verificá los valores con la receta." : "No identifiqué ambos ojos. Completá los valores a mano.");
});
$("clearButton").addEventListener("click", () => {
  if (state.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(state.previewUrl);
  state.previewUrl = null;
  $("preview").removeAttribute("src");
  $("rawText").value = "";
  $("rawDetails").hidden = true;
  state.rx = emptyPrescription();
  state.near = emptyPrescription();
  state.nearEnabled = false;
  state.type = null;
  syncInputs();
  invalidate();
  setStatus("");
});
render();
