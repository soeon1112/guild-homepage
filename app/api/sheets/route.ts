const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1Sp6Zjr5KGvrlnyHBdp2Oq-heV4Z3rT0D_Wn0bNpaUi8/gviz/tq?tqx=out:csv";

function parseCSV(text: string) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
    if (!cols || cols.length < 7) continue;

    const clean = cols.map((c) => c.replace(/^"|"$/g, "").trim());

    const combatStr = clean[3].replace(/,/g, "");
    const combat = parseFloat(combatStr);
    if (isNaN(combat)) continue;

    let hell = clean[4];
    if (hell === "매어 이하") hell = "-";

    let challenge = clean[5];
    if (challenge === "있음") challenge = "O";
    else if (challenge === "다소 있음") challenge = "△";
    else if (challenge === "없음") challenge = "X";

    rows.push({
      representative: clean[0],
      nickname: clean[1],
      job: clean[2],
      combat,
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
