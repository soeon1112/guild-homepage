"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "@/src/lib/firebase";
import Avatar, {
  BODY_TYPES,
  BodyType,
  isBodyType,
  useAvatarData,
} from "@/app/components/Avatar";
import { logActivity } from "@/src/lib/activity";
import { handleEvent } from "@/src/lib/badgeCheck";
import { BgmPlayer } from "./BgmPlayer";
import Wardrobe from "./Wardrobe";
import { KeywordsSection } from "./KeywordsSection";

export type MemberDoc = {
  nickname: string;
  statusMessage: string;
  profileImage: string;
  bgmUrl?: string;
  mood?: string;
};

const MOOD_OPTIONS: { value: string; emoji: string; label: string }[] = [
  { value: "happy", emoji: "😊", label: "좋음" },
  { value: "excited", emoji: "😆", label: "신남" },
  { value: "sad", emoji: "😢", label: "슬픔" },
  { value: "angry", emoji: "😡", label: "화남" },
  { value: "tired", emoji: "😴", label: "피곤" },
  { value: "thinking", emoji: "🤔", label: "고민중" },
  { value: "love", emoji: "🥰", label: "행복" },
  { value: "cool", emoji: "😎", label: "쿨" },
];

function getMoodEmoji(mood?: string): string {
  if (!mood) return "";
  return MOOD_OPTIONS.find((m) => m.value === mood)?.emoji ?? "";
}

