const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1Sp6Zjr5KGvrlnyHBdp2Oq-heV4Z3rT0D_Wn0bNpaUi8/gviz/tq?tqx=out:csv";

function parseCsvLine(line: string): string[] {
  const cols: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        cols.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
  }
  cols.push(cur.trim());
  return cols;
}

function parseCSV(text: string) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const clean = parseCsvLine(lines[i]);

    const representative = clean[0] || "";
    const nickname = clean[1] || "";
    if (!representative && !nickname) continue;

    const combatStr = (clean[3] || "").replace(/,/g, "");
    const combat = parseFloat(combatStr);

    let hell = clean[4] || "";
    if (hell === "매어 이하") hell = "-";

    let challenge = clean[5] || "";
    if (challenge === "있음") challenge = "O";
    else if (challenge === "다소 있음") challenge = "△";
    else if (challenge === "없음") challenge = "X";

    rows.push({
      representative,
      nickname,
      job: clean[2] || "",
      combat: isNaN(combat) ? 0 : combat,
      hell,
      challenge,
    });
  }

  return rows;
}

export async function GET() {
  const res = await fetch(SHEET_URL, { next: { revalidate: 0 } });
  const text = await res.text();
  const data = parseCSV(text);

  return Response.json(data);
}
