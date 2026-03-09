import { parse } from "csv-parse/sync";
import { format, parseISO, addDays, isValid } from "date-fns";
import * as XLSX from "xlsx";

/** Canonical keys we expect after mapping */
export type NormalizedSandplanRow = {
  padName: string;
  laneName?: string;
  plannedStartDate?: string;
  plannedEndDate?: string;
  stagesPerDay?: number;
  tonsPerStage?: number;
  totalStages?: number;
  travelTimeHours?: number;
  avgTonsPerLoad?: number;
  loadUnloadTimeHours?: number;
  storageType?: string;
  storageCapacity?: number;
  requiredTrucksPerShift?: number;
  transitionDaysAfter?: number;
  customer?: string;
  basin?: string;
  notes?: string;
};

const HEADER_SYNONYMS: Record<string, keyof NormalizedSandplanRow> = {
  padname: "padName",
  pad: "padName",
  frac: "padName",
  job: "padName",
  wellpad: "padName",
  start: "plannedStartDate",
  startdate: "plannedStartDate",
  plannedstart: "plannedStartDate",
  end: "plannedEndDate",
  enddate: "plannedEndDate",
  plannedend: "plannedEndDate",
  stagesperday: "stagesPerDay",
  stages_day: "stagesPerDay",
  tonsperstage: "tonsPerStage",
  tons_stage: "tonsPerStage",
  totalstages: "totalStages",
  stages: "totalStages",
  travel: "travelTimeHours",
  traveltimehours: "travelTimeHours",
  avgtonsperload: "avgTonsPerLoad",
  tonsload: "avgTonsPerLoad",
  loadunload: "loadUnloadTimeHours",
  loadunloadtimehours: "loadUnloadTimeHours",
  storagetype: "storageType",
  silo_kube: "storageType",
  storagecap: "storageCapacity",
  storagecapacity: "storageCapacity",
  requiredtrucks: "requiredTrucksPerShift",
  trucks: "requiredTrucksPerShift",
  truckspershift: "requiredTrucksPerShift",
  transition: "transitionDaysAfter",
  transitiondaysafter: "transitionDaysAfter",
  lane: "laneName",
  spread: "laneName",
  crew: "laneName",
  lanename: "laneName",
  customer: "customer",
  basin: "basin",
  notes: "notes",
};

function normalizeHeader(header: string): keyof NormalizedSandplanRow | null {
  const key = header
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/_/g, "");
  return HEADER_SYNONYMS[key] ?? (key in HEADER_SYNONYMS ? null : null);
}

/** Map raw header string to canonical key; if no mapping, use normalized form for detection */
function mapHeader(header: string): string {
  const key = header.toLowerCase().replace(/\s+/g, "").replace(/_/g, "");
  const canonical = HEADER_SYNONYMS[key as keyof typeof HEADER_SYNONYMS];
  if (canonical) return canonical;
  return key;
}

/**
 * Parse date string; output YYYY-MM-DD or null.
 * Accepts YYYY-MM-DD, M/D/YYYY, M-D-YYYY, Excel serial-ish numbers.
 */
export function parseDate(str: string | undefined): string | null {
  if (str == null || String(str).trim() === "") return null;
  const s = String(str).trim();

  // Already ISO-like
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const d = parseISO(s);
    if (isValid(d)) return format(d, "yyyy-MM-dd");
    return null;
  }

  // M/D/YYYY or M-D-YYYY
  const slashMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (slashMatch) {
    const [, month, day, year] = slashMatch;
    const d = new Date(Number(year), Number(month) - 1, Number(day));
    if (isValid(d)) return format(d, "yyyy-MM-dd");
    return null;
  }

  // Excel serial date (integer days since 1900-01-01)
  const num = Number(s);
  if (Number.isInteger(num) && num > 0) {
    const excelEpoch = new Date(1899, 11, 30);
    const d = addDays(excelEpoch, num);
    if (isValid(d)) return format(d, "yyyy-MM-dd");
  }

  // Fallback: try parsing as full ISO
  const d = new Date(s);
  if (!isNaN(d.getTime())) return format(d, "yyyy-MM-dd");
  return null;
}

function toNum(val: unknown): number | undefined {
  if (val == null || val === "") return undefined;
  const n = Number(val);
  return Number.isNaN(n) ? undefined : n;
}

function toStr(val: unknown): string | undefined {
  if (val == null) return undefined;
  const s = String(val).trim();
  return s === "" ? undefined : s;
}

export interface ParseSandplanCsvResult {
  rows: NormalizedSandplanRow[];
  warnings: string[];
  detectedMappings?: Record<string, string>;
}

