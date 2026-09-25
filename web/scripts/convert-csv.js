const fs = require("fs");
const path = require("path");

const dataDir = path.resolve(__dirname, "../../src/Resources/Data");
const outDir = path.resolve(__dirname, "../src/gameplay/data");

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) return [];

  // Parse header
  const header = parseCSVLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row = {};
    for (let j = 0; j < header.length; j++) {
      let val = values[j] !== undefined ? values[j].trim() : "";
      // Strip surrounding quotes if present
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.substring(1, val.length - 1);
      }
      // Check numeric
      if (val !== "" && !isNaN(Number(val))) {
        val = Number(val);
      }
      row[header[j]] = val;
    }
    rows.push(row);
  }

  return rows;
}

function parseCSVLine(line) {
  const values = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      values.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  values.push(cur.trim());
  return values;
}

const files = fs.readdirSync(dataDir).filter(f => f.endsWith(".csv"));
for (const file of files) {
  const content = fs.readFileSync(path.join(dataDir, file), "utf-8");
  const json = parseCSV(content);
  const outName = file.replace(".csv", ".json");
  fs.writeFileSync(path.join(outDir, outName), JSON.stringify(json, null, 2));
  console.log(`Converted ${file} -> ${outName} (${json.length} records)`);
}
