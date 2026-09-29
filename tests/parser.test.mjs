import assert from "node:assert/strict";
import { parsePrescription, validatePrescription } from "../parser.js";

const cases = [
  ["OD -2,00 -0,50 x 180°\nOI +1,25 -0,75*90°\nADD +1,75",
    { sphere: "-2.00", cylinder: "-0.50", axis: "180" },
    { sphere: "+1.25", cylinder: "-0.75", axis: "90" }, "+1.75"],
  ["O.D.: ESF -3.25 CIL -0.50 × 175º DP 62\nO.I.: ESF -3.00 CIL -1.25*10º",
    { sphere: "-3.25", cylinder: "-0.50", axis: "175" },
    { sphere: "-3.00", cylinder: "-1.25", axis: "10" }, ""],
  ["OD AV 10/10 ESF -2.00 CIL -0.50 x 180°\nOI ESF -1.50 CIL -0.75 EJE 80",
    { sphere: "-2.00", cylinder: "-0.50", axis: "180" },
    { sphere: "-1.50", cylinder: "-0.75", axis: "80" }, ""],
  ["RECETA OPTICA\nOD -2.00 -0.50 x 180\nOl -1.75 -0.50*175\nADD +1.75",
    { sphere: "-2.00", cylinder: "-0.50", axis: "180" },
    { sphere: "-1.75", cylinder: "-0.50", axis: "175" }, "+1.75"],
];
for (const [text, od, oi, add] of cases) {
  assert.deepEqual(parsePrescription(text), { od, oi, add });
}
assert.equal(parsePrescription("OD -0.50 x 180°").od.sphere, "");
assert.equal(parsePrescription("OD -2.00 -0.50 x 190°").od.sphere, "");
const valid = parsePrescription(cases[0][0]);
assert.deepEqual(validatePrescription(valid, "both"), []);
assert.ok(validatePrescription(valid, "near").length === 0);
assert.ok(validatePrescription({ ...valid, add: "" }, "both").some(x => x.includes("ADD")));
console.log("Parser y validación: OK");
