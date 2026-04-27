// /api/pet-chat — Anthropic proxy for the pet chat feature. The
// client never sees the API key. Body is the conversation history +
// pet/owner identity; we build the system prompt server-side, call
// Claude Haiku 4.5, persist user+pet messages to Firestore for admin
// log review, and return the assistant text.

import { NextRequest, NextResponse } from "next/server";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import {
  buildPetChatSystemPrompt,
  buildRecentActivityText,
  isBadInput,
  PET_CHAT_MAX_HISTORY,
  PET_CHAT_MAX_INPUT_LEN,
  type PetChatMessage,
  type PetChatStats,
} from "@/src/lib/petChat";
import { playgroundLogDateKey } from "@/src/lib/pets";
import type { InteractionId, PetStage, PetType } from "@/src/lib/pets";

export const runtime = "nodejs";

// GET /api/pet-chat → diagnostic. Returns whether the env var is
// present (without leaking the value). Hit this URL from a browser
// to confirm Vercel env config before debugging the chat itself.
export async function GET() {
  const has = !!process.env.ANTHROPIC_API_KEY;
  return NextResponse.json({
    apiKeyConfigured: has,
    hint: has
      ? "OK"
      : "Add ANTHROPIC_API_KEY to Vercel project Settings → Environment Variables, then redeploy.",
  });
}


type ChatRequestBody = {
  nickname: string;
  petType: PetType;
  petStage: PetStage;
  petName: string;
  stats: PetChatStats;
  history: PetChatMessage[];
};

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[pet-chat] ANTHROPIC_API_KEY not in process.env");
    return NextResponse.json(
      {
        error: "ANTHROPIC_API_KEY not configured on server",
        hint: "Add ANTHROPIC_API_KEY to Vercel project Settings → Environment Variables, then redeploy.",
      },
      { status: 500 },
    );
  }

  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { nickname, petType, petStage, petName, stats, history } = body;
  if (!nickname || !petType || !petStage || !petName || !history?.length) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const lastUser = history[history.length - 1];
  if (lastUser.role !== "user") {
    return NextResponse.json({ error: "last_must_be_user" }, { status: 400 });
  }

  if (lastUser.content.length > PET_CHAT_MAX_INPUT_LEN) {
    return NextResponse.json({ error: "too_long" }, { status: 400 });
  }
  if (isBadInput(lastUser.content)) {
    return NextResponse.json({ error: "bad_input" }, { status: 400 });
  }

  // Ban check from Firestore.
  const petRef = doc(db, "users", nickname, "pet", "current");
  const petSnap = await getDoc(petRef);
  if (!petSnap.exists()) {
    return NextResponse.json({ error: "pet_not_found" }, { status: 404 });
  }
  const petData = petSnap.data() as
    | { petChatBanned?: boolean; cooldowns?: Partial<Record<InteractionId, { toMillis: () => number }>> }
    | undefined;
  if (petData?.petChatBanned) {
    return NextResponse.json({ error: "banned" }, { status: 403 });
  }

  // Pull recent-activity context: cooldowns map (last per interaction
  // type) + today's playground log. Pass to the prompt builder so the
  // pet can reference what just happened in conversation.
  let recentActivityText: string | null = null;
  try {
    const cooldowns = (petData?.cooldowns ?? {}) as Partial<
      Record<InteractionId, { toMillis: () => number }>
    >;
    const today = playgroundLogDateKey();
    const pgRef = doc(db, "users", nickname, "playgroundLog", today);
    const pgSnap = await getDoc(pgRef);
    const pgData = pgSnap.exists()
      ? (pgSnap.data() as {
          greetedWith?: Record<string, { toMillis: () => number }>;
          playedWith?: Record<string, { toMillis: () => number }>;
          treatedWith?: Record<string, { toMillis: () => number }>;
        })
      : null;
    recentActivityText = buildRecentActivityText(cooldowns, pgData);
  } catch (e) {
    // Fallback — chat still works without activity context.
    console.warn("[pet-chat] recent activity build failed", e);
  }

  // Build prompt + Claude messages payload.
  const systemPrompt = buildPetChatSystemPrompt({
    type: petType,
    stage: petStage,
    petName,
    ownerNickname: nickname,
    stats,
    recentActivityText,
  });
  const trimmed = history.slice(-PET_CHAT_MAX_HISTORY);
  const claudeMessages = trimmed.map((m) => ({
    role: m.role === "user" ? "user" : "assistant",
    content: m.content,
  }));

  let assistantText: string;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        system: systemPrompt,
        messages: claudeMessages,
      }),
    });
    if (!r.ok) {
      const errText = await r.text();
      console.error("[pet-chat] Anthropic API error", r.status, errText);
      return NextResponse.json(
        { error: "api_error", status: r.status, detail: errText.slice(0, 500) },
        { status: 502 },
      );
    }
    const data = await r.json();
    assistantText = data?.content?.[0]?.text ?? "";
    if (!assistantText.trim()) {
      return NextResponse.json({ error: "empty_response" }, { status: 502 });
    }
  } catch (e) {
    console.error("[pet-chat] fetch error", e);
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "fetch_failed", detail }, { status: 502 });
  }

  // Persist last user msg + pet response for admin log viewer.
  try {
    const logsRef = collection(db, "petChatLogs", nickname, "messages");
    const now = Timestamp.now();
    await Promise.all([
      addDoc(logsRef, { role: "user", content: lastUser.content, createdAt: now }),
      addDoc(logsRef, { role: "pet", content: assistantText, createdAt: now }),
    ]);
    // Keep last 100 — drop older.
    const ordered = query(logsRef, orderBy("createdAt", "desc"));
    const snap = await getDocs(ordered);
    const overflow = snap.docs.slice(100);
    if (overflow.length > 0) {
      const batch = writeBatch(db);
      overflow.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    // Summary doc for the admin user list.
    await setDoc(
      doc(db, "petChatLogs", nickname),
      {
        nickname,
        petName,
        petType,
        petStage,
        lastChatAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (e) {
    console.error("[pet-chat] log write failed", e);
  }

  return NextResponse.json({ ok: true, reply: assistantText });
}
