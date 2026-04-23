"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { useAuth } from "@/app/components/AuthProvider";
import { db } from "@/src/lib/firebase";
import { logActivity } from "@/src/lib/activity";
import {
  CharacterForm,
  type CharacterFormInitial,
  type CharacterValues,
  type Challenge,
  type RuneBuild,
  emptyCharacterForm,
} from "@/app/components/redesign/combat/CharacterForm";
import {
  MyCharactersSection,
  type MyCharacter,
} from "@/app/components/redesign/combat/MyCharactersSection";
import {
  GuildMembersSection,
  type GuildCharacter,
} from "@/app/components/redesign/combat/GuildMembersSection";
import {
  GrowthAnalysisSection,
  type GrowthCharacter,
} from "@/app/components/redesign/combat/GrowthAnalysisSection";

type Character = {
  id: string;
  owner: string;
  nickname: string;
  job: string;
  combatPower: number;
  hellStage: string;
  challenge: Challenge;
  runeBuilds?: RuneBuild[];
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
};

export default function CombatPage() {
  const { nickname: owner, ready } = useAuth();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [formInitial, setFormInitial] = useState<CharacterFormInitial>(
    emptyCharacterForm(),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, "characters"), orderBy("owner"));
    const unsub = onSnapshot(q, (snap) => {
      setCharacters(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Character[],
      );
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const myCharacters = useMemo<MyCharacter[]>(
    () =>
      owner
        ? characters
            .filter((c) => c.owner === owner)
            .sort((a, b) => (b.combatPower || 0) - (a.combatPower || 0))
        : [],
    [characters, owner],
  );

  const guildCharacters = useMemo<GuildCharacter[]>(
    () => characters.map((c) => c),
    [characters],
  );

  const handleAdd = useCallback(() => {
    setFormInitial(emptyCharacterForm());
    setError(null);
    setFormOpen(true);
  }, []);

  const handleEdit = useCallback((c: MyCharacter) => {
    setFormInitial({
      id: c.id,
      nickname: c.nickname,
      job: c.job,
      combatPower: c.combatPower ? String(c.combatPower) : "",
      hellStage: c.hellStage || "매어 이하",
      challenge: (c.challenge as Challenge) || "있음",
      runeBuilds: (c.runeBuilds ?? []).map((b) => ({
        name: b.name ?? "",
        dps: typeof b.dps === "number" ? String(b.dps) : "",
        isPublic: b.isPublic !== false,
      })),
    });
    setError(null);
    setFormOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    if (submitting) return;
    setFormOpen(false);
    setError(null);
  }, [submitting]);

  const handleSubmit = useCallback(
    async (values: CharacterValues) => {
      if (!owner) return;
      setSubmitting(true);
      setError(null);
      try {
        if (formInitial.id) {
          const existing = characters.find((c) => c.id === formInitial.id);
          if (!existing) throw new Error("캐릭터를 찾을 수 없습니다.");
          if (existing.owner !== owner) {
            throw new Error("본인 캐릭터만 수정할 수 있습니다.");
          }
          const prevCp = existing.combatPower || 0;
          const cpChanged = prevCp !== values.combatPower;
          if (cpChanged) {
            await addDoc(
              collection(db, "characters", formInitial.id, "history"),
              {
                combatPower: prevCp,
                hellStage: existing.hellStage || "",
                recordedAt: serverTimestamp(),
              },
            );
          }
          await updateDoc(doc(db, "characters", formInitial.id), {
            nickname: values.nickname,
            job: values.job,
            combatPower: values.combatPower,
            hellStage: values.hellStage,
            challenge: values.challenge,
            runeBuilds: values.runeBuilds,
            dps: deleteField(),
            updatedAt: serverTimestamp(),
          });
          if (cpChanged) {
            await logActivity(
              "combat",
              owner,
              `${owner}님이 투력을 업데이트했습니다`,
              "/combat",
            );
          }
        } else {
          await addDoc(collection(db, "characters"), {
            owner,
            nickname: values.nickname,
            job: values.job,
            combatPower: values.combatPower,
            hellStage: values.hellStage,
            challenge: values.challenge,
            runeBuilds: values.runeBuilds,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          await logActivity(
            "combat",
            owner,
            `${owner}님이 투력을 업데이트했습니다`,
            "/combat",
          );
        }
        setFormOpen(false);
      } catch (e) {
        console.error(e);
        setError(e instanceof Error ? e.message : "저장에 실패했습니다.");
      } finally {
        setSubmitting(false);
      }
    },
    [owner, formInitial.id, characters],
  );

  const handleDelete = useCallback(
    async (c: MyCharacter) => {
      if (!owner) return;
      if (c.owner !== owner) return;
      if (!confirm(`"${c.nickname}" 캐릭터를 삭제하시겠습니까?`)) return;
      try {
        await deleteDoc(doc(db, "characters", c.id));
      } catch (e) {
        console.error(e);
        alert("삭제에 실패했습니다.");
      }
    },
    [owner],
  );

  return (
    <div className="relative mx-auto max-w-4xl px-4 pt-3 pb-6 text-text-primary">
      {/* Page title */}
      <section className="mb-10 text-center sm:text-left">
        <h1
          className="font-serif leading-[1.05]"
          style={{
            fontFamily: "'Noto Serif KR', serif",
            fontSize: "clamp(34px, 7vw, 52px)",
            fontWeight: 300,
            letterSpacing: "0.04em",
            backgroundImage:
              "linear-gradient(135deg, #FFE5C4, #D896C8, #6B4BA8)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
            color: "transparent",
            filter: "drop-shadow(0 0 14px rgba(216, 150, 200, 0.35))",
          }}
        >
          투력 및 지옥 현황
        </h1>
        <p className="mt-3 font-serif text-[11px] tracking-[0.35em] text-nebula-pink/80 uppercase">
          Power &amp; Abyss
        </p>
        <p className="mt-4 break-keep font-serif text-sm italic text-text-sub text-balance">
          저마다의 빛이 얼마나 자라났는지
        </p>
      </section>

      <MyCharactersSection
        characters={myCharacters}
        ready={ready}
        owner={owner}
        onAdd={handleAdd}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      <GrowthAnalysisSection
        characters={guildCharacters as GrowthCharacter[]}
        owner={owner}
        ready={ready}
      />

      {loading ? (
        <p className="rounded-2xl border border-nebula-pink/15 bg-abyss-deep/30 px-6 py-10 text-center font-serif text-sm italic text-text-sub backdrop-blur-md">
          별빛을 불러오는 중...
        </p>
      ) : (
        <GuildMembersSection
          characters={guildCharacters}
          loginNick={owner}
        />
      )}

      <CharacterForm
        open={formOpen}
        initial={formInitial}
        submitting={submitting}
        error={error}
        onSubmit={handleSubmit}
        onClose={handleClose}
      />
    </div>
  );
}
