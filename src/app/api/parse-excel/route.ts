import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { loadSkipNames } from "@/lib/data-loader";
import type { CategoryInfo, EmployeeInfo } from "@/lib/types";

// Allow large file uploads
export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/parse-excel
 * Accepts an Excel file (multipart/form-data) and optional sheetName query param.
 * Returns parsed employee info, categories, and sheet names.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const sheetName = formData.get("sheetName") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const data = new Uint8Array(await file.arrayBuffer());
    const wb = XLSX.read(data, { type: "array" });
    const wsName = sheetName || wb.SheetNames[0];
    const ws = wb.Sheets[wsName];

    if (!ws) {
      return NextResponse.json(
        { error: `Sheet "${wsName}" not found`, sheets: wb.SheetNames },
        { status: 400 }
      );
    }

    const grade = wsName.toLowerCase().includes("jun") ? "jun" : "mid";

    const cell = (r: number, c: number): string | number | null => {
      const ref = XLSX.utils.encode_cell({ r: r - 1, c });
      const v = ws[ref] as XLSX.CellObject | undefined;
      return v ? (v.t === "n" ? (v.v as number) : v.w || String(v.v || "")) : null;
    };
    const cellStr = (r: number, c: number): string =>
      String(cell(r, c) || "");

    const info: EmployeeInfo = {
      employee: cellStr(2, 1) || "NAME SURNAME",
      date: cellStr(3, 1),
      level_before: cellStr(4, 1),
      project: cellStr(5, 1),
      manager: cellStr(6, 1),
      interviewer: cellStr(7, 1),
      grade: grade as "jun" | "mid",
    };

    // After-assessment info
    for (let r = 250; r <= 270; r++) {
      const a = cellStr(r, 0).toLowerCase();
      if (a.includes("after assessment level")) info.level_after = cellStr(r, 1);
      if (a.includes("next assessment date")) {
        const raw = cell(r, 1);
        if (typeof raw === "number") {
          const d = new Date((raw - 25569) * 86400000);
          info.next_date = d.toLocaleDateString("ru-RU", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          });
        } else {
          info.next_date = String(raw || "");
        }
      }
      if (a.includes("next level")) info.next_level = cellStr(r, 1);
    }

    // Find skills header row
    let skillsStart: number | null = null;
    for (let r = 20; r <= 30; r++) {
      if (cellStr(r, 0).toLowerCase().includes("skills")) {
        skillsStart = r + 1;
        break;
      }
    }

    const categories: CategoryInfo[] = [];
    if (!skillsStart) {
      return NextResponse.json({
        info,
        categories,
        sheets: wb.SheetNames,
      });
    }

    const skipNames = loadSkipNames();
    let current: CategoryInfo | null = null;
    const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
    const maxRow = range.e.r + 1;

    for (let r = skillsStart; r <= maxRow; r++) {
      const aVal = cellStr(r, 0).trim();
      const bVal = cellStr(r, 1).trim();
      const dRaw = cell(r, 3);
      const eVal = cellStr(r, 4);

      if (aVal && aVal.toLowerCase().includes("assessment result")) break;
      if (aVal && skipNames.some((s) => aVal.toLowerCase().includes(s)))
        continue;

      if (aVal) {
        if (dRaw !== null && dRaw !== "") {
          const score =
            typeof dRaw === "number" ? dRaw : parseFloat(String(dRaw));
          if (current) categories.push(current);
          current = {
            name: aVal,
            score: isNaN(score) ? null : score,
            subtopics: [],
            comment: eVal,
          };
          if (bVal) current.subtopics.push(bVal);
        } else if (bVal && dRaw !== null && dRaw !== "") {
          const score =
            typeof dRaw === "number" ? dRaw : parseFloat(String(dRaw));
          if (current) categories.push(current);
          current = {
            name: aVal,
            score: isNaN(score) ? null : score,
            subtopics: [bVal],
            comment: eVal,
          };
        } else {
          if (current) categories.push(current);
          current = null;
        }
      } else if (bVal && current) {
        current.subtopics.push(bVal);
      }
    }
    if (current) categories.push(current);

    return NextResponse.json({
      info,
      categories,
      sheets: wb.SheetNames,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