function hashCode(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function seeded(seed: number) {
  let s = seed || 1;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

const MBTI_TYPES = [
  "ISTJ", "ISFJ", "INFJ", "INTJ",
  "ISTP", "ISFP", "INFP", "INTP",
  "ESTP", "ESFP", "ENFP", "ENTP",
  "ESTJ", "ESFJ", "ENFJ", "ENTJ",
] as const;

type Props = {
  id: string;
  member: MemberDoc | null;
  loginNick: string | null;
  isOwner: boolean;
  onChange: (m: MemberDoc) => void;
};

export function ProfileSection({
  id,
  member,
  loginNick,
  isOwner,
  onChange,
}: Props) {
  const avatarData = useAvatarData(member?.nickname ?? null);
  const router = useRouter();

  const [editMode, setEditMode] = useState(false);
  const [editStatus, setEditStatus] = useState(member?.statusMessage ?? "");
  const [editBgmUrl, setEditBgmUrl] = useState(member?.bgmUrl ?? "");
  const [editMood, setEditMood] = useState(member?.mood ?? "");
  const [editBody, setEditBody] = useState<BodyType | "">("");
  const [editMbti, setEditMbti] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [showWardrobe, setShowWardrobe] = useState(false);

  const nickname = member?.nickname ?? "";

  const sparkles = useMemo(() => {
    const rand = seeded(hashCode(nickname || "새벽"));
    return Array.from({ length: 10 }, (_, i) => ({
      angle: (i / 10) * Math.PI * 2 + rand() * 0.5,
      dist: 90 + rand() * 30,
      r: 1 + rand() * 1.8,
      delay: rand() * 3,
      dur: 2 + rand() * 2.5,
    }));
  }, [nickname]);

  const startEdit = () => {
    setEditStatus(member?.statusMessage ?? "");
    setEditBgmUrl(member?.bgmUrl ?? "");
    setEditMood(member?.mood ?? "");
    setEditBody(
      isBodyType(avatarData?.avatarBody) ? avatarData.avatarBody : "",
    );
    setEditMbti(avatarData?.mbti ?? "");
    setEditMode(true);
  };

  const handleClaim = async () => {
    if (!loginNick) return;
    setClaiming(true);
    try {
      // Defensive: a members doc for this nickname might already exist
      // under a legacy slot id. If so, route the user there instead of
      // creating a duplicate at members/{slug}.
      const existing = await getDocs(
        query(collection(db, "members"), where("nickname", "==", loginNick)),
      );
      if (!existing.empty) {
        const hit = existing.docs[0];
        onChange(hit.data() as MemberDoc);
        if (hit.id !== id) router.replace(`/members/${hit.id}`);
        return;
      }
      const created: MemberDoc = {
        nickname: loginNick,
        statusMessage: "",
        profileImage: "",
      };
      await setDoc(doc(db, "members", id), {
        ...created,
        createdAt: serverTimestamp(),
      });
      onChange(created);
      handleEvent({
        type: "profileCreate",
        nickname: loginNick,
        when: new Date(),
      });
    } catch (e) {
      console.error(e);
      alert("프로필 등록 실패");
    }
    setClaiming(false);
  };

  const handleSave = async () => {
    if (!member) return;
    const currentBody = isBodyType(avatarData?.avatarBody)
      ? avatarData.avatarBody
      : "";
    const bodyChanged = editBody !== currentBody;
    const bodyAlreadySelected = !!avatarData?.bodySelected;
    const ownerPoints = avatarData?.points ?? 0;

    if (bodyChanged && bodyAlreadySelected) {
      if (ownerPoints < 100) {
        alert("별빛이 부족합니다. (100 별빛 필요)");
        return;
      }
      if (!confirm("환생하시겠습니까? 100 별빛이 차감됩니다.")) {
        return;
      }
    }

    setSaving(true);
    try {
      const newStatus = editStatus.trim();
      const newBgmUrl = editBgmUrl.trim();
      const newMood = editMood;
      const prevBgmUrl = member.bgmUrl ?? "";
      const prevMood = member.mood ?? "";
      const statusChanged = newStatus !== member.statusMessage;
      const bgmChanged = newBgmUrl !== prevBgmUrl;
      const moodChanged = newMood !== prevMood;
      const updates = {
        statusMessage: newStatus,
        bgmUrl: newBgmUrl,
        mood: newMood,
      };
      await updateDoc(doc(db, "members", id), updates);
      onChange({ ...member, ...updates });
      const currentMbti = avatarData?.mbti ?? "";
      const mbtiChanged = editMbti !== currentMbti;
      if (mbtiChanged) {
        await setDoc(
          doc(db, "users", member.nickname),
          { mbti: editMbti },
          { merge: true },
        );
        if (editMbti) {
          await logActivity(
            "mbti",
            member.nickname,
            currentMbti
              ? `${member.nickname}님의 MBTI가 변경되었습니다`
              : `${member.nickname}님의 MBTI가 추가되었습니다`,
            `/members/${id}`,
          );
        }
      }
      if (bodyChanged) {
        const patch: Record<string, unknown> = { avatarBody: editBody };
        if (editBody !== "" && !bodyAlreadySelected) {
          patch.bodySelected = true;
        }
        if (bodyAlreadySelected) {
          patch.points = increment(-100);
        }
        await setDoc(doc(db, "users", member.nickname), patch, { merge: true });
        if (bodyAlreadySelected) {
          await addDoc(
            collection(db, "users", member.nickname, "pointHistory"),
            {
              type: "아바타",
              points: -100,
              description: "체형 환생",
              createdAt: serverTimestamp(),
            },
          );
        }
      }
      if (statusChanged) {
        await logActivity(
          "status",
          member.nickname,
          `${member.nickname}님이 한마디를 수정했습니다`,
          `/members/${id}`,
        );
      }
      if (moodChanged && newMood) {
        await logActivity(
          "mood",
          member.nickname,
          `${member.nickname}님이 오늘 기분을 ${getMoodEmoji(newMood)}으로 설정했습니다`,
          `/members/${id}`,
        );
      }
      if (bgmChanged && newBgmUrl) {
        await logActivity(
          "bgm",
          member.nickname,
          prevBgmUrl
            ? `${member.nickname}님이 배경음악을 변경했습니다`
            : `${member.nickname}님이 배경음악을 설정했습니다`,
          `/members/${id}`,
        );
      }
      if (statusChanged) {
        handleEvent({ type: "statusChange", nickname: member.nickname });
      }
      if (bgmChanged && newBgmUrl) {
        handleEvent({
          type: "bgmChange",
          nickname: member.nickname,
          first: !prevBgmUrl,
        });
      }
      if (moodChanged && newMood) {
        handleEvent({
          type: "moodChange",
          nickname: member.nickname,
          mood: newMood,
          when: new Date(),
        });
      }
      setEditMode(false);
    } catch (e) {
      console.error(e);
      alert("저장 실패");
    }
    setSaving(false);
  };

  const handleBgmDelete = async () => {
    if (!member) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "members", id), { bgmUrl: "" });
      onChange({ ...member, bgmUrl: "" });
      setEditBgmUrl("");
    } catch (e) {
      console.error(e);
      alert("삭제 실패");
    }
    setSaving(false);
  };

  const handleImageUpload = async (file: File) => {
    if (!member) return;
    setUploading(true);
    try {
      const storageRef = ref(storage, `members/${id}/profile.jpg`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await updateDoc(doc(db, "members", id), { profileImage: url });
      onChange({ ...member, profileImage: url });
      await logActivity(
        "profile_image",
        member.nickname,
        `${member.nickname}님이 프로필 사진을 수정했습니다`,
        `/members/${id}`,
      );
      handleEvent({ type: "profileImageChange", nickname: member.nickname });
    } catch (e) {
      console.error(e);
      alert("이미지 업로드 실패");
    }
    setUploading(false);
  };

  // ==== EMPTY SLOT ====
  if (!member) {
    return (
      <section
        className="relative overflow-hidden rounded-2xl px-5 py-8 sm:px-6 sm:py-10"
        style={{
          background: "rgba(26, 15, 61, 0.4)",
          border: "1px dashed rgba(216, 150, 200, 0.3)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        <div className="flex flex-col items-center text-center">
          <div
            className="relative flex h-[140px] w-[140px] items-center justify-center rounded-full"
            style={{
              border: "1.5px dashed rgba(200, 168, 233, 0.4)",
              background:
                "radial-gradient(circle, rgba(107,75,168,0.12) 0%, rgba(11,8,33,0.3) 70%, transparent 100%)",
            }}
          >
            <span className="font-serif text-4xl text-text-sub/50">·</span>
          </div>
          <h2 className="mt-5 font-serif text-lg italic text-text-sub/80">
            미등록된 새벽
          </h2>
          <p className="mt-2 break-keep font-serif text-[12px] italic text-text-sub/60">
            아직 이 슬롯에 빛이 머물기 전
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2.5">
            {loginNick ? (
              <CosmicButton
                onClick={handleClaim}
                disabled={claiming}
                label={claiming ? "등록 중..." : "내 프로필로 등록"}
              />
            ) : (
              <p className="font-serif text-[12px] italic text-text-sub">
                로그인 후 프로필을 등록할 수 있습니다
              </p>
            )}
          </div>
        </div>
      </section>
    );
  }

  const moodEmoji = getMoodEmoji(member.mood);

  return (
    <section
      className="relative overflow-hidden rounded-2xl px-5 py-7 sm:px-6 sm:py-8"
      style={{
        background: "rgba(26, 15, 61, 0.4)",
        border: "1px solid rgba(216, 150, 200, 0.2)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        boxShadow:
          "0 4px 22px rgba(11,8,33,0.35), inset 0 1px 0 rgba(255,229,196,0.06)",
      }}
    >
      {/* Music player — top-left floating */}
      <div className="absolute left-4 top-4 z-20">
        <BgmPlayer bgmUrl={member.bgmUrl} />
      </div>

      <div className="flex flex-col items-center pt-6">
        {/* Avatar ring + sparkles + pulse */}
        <div className="relative">
          {sparkles.map((s, i) => (
            <span
              key={i}
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-1/2 rounded-full bg-stardust"
              style={{
                width: s.r,
                height: s.r,
                transform: `translate(calc(${(Math.cos(s.angle) * s.dist).toFixed(3)}px - 50%), calc(${(Math.sin(s.angle) * s.dist).toFixed(3)}px - 50%))`,
                filter: "drop-shadow(0 0 4px #FFE5C4)",
                opacity: 0.7,
                animation: `twinkle ${s.dur.toFixed(3)}s ease-in-out ${s.delay.toFixed(3)}s infinite`,
              }}
            />
          ))}

          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full border border-nebula-pink/50"
            style={{ animation: "pulse-ring 3s cubic-bezier(0,0,0.2,1) infinite" }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full border border-peach-accent/40"
            style={{ animation: "pulse-ring 3s cubic-bezier(0,0,0.2,1) 1s infinite" }}
          />

          {/* Gradient ring + profile image */}
          <div
            className="relative flex h-[140px] w-[140px] items-center justify-center rounded-full p-[3px] sm:h-[160px] sm:w-[160px]"
            style={{
              background:
                "conic-gradient(from 120deg, #FFE5C4, #D896C8, #6B4BA8, #D896C8, #FFE5C4)",
              boxShadow:
                "0 0 28px rgba(216,150,200,0.5), 0 0 48px rgba(107,75,168,0.35)",
            }}
          >
            <div className="relative h-full w-full overflow-hidden rounded-full bg-abyss-deep">
              {member.profileImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={member.profileImage}
                  alt={`${member.nickname}의 프로필 사진`}
                  className="block h-full w-full object-cover"
                />
              ) : (
                <svg viewBox="0 0 64 64" className="h-full w-full" aria-hidden>
                  <circle cx="32" cy="32" r="32" fill="#1A0F3D" />
                  <circle cx="32" cy="24" r="9" fill="#FFE5C4" opacity="0.9" />
                  <path
                    d="M 14 54 Q 32 36 50 54 L 50 64 L 14 64 Z"
                    fill="#FFE5C4"
                    opacity="0.85"
                  />
                </svg>
              )}
            </div>
          </div>

          {/* Upload overlay when editing */}
          {editMode && isOwner && (
            <label
              className="absolute inset-0 z-20 flex cursor-pointer items-center justify-center rounded-full font-serif text-[11px] tracking-wider text-stardust backdrop-blur-[2px] transition-all"
              style={{
                background: "rgba(11,8,33,0.55)",
                border: "1px solid rgba(216,150,200,0.5)",
              }}
            >
              {uploading ? "업로드 중..." : "사진 변경"}
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleImageUpload(f);
                }}
              />
            </label>
          )}
        </div>

        {/* Nickname + mood emoji OR editing inputs */}
        {editMode ? (
          <div className="mt-7 w-full max-w-sm space-y-3">
            <LabeledInput label="닉네임" value={member.nickname} disabled />
            <LabeledInput
              label="한마디"
              value={editStatus}
              onChange={setEditStatus}
              placeholder="한마디"
              maxLength={60}
            />
            <div className="flex gap-2">
              <LabeledInput
                label="배경음악 (YouTube URL)"
                value={editBgmUrl}
                onChange={setEditBgmUrl}
                placeholder="https://youtube.com/..."
                maxLength={200}
                className="flex-1"
              />
              <div className="flex items-end">
                <CosmicButton
                  onClick={handleBgmDelete}
                  disabled={saving || uploading || !member.bgmUrl}
                  label="삭제"
                  variant="cancel"
                  small
                />
              </div>
            </div>

            {/* Mood */}
            <div>
              <p className="mb-1.5 font-serif text-[10px] tracking-[0.3em] text-text-sub uppercase">
                기분
              </p>
              <div className="flex flex-wrap gap-1.5">
                <MoodOption
                  label="–"
                  active={editMood === ""}
                  onClick={() => setEditMood("")}
                />
                {MOOD_OPTIONS.map((m) => (
                  <MoodOption
                    key={m.value}
                    label={m.emoji}
                    title={m.label}
                    active={editMood === m.value}
                    onClick={() => setEditMood(m.value)}
                  />
                ))}
              </div>
            </div>

            {/* MBTI */}
            <div>
              <label
                htmlFor="mbti-select"
                className="mb-1.5 block font-serif text-[10px] tracking-[0.3em] text-text-sub uppercase"
              >
                MBTI
              </label>
              <select
                id="mbti-select"
                value={editMbti}
                onChange={(e) => setEditMbti(e.target.value)}
                className="w-full rounded-full border border-nebula-pink/30 bg-abyss-deep/60 px-3 py-2 font-serif text-[12px] text-text-primary focus:border-peach-accent/60 focus:outline-none focus:ring-2 focus:ring-peach-accent/30"
              >
                <option value="">선택 안 함</option>
                {MBTI_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            {/* Body */}
            <div>
              <label
                htmlFor="avatar-body-select"
                className="mb-1.5 block font-serif text-[10px] tracking-[0.3em] text-text-sub uppercase"
              >
                체형
              </label>
              <select
                id="avatar-body-select"
                value={editBody}
                onChange={(e) =>
                  setEditBody(e.target.value as BodyType | "")
                }
                className="w-full rounded-full border border-nebula-pink/30 bg-abyss-deep/60 px-3 py-2 font-serif text-[12px] text-text-primary focus:border-peach-accent/60 focus:outline-none focus:ring-2 focus:ring-peach-accent/30"
              >
                {!avatarData?.bodySelected && (
                  <option value="">선택 안 함</option>
                )}
                {BODY_TYPES.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
              {avatarData?.bodySelected && (
                <p className="mt-1.5 font-serif text-[10px] italic text-text-sub">
                  변경 시 100 별빛 (현재 {avatarData?.points ?? 0} 별빛)
                </p>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="mt-6 flex items-center gap-2">
              <h1
                className="font-serif leading-none"
                style={{
                  fontFamily: "'Noto Serif KR', serif",
                  fontSize: "clamp(28px, 5.2vw, 36px)",
                  fontWeight: 300,
                  letterSpacing: "0.06em",
                  backgroundImage:
                    "linear-gradient(135deg, #FFE5C4, #D896C8, #6B4BA8)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  color: "transparent",
                  filter: "drop-shadow(0 0 10px rgba(216,150,200,0.5))",
                }}
              >
                {member.nickname}
              </h1>
              {moodEmoji && (
                <span className="text-2xl sm:text-3xl" aria-hidden>
                  {moodEmoji}
                </span>
              )}
            </div>

            {member.statusMessage && (
              <p className="wrap-anywhere mt-3 max-w-[320px] text-center font-serif text-[13px] italic leading-relaxed text-text-sub text-balance">
                “{member.statusMessage}”
              </p>
            )}

            {avatarData?.mbti && (
              <div
                className="mt-3 inline-block rounded-full px-3 py-1 font-serif text-[12px] tracking-[0.3em]"
                style={{
                  background: "rgba(26, 15, 61, 0.5)",
                  border: "1px solid transparent",
                  backgroundImage:
                    "linear-gradient(rgba(26,15,61,0.5), rgba(26,15,61,0.5)), linear-gradient(135deg, #FFB5A7, #D896C8, #6B4BA8)",
                  backgroundOrigin: "border-box",
                  backgroundClip: "padding-box, border-box",
                  color: "#FFE5C4",
                  boxShadow:
                    "0 0 12px rgba(216,150,200,0.35), inset 0 0 8px rgba(255,229,196,0.08)",
                  backdropFilter: "blur(10px)",
                  WebkitBackdropFilter: "blur(10px)",
                }}
              >
                {avatarData.mbti}
              </div>
            )}

            <KeywordsSection
              memberId={id}
              targetNickname={member.nickname}
              loginNick={loginNick}
              isOwner={isOwner}
            />
          </>
        )}

        {/* Action buttons */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
          {editMode ? (
            <>
              <CosmicButton
                onClick={handleSave}
                disabled={saving || uploading}
                label={saving ? "저장 중..." : "저장"}
              />
              <CosmicButton
                onClick={() => setEditMode(false)}
                disabled={saving || uploading}
                label="취소"
                variant="cancel"
              />
            </>
          ) : (
            <>
              {isOwner && (
                <CosmicButton onClick={startEdit} label="프로필 수정" />
              )}
              {isOwner && (
                <CosmicButton
                  onClick={() => setShowWardrobe((v) => !v)}
                  label="옷장"
                />
              )}
            </>
          )}
        </div>

        {isOwner && showWardrobe && !editMode && avatarData && (
          <div
            className="mt-5 w-full max-w-sm rounded-xl p-4"
            style={{
              background: "rgba(11,8,33,0.45)",
              border: "1px solid rgba(216,150,200,0.2)",
            }}
          >
            {(avatarData.ownedFashion?.length ?? 0) === 0 ? (
              <div className="text-center">
                <p className="font-serif text-[12px] italic text-text-sub">
                  아직 옷이 없습니다. 상점에서 구매해보세요!
                </p>
                <Link
                  href="/shop"
                  className="mt-2 inline-block font-serif text-[11px] tracking-wider text-peach-accent hover:text-stardust"
                >
                  상점으로 →
                </Link>
              </div>
            ) : (
              <Wardrobe nickname={nickname} data={avatarData} />
            )}
          </div>
        )}

        {/* Avatar system slot — 320×512 (5:8 ratio) */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="mt-8 flex w-full items-center justify-center"
        >
          <AvatarSystemSlot>
            {isBodyType(avatarData?.avatarBody) ? (
              <Avatar data={avatarData} />
            ) : isOwner ? (
              <button
                type="button"
                onClick={startEdit}
                className="flex flex-col items-center gap-2 font-serif text-[12px] italic text-text-sub hover:text-stardust"
              >
                <span className="text-3xl opacity-50">✦</span>
                체형을 선택해주세요
              </button>
            ) : (
              <AvatarSilhouette />
            )}
          </AvatarSystemSlot>
        </motion.div>
      </div>
    </section>
  );
}

// ==== helper components ====

function AvatarSystemSlot({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative" aria-label="아바타 시스템">
      {/* Ambient glow */}
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-5 rounded-[32px]"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(107,75,168,0.3) 0%, rgba(216,150,200,0.1) 48%, transparent 78%)",
          filter: "blur(14px)",
        }}
      />
      <FloatingParticle className="-top-2 -left-3" size={4} color="#FFE5C4" delay={0} dur={3.4} />
      <FloatingParticle className="top-12 -right-4" size={3} color="#D896C8" delay={1.1} dur={4.2} />
      <FloatingParticle className="bottom-10 -left-4" size={5} color="#FFB5A7" delay={2} dur={3.8} />

      <div
        className="relative flex w-[350px] max-w-full flex-col overflow-hidden rounded-2xl md:w-[500px] md:border md:border-[rgba(200,168,233,0.22)] md:bg-[linear-gradient(180deg,rgba(26,15,61,0.45)_0%,rgba(61,46,107,0.28)_100%)] md:shadow-[0_8px_32px_rgba(11,8,33,0.4),inset_0_1px_0_rgba(255,229,196,0.05),inset_0_0_40px_rgba(107,75,168,0.18)] md:backdrop-blur-[18px]"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 hidden md:block"
          style={{
            background:
              "radial-gradient(ellipse at 50% 40%, rgba(216,150,200,0.14) 0%, transparent 58%), radial-gradient(ellipse at 30% 85%, rgba(107,75,168,0.2) 0%, transparent 62%)",
          }}
        />
        <div className="relative flex w-full items-center justify-center">
          {children}
        </div>
      </div>
    </div>
  );
}

function FloatingParticle({
  className,
  size,
  color,
  delay,
  dur,
}: {
  className?: string;
  size: number;
  color: string;
  delay: number;
  dur: number;
}) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute rounded-full ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        background: color,
        filter: `drop-shadow(0 0 ${size + 2}px ${color})`,
        animation: `twinkle ${dur}s ease-in-out ${delay}s infinite`,
      }}
    />
  );
}

