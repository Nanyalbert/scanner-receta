const schemaEye = {
  type: "object", additionalProperties: false,
  properties: { sphere: { type: "string" }, cylinder: { type: "string" }, axis: { type: "string" } },
  required: ["sphere", "cylinder", "axis"],
};
const schemaPair = {
  type: "object", additionalProperties: false,
  properties: { od: schemaEye, oi: schemaEye }, required: ["od", "oi"],
};
const rxSchema = {
  type: "object", additionalProperties: false,
  properties: {
    type: { type: "string", enum: ["distance", "near", "both", "unknown"] },
    far: schemaPair, near: schemaPair, add: { type: "string" },
    uncertain: { type: "array", items: { type: "string" } },
    notes: { type: "string" },
  },
  required: ["type", "far", "near", "add", "uncertain", "notes"],
};
const instructions = `Transcribí exclusivamente la graduación óptica de la imagen. No hagas diagnóstico ni recomendación. Ignorá nombre, fecha, profesional, domicilio y otros datos personales. Distinguí LEJOS y CERCA, OD y OI. Una fila escrita "10° +0,25 +1,50" puede seguir el orden eje, cilindro, esfera. También puede ser esfera, cilindro x eje. Conservá cada signo y decimal. Devolvé esfera/cilindro como números con signo y punto decimal, eje como grados sin símbolo. Si la receta indica claramente solo esfera sin cilindro, devolvé cilindro "0.00" y eje vacío. Si hay una sola sección de CERCA, colocala en near y dejá far vacío. Si hay una sola sección de LEJOS, colocala en far y dejá near vacío. Si un signo o dígito no es legible, dejá ese valor vacío y agregá su campo a uncertain. No inventes datos ni calcules ADD: solo transcribila si está impresa. Nunca pongas un número de teléfono, fecha o dato ajeno a la graduación en estos campos.`;

function json(value, status, headers) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
}
function safeEye(value) {
  if (!value || typeof value !== "object") return null;
  const sphere = String(value.sphere ?? "").trim().replace(",", ".");
  const cylinder = String(value.cylinder ?? "").trim().replace(",", ".");
  const axis = String(value.axis ?? "").trim();
  if ((sphere && (!/^[+-]?\d{1,2}(?:\.\d{1,2})?$/.test(sphere) || Math.abs(Number(sphere)) > 30)) ||
      (cylinder && (!/^[+-]?\d{1,2}(?:\.\d{1,2})?$/.test(cylinder) || Math.abs(Number(cylinder)) > 12)) ||
      (axis && (!/^\d{1,3}$/.test(axis) || Number(axis) < 1 || Number(axis) > 180))) return null;
  return { sphere, cylinder, axis };
}
function safePair(value) {
  const od = safeEye(value?.od), oi = safeEye(value?.oi);
  return od && oi ? { od, oi } : null;
}
export function sanitizeResult(value) {
  const far = safePair(value?.far), near = safePair(value?.near);
  const add = String(value?.add ?? "").trim().replace(",", ".");
  if (!far || !near || !["distance", "near", "both", "unknown"].includes(value?.type) ||
      (add && (!/^\+?\d(?:\.\d{1,2})?$/.test(add) || Number(add) <= 0 || Number(add) > 4))) return null;
  return { type: value.type, far, near, add,
    uncertain: Array.isArray(value.uncertain) ? value.uncertain.filter(x => typeof x === "string").slice(0, 12) : [],
    notes: typeof value.notes === "string" ? value.notes.slice(0, 300) : "" };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("origin");
    const allowed = env.ALLOWED_ORIGIN || "https://nanyalbert.github.io";
    if (origin !== allowed && origin !== "http://localhost:8000") return json({ error: "Origen no permitido" }, 403);
    const cors = { "access-control-allow-origin": origin, "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type,x-access-code", "vary": "Origin" };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return json({ error: "Método no permitido" }, 405, cors);
    if (!env.OPENAI_API_KEY || !env.APP_ACCESS_TOKEN) return json({ error: "Servicio sin configurar" }, 503, cors);
    if (request.headers.get("x-access-code") !== env.APP_ACCESS_TOKEN) return json({ error: "Código de acceso incorrecto" }, 401, cors);
    let payload;
    try { payload = await request.json(); } catch { return json({ error: "Imagen inválida" }, 400, cors); }
    const image = payload?.image;
    if (typeof image !== "string" || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image) || image.length > 8_000_000)
      return json({ error: "Usá una imagen JPG, PNG o WEBP de menos de 6 MB" }, 400, cors);
    try {
      const api = await fetch("https://api.openai.com/v1/responses", {
        method: "POST", headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: env.OPENAI_MODEL || "gpt-5.4", store: false,
          input: [{ role: "user", content: [{ type: "input_text", text: instructions }, { type: "input_image", image_url: image, detail: "high" }] }],
          text: { format: { type: "json_schema", name: "optical_prescription", strict: true, schema: rxSchema } },
        }),
      });
      if (!api.ok) return json({ error: "No se pudo interpretar la imagen en este momento" }, 502, cors);
      const response = await api.json();
      const output = response.output?.flatMap(item => item.content || []).find(item => item.type === "output_text")?.text;
      const result = sanitizeResult(JSON.parse(output || "null"));
      if (!result) return json({ error: "La lectura no tuvo un formato verificable" }, 502, cors);
      return json(result, 200, cors);
    } catch {
      return json({ error: "No se pudo conectar con el servicio de interpretación" }, 502, cors);
    }
  },
};
