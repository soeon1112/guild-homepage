"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import BackLink from "@/app/components/BackLink";
import NicknameLink from "@/app/components/NicknameLink";
import { useAuth } from "@/app/components/AuthProvider";
import { db } from "@/src/lib/firebase";
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
import { Lock } from "lucide-react";
import { logActivity } from "@/src/lib/activity";
import GrowthAnalysis from "./GrowthAnalysis";

type Challenge = "있음" | "다소 있음" | "없음";

type RuneBuild = {
  name: string;
  dps: number;
  isPublic: boolean;
};

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

const JOBS = [
  "대검",
  "검술",
  "장궁",
  "석궁",
  "화법",
  "빙결",
  "전격",
  "힐러",
  "사제",
  "수도",
  "암흑",
  "음유",
  "악사",
  "댄서",
  "도적",
  "듀블",
  "격가",
  "전사",
];

const HELL_STAGES = [
  "매어 이하",
  "지옥1",
  "지옥2",
  "지옥3",
  "지옥4",
  "지옥5",
  "지옥6",
  "지옥7",
  "지옥8",
  "지옥9",
  "지옥10",
  "지옥11",
  "지옥12",
  "지옥13",
  "지옥14",
  "지옥15",
];

const CHALLENGES: Challenge[] = ["있음", "다소 있음", "없음"];

function shortHell(hell: string): string {
  if (!hell || hell === "매어 이하") return "-";
  return hell;
}

function shortChallenge(c: string): string {
  if (c === "있음") return "O";
  if (c === "다소 있음") return "△";
  if (c === "없음") return "X";
  return "";
}

type RuneBuildDraft = {
  key: string;
  name: string;
  dps: string;
  isPublic: boolean;
};

type FormState = {
  id: string | null;
  nickname: string;
  job: string;
  combatPower: string;
  hellStage: string;
  challenge: Challenge;
  runeBuilds: RuneBuildDraft[];
};

const emptyForm: FormState = {
  id: null,
  nickname: "",
  job: JOBS[0],
  combatPower: "",
  hellStage: HELL_STAGES[0],
  challenge: "있음",
  runeBuilds: [],
};

function makeBuildKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function CombatPage() {
  const { nickname: owner, ready } = useAuth();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  const sorted = useMemo(() => {
    const list = [...characters];
    list.sort((a, b) => {
      const byOwner = a.owner.localeCompare(b.owner, "ko");
      if (byOwner !== 0) return byOwner;
      return (b.combatPower || 0) - (a.combatPower || 0);
    });
    return list;
  }, [characters]);

  const openAdd = useCallback(() => {
    setForm(emptyForm);
    setError(null);
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((c: Character) => {
    setForm({
      id: c.id,
      nickname: c.nickname,
      job: c.job || JOBS[0],
      combatPower: c.combatPower ? String(c.combatPower) : "",
      hellStage: c.hellStage || HELL_STAGES[0],
      challenge: (c.challenge as Challenge) || "있음",
      runeBuilds: (c.runeBuilds ?? []).map((b) => ({
        key: makeBuildKey(),
        name: b.name ?? "",
        dps: typeof b.dps === "number" ? String(b.dps) : "",
        isPublic: b.isPublic !== false,
      })),
    });
    setError(null);
    setFormOpen(true);
  }, []);

  const closeForm = useCallback(() => {
    setFormOpen(false);
    setForm(emptyForm);
    setError(null);
  }, []);

  const addBuild = useCallback(() => {
    setForm((f) => ({
      ...f,
      runeBuilds: [
        ...f.runeBuilds,
        { key: makeBuildKey(), name: "", dps: "", isPublic: true },
      ],
    }));
  }, []);

  const updateBuild = useCallback(
    (key: string, patch: Partial<Omit<RuneBuildDraft, "key">>) => {
      setForm((f) => ({
        ...f,
        runeBuilds: f.runeBuilds.map((b) =>
          b.key === key ? { ...b, ...patch } : b,
        ),
      }));
    },
    [],
  );

  const removeBuild = useCallback((key: string) => {
    setForm((f) => ({
      ...f,
      runeBuilds: f.runeBuilds.filter((b) => b.key !== key),
    }));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!owner) return;
    const nick = form.nickname.trim();
    const cp = parseFloat(form.combatPower.replace(/,/g, ""));
    if (!nick) {
      setError("캐릭터 닉네임을 입력해주세요.");
      return;
    }
    if (!Number.isFinite(cp) || cp < 0) {
      setError("투력을 숫자로 입력해주세요.");
      return;
    }

    const builds: RuneBuild[] = [];
    for (const b of form.runeBuilds) {
      const name = b.name.trim();
      if (!name) {
        setError("룬 조합 이름을 입력해주세요.");
        return;
      }
      const dpsVal = parseFloat(b.dps.replace(/,/g, ""));
      if (!Number.isFinite(dpsVal) || dpsVal < 0) {
        setError(`"${name}" 룬 조합의 DPS를 숫자로 입력해주세요.`);
        return;
      }
      builds.push({ name, dps: dpsVal, isPublic: b.isPublic });
    }

    setSubmitting(true);
    setError(null);
    try {
      if (form.id) {
        const existing = characters.find((c) => c.id === form.id);
        if (!existing) throw new Error("캐릭터를 찾을 수 없습니다.");
        if (existing.owner !== owner) {
          throw new Error("본인 캐릭터만 수정할 수 있습니다.");
        }
        const prevCp = existing.combatPower || 0;
        const cpChanged = prevCp !== cp;
        if (cpChanged) {
          await addDoc(collection(db, "characters", form.id, "history"), {
            combatPower: prevCp,
            hellStage: existing.hellStage || "",
            recordedAt: serverTimestamp(),
          });
        }
        await updateDoc(doc(db, "characters", form.id), {
          nickname: nick,
          job: form.job,
          combatPower: cp,
          hellStage: form.hellStage,
          challenge: form.challenge,
          runeBuilds: builds,
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
          nickname: nick,
          job: form.job,
          combatPower: cp,
          hellStage: form.hellStage,
          challenge: form.challenge,
          runeBuilds: builds,
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
      closeForm();
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }, [owner, form, characters, closeForm]);

  const handleDelete = useCallback(
    async (c: Character) => {
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

  const myCharacters = useMemo(
    () => (owner ? characters.filter((c) => c.owner === owner) : []),
    [characters, owner],
  );

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((cur) => (cur === id ? null : id));
  }, []);

  const visibleBuilds = useCallback(
    (c: Character): RuneBuild[] => {
      const all = c.runeBuilds ?? [];
      if (owner && c.owner === owner) return all;
      return all.filter((b) => b.isPublic);
    },
    [owner],
  );

  const topDps = useCallback(
    (c: Character): number | null => {
      const vis = visibleBuilds(c);
      if (vis.length === 0) return null;
      return vis.reduce((max, b) => (b.dps > max ? b.dps : max), 0);
    },
    [visibleBuilds],
  );

  return (
    <div className="combat-content">
      <BackLink href="/" className="back-link">
        ← 홈으로
      </BackLink>

      <h1 className="combat-title">투력 및 지옥 현황</h1>

      <section className="combat-section combat-my">
        <div className="combat-section-head">
          <h2 className="combat-subtitle">내 캐릭터</h2>
          {ready && owner && (
            <button className="board-btn" onClick={openAdd}>
              + 캐릭터 추가
            </button>
          )}
        </div>

        {!ready ? null : !owner ? (
          <p className="combat-login-hint">
            로그인하면 내 캐릭터를 관리할 수 있습니다
          </p>
        ) : myCharacters.length === 0 && !formOpen ? (
          <p className="combat-login-hint">
            아직 등록된 캐릭터가 없습니다. 캐릭터를 추가해보세요.
          </p>
        ) : (
          <ul className="combat-my-list">
            {myCharacters.map((c) => (
              <li key={c.id} className="combat-my-item">
                <div className="combat-my-head">
                  <span className="combat-my-nick">{c.nickname}</span>
                  <div className="combat-my-buttons">
                    <button className="board-btn" onClick={() => openEdit(c)}>
                      수정
                    </button>
                    <button
                      className="board-btn board-btn-cancel"
                      onClick={() => handleDelete(c)}
                    >
                      삭제
                    </button>
                  </div>
                </div>
                <div className="combat-my-meta">
                  {c.job} · 투력 {c.combatPower.toLocaleString()} ·{" "}
                  {c.hellStage || "-"} · 도전{" "}
                  {shortChallenge(c.challenge) || "-"}
                </div>
                {c.runeBuilds && c.runeBuilds.length > 0 && (
                  <ul className="combat-my-runes">
                    {c.runeBuilds.map((b, i) => (
                      <li key={i} className="combat-my-rune">
                        <span className="combat-detail-name">
                          {!b.isPublic && (
                            <Lock
                              size={12}
                              className="combat-detail-lock"
                              aria-label="비공개"
                            />
                          )}
                          {b.name}
                        </span>
                        <span className="combat-detail-dps">
                          {b.dps.toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}

        {formOpen && owner && (
          <div className="combat-form-wrap">
          <h2 className="combat-subtitle">
            {form.id ? "캐릭터 수정" : "캐릭터 추가"}
          </h2>
          <div className="combat-form">
            <label className="combat-label">
              <span className="combat-label-text">캐릭터 닉네임</span>
              <input
                className="board-input"
                value={form.nickname}
                onChange={(e) =>
                  setForm((f) => ({ ...f, nickname: e.target.value }))
                }
                placeholder="본캐/부캐 닉네임"
              />
            </label>
            <label className="combat-label">
              <span className="combat-label-text">직업</span>
              <select
                className="board-input"
                value={form.job}
                onChange={(e) => setForm((f) => ({ ...f, job: e.target.value }))}
              >
                {JOBS.map((j) => (
                  <option key={j} value={j}>
                    {j}
                  </option>
                ))}
              </select>
            </label>
            <label className="combat-label">
              <span className="combat-label-text">투력</span>
              <input
                className="board-input"
                inputMode="numeric"
                value={form.combatPower}
                onChange={(e) =>
                  setForm((f) => ({ ...f, combatPower: e.target.value }))
                }
                placeholder="예: 125000"
              />
            </label>
            <label className="combat-label">
              <span className="combat-label-text">지옥 현황</span>
              <select
                className="board-input"
                value={form.hellStage}
                onChange={(e) =>
                  setForm((f) => ({ ...f, hellStage: e.target.value }))
                }
              >
                {HELL_STAGES.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
            <label className="combat-label">
              <span className="combat-label-text">도전 의사</span>
              <select
                className="board-input"
                value={form.challenge}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    challenge: e.target.value as Challenge,
                  }))
                }
              >
                {CHALLENGES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <div className="combat-runes">
              <div className="combat-runes-head">
                <span className="combat-label-text">룬 조합</span>
                <button
                  type="button"
                  className="board-btn combat-runes-add"
                  onClick={addBuild}
                >
                  + 조합 추가
                </button>
              </div>
              {form.runeBuilds.length === 0 ? (
                <p className="combat-runes-empty">등록된 룬 조합이 없습니다.</p>
              ) : (
                <ul className="combat-runes-list">
                  {form.runeBuilds.map((b) => (
                    <li key={b.key} className="combat-rune-item">
                      <input
                        className="board-input combat-rune-name"
                        value={b.name}
                        onChange={(e) =>
                          updateBuild(b.key, { name: e.target.value })
                        }
                        placeholder="조합 이름"
                      />
                      <input
                        className="board-input combat-rune-dps"
                        inputMode="numeric"
                        value={b.dps}
                        onChange={(e) =>
                          updateBuild(b.key, { dps: e.target.value })
                        }
                        placeholder="DPS"
                      />
                      <label className="combat-rune-toggle">
                        <input
                          type="checkbox"
                          checked={b.isPublic}
                          onChange={(e) =>
                            updateBuild(b.key, { isPublic: e.target.checked })
                          }
                        />
                        <span>{b.isPublic ? "공개" : "본인만"}</span>
                      </label>
                      <button
                        type="button"
                        className="combat-rune-remove"
                        onClick={() => removeBuild(b.key)}
                        aria-label="조합 삭제"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {error && <p className="combat-error">{error}</p>}
            <div className="board-form-buttons">
              <button
                className="board-btn"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? "저장 중..." : form.id ? "수정" : "등록"}
              </button>
              <button
                className="board-btn board-btn-cancel"
                onClick={closeForm}
                disabled={submitting}
              >
                취소
              </button>
            </div>
          </div>
          </div>
        )}
      </section>

      <section className="combat-section combat-growth">
        <h2 className="combat-subtitle">성장 분석</h2>
        <GrowthAnalysis
          characters={characters}
          owner={owner}
          ready={ready}
        />
      </section>

      <section className="combat-section">
        <h2 className="combat-subtitle">전체 길드원</h2>
        {loading ? (
          <p className="combat-loading">로딩 중...</p>
        ) : sorted.length === 0 ? (
          <p className="combat-loading">등록된 캐릭터가 없습니다.</p>
        ) : (
          <div className="combat-table-wrap">
            <table className="combat-table">
            <thead>
              <tr>
                <th className="col-owner">대표닉</th>
                <th className="col-nickname">캐릭터</th>
                <th className="col-job">직업</th>
                <th className="col-combat">투력</th>
                <th className="col-dps">DPS</th>
                <th className="col-hell">지옥</th>
                <th className="col-challenge">도전</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => {
                const isExpanded = expandedId === c.id;
                const dps = topDps(c);
                const builds = visibleBuilds(c);
                return (
                  <Fragment key={c.id}>
                    <tr
                      className="combat-row"
                      onClick={() => toggleExpand(c.id)}
                    >
                      <td className="col-owner">
                        <NicknameLink nickname={c.owner} hideTitle />
                      </td>
                      <td className="col-nickname">{c.nickname}</td>
                      <td className="col-job">{c.job}</td>
                      <td className="col-combat">
                        {c.combatPower ? c.combatPower.toLocaleString() : "-"}
                      </td>
                      <td className="col-dps">
                        {dps !== null ? dps.toLocaleString() : "-"}
                      </td>
                      <td className="col-hell">{shortHell(c.hellStage)}</td>
                      <td className="col-challenge">
                        {shortChallenge(c.challenge)}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="combat-row-detail">
                        <td colSpan={7}>
                          {builds.length === 0 ? (
                            <p className="combat-detail-empty">
                              등록된 룬 조합이 없습니다.
                            </p>
                          ) : (
                            <ul className="combat-detail-list">
                              {builds.map((b, i) => (
                                <li key={i} className="combat-detail-item">
                                  <span className="combat-detail-name">
                                    {!b.isPublic && (
                                      <Lock
                                        size={12}
                                        className="combat-detail-lock"
                                        aria-label="비공개"
                                      />
                                    )}
                                    {b.name}
                                  </span>
                                  <span className="combat-detail-dps">
                                    {b.dps.toLocaleString()}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </section>
    </div>
  );
}