function AvatarSilhouette() {
  return (
    <svg
      width="180"
      height="300"
      viewBox="0 0 180 300"
      fill="none"
      aria-hidden
      style={{ filter: "drop-shadow(0 0 10px rgba(216,150,200,0.25))" }}
    >
      <defs>
        <linearGradient id="avatarSilhouetteGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6B4BA8" />
          <stop offset="50%" stopColor="#D896C8" />
          <stop offset="100%" stopColor="#FFB5A7" />
        </linearGradient>
      </defs>
      <circle cx="90" cy="55" r="26" stroke="url(#avatarSilhouetteGradient)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M78 82 L78 96 C78 100, 60 106, 48 116 C40 122, 34 132, 32 146" stroke="url(#avatarSilhouetteGradient)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M102 82 L102 96 C102 100, 120 106, 132 116 C140 122, 146 132, 148 146" stroke="url(#avatarSilhouetteGradient)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M48 116 C54 140, 58 170, 60 200 L60 235" stroke="url(#avatarSilhouetteGradient)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M132 116 C126 140, 122 170, 120 200 L120 235" stroke="url(#avatarSilhouetteGradient)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M60 200 Q90 208, 120 200" stroke="url(#avatarSilhouetteGradient)" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
      <path d="M66 235 L62 288" stroke="url(#avatarSilhouetteGradient)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M114 235 L118 288" stroke="url(#avatarSilhouetteGradient)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M40 150 Q36 180, 40 210" stroke="url(#avatarSilhouetteGradient)" strokeWidth="1.2" strokeLinecap="round" opacity="0.65" />
      <path d="M140 150 Q144 180, 140 210" stroke="url(#avatarSilhouetteGradient)" strokeWidth="1.2" strokeLinecap="round" opacity="0.65" />
    </svg>
  );
}

