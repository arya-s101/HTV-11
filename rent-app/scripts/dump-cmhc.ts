import * as XLSX from "xlsx";
const wb = XLSX.readFile(process.argv[2]);
const want = process.argv[3];
for (const name of wb.SheetNames) {
  if (want && name !== want) { continue; }
  const ws = wb.Sheets[name];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  console.log("=== SHEET", name, ws["!ref"]);
  if (!want) { console.log(JSON.stringify(rows.slice(0, 3))); continue; }
  rows.forEach((r, i) => console.log(i + 1, JSON.stringify(r)));
}
