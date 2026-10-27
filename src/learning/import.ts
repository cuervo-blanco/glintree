import { validateDraft, type LearningDraft, type ItemKind } from "./model";

function rows(text: string, delimiter: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (quoted || !field) quoted = !quoted;
      else field += char;
    } else if (!quoted && char === delimiter) {
      row.push(field);
      field = "";
    } else if (!quoted && (char === "\n" || char === "\r")) {
      row.push(field);
      result.push(row);
      row = [];
      field = "";
      if (char === "\r" && text[i + 1] === "\n") i++;
    } else field += char;
  }
  if (quoted) throw new Error("Close the quoted field in your CSV file.");
  row.push(field);
  result.push(row);
  return result.filter((entry) => entry.some((cell) => cell.trim()));
}
export function importList(
  text: string,
  list: string,
  language: string,
  kind: ItemKind,
): LearningDraft[] {
  if (text.length > 5000000) throw new Error("Use a list smaller than 5 MB.");
  text = text.replace(/^\uFEFF/, "").trim();
  if (!text) throw new Error("Choose a file with some words or concepts.");
  let entries: unknown[];
  if (text.startsWith("[")) {
    const data: unknown = JSON.parse(text);
    if (!Array.isArray(data)) throw new Error("JSON must contain an array.");
    entries = data;
  } else {
    const delimiter = text.split(/\r?\n/)[0].includes("\t") ? "\t" : ",";
    const data = rows(text, delimiter);
    const headings = data[0].map((cell) => cell.trim().toLowerCase());
    const hasHeader = headings.some((name) =>
      ["term", "word", "concept"].includes(name),
    );
    entries = hasHeader
      ? data
          .slice(1)
          .map((row) =>
            Object.fromEntries(headings.map((name, i) => [name, row[i] ?? ""])),
          )
      : data.map((row) => ({
          term: row[0],
          meaning: row[1] ?? "",
          examples: row[2] ?? "",
        }));
  }
  if (!entries.length || entries.length > 10000)
    throw new Error("Import between 1 and 10,000 rows.");
  return entries.map((entry, index) => {
    try {
      const row =
        typeof entry === "string"
          ? { term: entry }
          : (entry as Record<string, unknown>);
      return validateDraft({
        term: row.term ?? row.word ?? row.concept,
        language: row.language || language,
        kind: row.kind || kind,
        meaning: row.meaning ?? row.definition ?? "",
        examples: row.examples ?? "",
        datasets: [list.trim()],
        status: "new",
      });
    } catch (error) {
      throw new Error(
        `Row ${index + 1}: ${error instanceof Error ? error.message : "Invalid item."}`,
      );
    }
  });
}