function CosmicButton({
  label,
  onClick,
  disabled,
  href,
  as,
  variant = "primary",
  small,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  href?: string;
  as?: "link";
  variant?: "primary" | "cancel";
  small?: boolean;
}) {
  const cls = `group relative overflow-hidden rounded-full font-serif tracking-wider transition-all duration-300 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 ${
    small ? "px-3 py-1.5 text-[10px]" : "px-4 py-2 text-[11px]"
  } ${variant === "cancel" ? "text-text-sub" : "text-stardust"}`;

  const innerBorder = (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 rounded-full"
      style={{
        padding: "1px",
        background:
          variant === "cancel"
            ? "linear-gradient(135deg, rgba(200,168,233,0.4), rgba(200,168,233,0.2))"
            : "linear-gradient(135deg, #6B4BA8, #D896C8, #FFB5A7)",
        WebkitMask:
          "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
        WebkitMaskComposite: "xor",
        maskComposite: "exclude",
      }}
    />
  );
  const hoverGlow = (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 rounded-full opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      style={{
        boxShadow:
          "0 0 16px rgba(216,150,200,0.55), inset 0 0 12px rgba(255,229,196,0.15)",
      }}
    />
  );
  const bg = { background: "rgba(26, 15, 61, 0.5)", backdropFilter: "blur(12px)" };

  if (as === "link" && href) {
    return (
      <Link href={href} className={cls} style={bg}>
        {innerBorder}
        <span className="relative">{label}</span>
        {hoverGlow}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={cls}
      style={bg}
      onClick={onClick}
      disabled={disabled}
    >
      {innerBorder}
      <span className="relative">{label}</span>
      {hoverGlow}
    </button>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  disabled,
  className,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="mb-1.5 font-serif text-[10px] tracking-[0.3em] text-text-sub uppercase">
        {label}
      </p>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={disabled}
        readOnly={!onChange}
        className="w-full rounded-full border border-nebula-pink/30 bg-abyss-deep/60 px-3 py-2 font-serif text-[12px] text-text-primary placeholder:text-text-sub/60 focus:border-peach-accent/60 focus:outline-none focus:ring-2 focus:ring-peach-accent/30 disabled:opacity-60"
      />
    </div>
  );
}

function MoodOption({
  label,
  title,
  active,
  onClick,
}: {
  label: string;
  title?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex h-9 w-9 items-center justify-center rounded-full text-base transition-all ${
        active
          ? "border-peach-accent/70 bg-peach-accent/20 scale-110 shadow-[0_0_12px_rgba(255,181,167,0.5)]"
          : "border-nebula-pink/25 bg-abyss-deep/60 hover:border-nebula-pink/60"
      } border`}
    >
      {label}
    </button>
  );
}