function isExcelBuffer(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) return true;
  if (buffer.length >= 8 && buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0) return true;
  return false;
}

function parseExcelBuffer(buffer: Buffer, warnings: string[], detectedMappings: Record<string, string>): Record<string, string>[] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  if (workbook.SheetNames.length === 0) {
    throw new Error("Excel file contains no sheets");
  }
  if (workbook.SheetNames.length > 1) {
    warnings.push(`Excel file has ${workbook.SheetNames.length} sheets; using first sheet "${workbook.SheetNames[0]}".`);
  }
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
  if (rawRows.length === 0) {
    throw new Error("Excel sheet is empty");
  }

  const rawHeaders = (rawRows[0] as unknown[]).map((h) => String(h).trim());
  const mappedHeaders = rawHeaders.map((h) => {
    const mapped = mapHeader(h);
    if (h !== mapped) detectedMappings[h] = mapped;
    return mapped;
  });

  const records: Record<string, string>[] = [];
  for (let r = 1; r < rawRows.length; r++) {
    const row = rawRows[r] as unknown[];
    const allEmpty = row.every((cell) => String(cell ?? "").trim() === "");
    if (allEmpty) continue;
    const obj: Record<string, string> = {};
    for (let c = 0; c < mappedHeaders.length; c++) {
      const cell = row[c];
      obj[mappedHeaders[c]] = String(cell ?? "").trim();
    }
    records.push(obj);
  }
  return records;
}

/**
 * Parse CSV or Excel buffer and normalize rows for Sand Planning import.
 * Does not touch DB.
 */
export function parseSandplanCsv(buffer: Buffer): ParseSandplanCsvResult {
  const warnings: string[] = [];
  const detectedMappings: Record<string, string> = {};

  let records: Record<string, string>[];

  if (isExcelBuffer(buffer)) {
    try {
      records = parseExcelBuffer(buffer, warnings, detectedMappings);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Excel parse failed: ${msg}`);
    }
  } else {
    try {
      records = parse(buffer, {
        columns: (rawHeaders: string[]) =>
          rawHeaders.map((h) => {
            const mapped = mapHeader(h);
            if (h !== mapped) detectedMappings[h] = mapped;
            return mapped;
          }),
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`CSV parse failed: ${msg}`);
    }
  }

  if (records.length === 0) {
    return { rows: [], warnings: ["File has no data rows."], detectedMappings };
  }

  const seenPadNames = new Set<string>();
  const rows: NormalizedSandplanRow[] = [];

  for (let i = 0; i < records.length; i++) {
    const raw = records[i];
    const rowIndex = i + 2; // 1-based + header

    const padName = toStr(raw.padName);
    if (!padName) {
      warnings.push(`Row ${rowIndex}: missing padName, skipped.`);
      continue;
    }

    if (seenPadNames.has(padName)) {
      warnings.push(`Row ${rowIndex}: duplicate padName "${padName}", last row wins.`);
    }
    seenPadNames.add(padName);

    const plannedStartDate = parseDate(toStr(raw.plannedStartDate));
    let plannedEndDate = parseDate(toStr(raw.plannedEndDate));
    const stagesPerDay = toNum(raw.stagesPerDay);
    const totalStages = toNum(raw.totalStages);

    if (!plannedEndDate && plannedStartDate && totalStages != null && stagesPerDay != null && stagesPerDay > 0) {
      const fracDays = Math.ceil(totalStages / stagesPerDay);
      const start = parseISO(plannedStartDate);
      const end = addDays(start, fracDays - 1);
      plannedEndDate = format(end, "yyyy-MM-dd");
    }

    rows.push({
      padName,
      laneName: toStr(raw.laneName),
      plannedStartDate: plannedStartDate ?? undefined,
      plannedEndDate: plannedEndDate ?? undefined,
      stagesPerDay,
      tonsPerStage: toNum(raw.tonsPerStage),
      totalStages,
      travelTimeHours: toNum(raw.travelTimeHours),
      avgTonsPerLoad: toNum(raw.avgTonsPerLoad),
      loadUnloadTimeHours: toNum(raw.loadUnloadTimeHours),
      storageType: toStr(raw.storageType),
      storageCapacity: toNum(raw.storageCapacity) ?? undefined,
      requiredTrucksPerShift: toNum(raw.requiredTrucksPerShift),
      transitionDaysAfter: toNum(raw.transitionDaysAfter),
      customer: toStr(raw.customer),
      basin: toStr(raw.basin),
      notes: toStr(raw.notes),
    });
  }

  return { rows, warnings, detectedMappings };
}
