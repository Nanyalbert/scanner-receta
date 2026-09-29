export const emptyPrescription = () => ({
  od: { sphere: "", cylinder: "", axis: "" },
  oi: { sphere: "", cylinder: "", axis: "" },
  add: "",
});

export function asNumber(value) {
  const normalized = String(value).trim().replace(",", ".").replace(/[−–—]/g, "-");
  return /^[+-]?\d+(?:\.\d+)?$/.test(normalized) ? Number(normalized) : null;
}

export function parsePrescription(text) {
  const rx = emptyPrescription();
  const source = String(text).toUpperCase()
    .replace(/[−–—]/g, "-")
    .replace(/,/g, ".")
    .replace(/([+-])\s+(?=\d)/g, "$1")
    .replace(/×/g, "X");
  const eyeMarker = /(?:^|[\s;:])(?:O\s*\.?\s*D\s*\.?|O\s*\.?\s*[I1L]\s*\.?|O\s*\.?\s*S\s*\.?|OJO\s+DERECHO|OJO\s+IZQUIERDO)\s*[:;]?/gm;
  const markers = [...source.matchAll(eyeMarker)];

  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i];
    const label = marker[0].replace(/[.\s:;]/g, "");
    const eye = label === "OD" || label === "OJODERECHO" ? "od" : "oi";
    const start = marker.index + marker[0].length;
    const end = markers[i + 1]?.index ?? source.length;
    const section = source.slice(start, end).slice(0, 180);
    const namedSphere = section.match(/\b(?:ESF(?:ERA)?|SPH(?:ERE)?)\s*[:=]?\s*([+-]?\d{1,2}(?:\.\d{1,2})?)/)?.[1];
    const namedCylinder = section.match(/\b(?:CIL(?:INDRO)?|CYL(?:INDER)?)\s*[:=]?\s*([+-]?\d{1,2}(?:\.\d{1,2})?)/)?.[1];
    const namedAxis = section.match(/\b(?:EJE|AXIS|AX)\s*[:=]?\s*(\d{1,3})/)?.[1];
    const cylinderAxis = section.match(/([+-]?\d{1,2}(?:\.\d{1,2})?)\s*(?:X|\*)\s*(\d{1,3})\s*[°º]?/);
    let sphere = namedSphere, cylinder = namedCylinder, axis = namedAxis;

    // Some ophthalmologists write EJE° + CIL + ESF instead of ESF CIL x EJE.
    const axisFirst = section.match(/^\s*(\d{1,3})\s*[°º]\s*([+-]\d{1,2}(?:\.\d{1,2})?)\s*([+-]\d{1,2}(?:\.\d{1,2})?)/);
    if (axisFirst) [axis, cylinder, sphere] = axisFirst.slice(1);

    if (cylinderAxis) {
      cylinder = cylinderAxis[1];
      axis = cylinderAxis[2];
      if (!sphere) {
        const preceding = section.slice(0, cylinderAxis.index).match(/[+-]?\d{1,3}(?:\.\d{1,2})?/g);
        sphere = preceding?.at(-1);
      }
    }
    if (!sphere || !cylinder || !axis) {
      const row = section.split(/\r?\n/)[0].trim();
      if (/^(?:(?:ESF|SPH)\s*[:=]?\s*)?[+-]?\d/.test(row)) {
        const values = row.match(/[+-]?\d{1,3}(?:\.\d{1,2})?/g) ?? [];
        if (values.length >= 3) [sphere, cylinder, axis] = values;
      }
    }
    if (sphere && cylinder && axis &&
      Math.abs(Number(sphere)) <= 30 && Math.abs(Number(cylinder)) <= 12 &&
      Number.isInteger(Number(axis)) && Number(axis) >= 1 && Number(axis) <= 180) {
      rx[eye] = { sphere, cylinder, axis };
    }
  }
  const add = source.match(/\b(?:ADD|ADICI[ÓO]N)\s*[:;=]?\s*([+]?[0-4](?:\.\d{1,2})?)/);
  if (add) rx.add = add[1];
  return rx;
}

export function suggestAdd(far, near) {
  const differences = [];
  for (const eye of ["od", "oi"]) {
    const f = far[eye], n = near[eye];
    const farSphere = asNumber(f.sphere), nearSphere = asNumber(n.sphere);
    const farCylinder = asNumber(f.cylinder || "0"), nearCylinder = asNumber(n.cylinder || "0");
    if (farSphere === null || nearSphere === null || farCylinder === null || nearCylinder === null ||
      Math.abs(farCylinder - nearCylinder) > 0.01 ||
      String(f.axis || "") !== String(n.axis || "")) return null;
    differences.push(nearSphere - farSphere);
  }
  if (Math.abs(differences[0] - differences[1]) > 0.01 || differences[0] <= 0 || differences[0] > 4) return null;
  return `+${differences[0].toFixed(2)}`;
}

export function parseDetailedPrescription(text) {
  const source = String(text);
  const farMarker = /\bLEJOS\b/i.exec(source);
  const nearMarker = /\bCERCA\b/i.exec(source);
  if (!farMarker || !nearMarker || nearMarker.index < farMarker.index) {
    return { far: parsePrescription(source), near: null, suggestedAdd: null };
  }
  const far = parsePrescription(source.slice(farMarker.index, nearMarker.index));
  const near = parsePrescription(source.slice(nearMarker.index));
  return { far, near, suggestedAdd: suggestAdd(far, near) };
}

export function validatePrescription(rx, type) {
  const issues = [];
  for (const [key, eye] of [["OD", rx.od], ["OI", rx.oi]]) {
    const sphere = asNumber(eye.sphere);
    const cylinder = eye.cylinder.trim() ? asNumber(eye.cylinder) : 0;
    const axis = eye.axis.trim() ? asNumber(eye.axis) : null;
    if (sphere === null || Math.abs(sphere) > 30) issues.push(`${key}: revisá la esfera.`);
    if (cylinder === null || Math.abs(cylinder) > 12) issues.push(`${key}: revisá el cilindro.`);
    if (cylinder !== null && cylinder !== 0 && (axis === null || axis < 1 || axis > 180 || !Number.isInteger(axis))) {
      issues.push(`${key}: falta un eje entre 1° y 180°.`);
    }
    if (axis !== null && (axis < 0 || axis > 180 || !Number.isInteger(axis))) issues.push(`${key}: revisá el eje.`);
  }
  if (!type) issues.push("Elegí qué tipo de receta estás cargando.");
  if (type === "both") {
    const add = asNumber(rx.add);
    if (add === null || add <= 0 || add > 4) issues.push("Para lejos y cerca, revisá la ADD.");
  }
  return [...new Set(issues)];
}
