const fs = require("fs");
const path = require("path");

const dataDir = path.resolve(__dirname, "../../src/Resources/Data");
const outDir = path.resolve(__dirname, "../src/gameplay/data");

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// The C# reads these tables by column index (FoodData.FromCSVLine uses
// line[3], line[4], ...), so the header text is decorative there. The port
// reads the JSON by key, so it needs a real identifier per column -- and for
// several files the header is not one: it spells out units ("NUTRITION ratio
// of base food points", "BATTERIES in hours"), asks a question
// ("ACTIVATES WHEN DROPPED?"), or is a two-word phrase ("NOISE NAME").
// Emitting the raw header produced keys like
// "NUTRITION ratio of base food points", which no reader ever asks for, so
// nutrition/batteries/FOV/... all loaded as undefined.
//
// These lists name the columns positionally, in the names the port's readers
// use. Anything already a clean identifier is listed unchanged, so the whole
// schema is visible in one place. The length is checked against the header
// below, the same way the C# validates COUNT_FIELDS: if a column is added,
// removed or reordered upstream, this throws instead of silently shifting
// every value after it into the wrong key.
const COLUMNS = {
  "Actors.csv": [
    "ID", "NAME", "PLURAL", "SPD", "HP", "STA", "ATK", "DMG", "DEF",
    "PRO_HIT", "PRO_SHOT", "FOV", "AUDIO", "SMELL", "SCORE", "FLAVOR",
  ],
  "Items_Armors.csv": ["ID", "NAME", "PLURAL", "PRO_HIT", "PRO_SHOT", "ENC", "WEIGHT", "FLAVOR"],
  "Items_Barricading.csv": ["ID", "NAME", "PLURAL", "VALUE", "STACKINGLIMIT", "FLAVOR"],
  "Items_Entertainment.csv": [
    "ID", "NAME", "PLURAL", "STACKING", "VALUE", "BORE_CHANCE", "FLAVOR",
  ],
  "Items_Explosives.csv": [
    "ID", "NAME", "PLURAL", "FUSE", "MAXTHROW", "STACKINGLIMIT", "RADIUS",
    "BLAST0", "BLAST1", "BLAST2", "BLAST3", "BLAST4", "BLAST5", "FLAVOR",
  ],
  "Items_Food.csv": [
    "ID", "NAME", "PLURAL", "NUTRITION", "BESTBEFORE", "STACKINGLIMIT", "FLAVOR",
  ],
  "Items_Lights.csv": ["ID", "NAME", "PLURAL", "FOV", "BATTERIES", "FLAVOR"],
  "Items_Medicine.csv": [
    "ID", "NAME", "PLURAL", "HP", "STA", "SLP", "INF", "SAN", "STACKING", "FLAVOR",
  ],
  "Items_MeleeWeapons.csv": [
    "ID", "NAME", "PLURAL", "ATK", "DMG", "STA", "DISARM", "TOOLBASHDMGBONUS",
    "TOOLBUILDBONUS", "STACKINGLIMIT", "ISFRAGILE", "FLAVOR",
  ],
  "Items_RangedWeapons.csv": [
    "ID", "NAME", "PLURAL", "ATK", "RAPID1", "RAPID2", "DMG", "RANGE", "MAXAMMO", "FLAVOR",
  ],
  "Items_Scentsprays.csv": ["ID", "NAME", "PLURAL", "QUANTITY", "STRENGTH", "FLAVOR"],
  "Items_Spraypaints.csv": ["ID", "NAME", "PLURAL", "QUANTITY", "FLAVOR"],
  "Items_Trackers.csv": ["ID", "NAME", "PLURAL", "BATTERIES", "HASCLOCK", "FLAVOR"],
  "Items_Traps.csv": [
    "ID", "NAME", "PLURAL", "STACKING",
    "DROP_ACTIVATE",   // "ACTIVATES WHEN DROPPED?"
    "USE_ACTIVATE",    // "USE TO ACTIVATE?"
    "TRIGGER_CHANCE",  // "TRIGGER CHANCE per quantity"
    "DAMAGE",          // "DAMAGE per quantity"
    "ONE_TIME",        // "DESACTIVATES WHEN TRIGGERED?" (header has a stray 0xA0)
    "BREAK_CHANCE",    // "BREAK CHANCE when TRIGGERED"
    "BLOCK_CHANCE",    // "BLOCK CHANCE per item"
    "BREAK_ESCAPE",    // "BREAK CHANCE when ESCAPE"
    "NOISY",           // "IS NOISY?"
    "NOISE",           // "NOISE NAME"
    "FLAMMABLE",       // "IS_FLAMMABLE? (unused yet)"
    "FLAVOR",
  ],
  "Skills.csv": ["ID", "NAME", "VALUE1", "VALUE2", "VALUE3", "VALUE4"],
};

function parseCSV(text, file) {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) return [];

  // Parse header
  const rawHeader = parseCSVLine(lines[0]);
  const header = COLUMNS[file] || rawHeader;
  if (header.length !== rawHeader.length) {
    throw new Error(
      `${file}: COLUMNS lists ${header.length} names but the header has ` +
        `${rawHeader.length} columns -- a column was added, removed or ` +
        `reordered upstream. Fix COLUMNS before regenerating.\n` +
        `  header: ${JSON.stringify(rawHeader)}`
    );
  }
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

// Parse and validate every file before writing any of them: a schema
// mismatch in the last file would otherwise leave the data directory
// half-regenerated, with some tables on the new column names and some
// still on the old ones.
const files = fs.readdirSync(dataDir).filter(f => f.endsWith(".csv"));
const converted = files.map(file => {
  const content = fs.readFileSync(path.join(dataDir, file), "utf-8");
  return { file, json: parseCSV(content, file) };
});

for (const { file, json } of converted) {
  const outName = file.replace(".csv", ".json");
  fs.writeFileSync(path.join(outDir, outName), JSON.stringify(json, null, 2));
  console.log(`Converted ${file} -> ${outName} (${json.length} records)`);
}
