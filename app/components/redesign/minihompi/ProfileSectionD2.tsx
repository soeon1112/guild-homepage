"use client";

import { useState } from "react";
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
import { useUserMbti } from "@/src/lib/userMbti";
import { logActivity } from "@/src/lib/activity";
import { pickFreeSlotId } from "@/src/lib/pickFreeSlotId";
import { BgmPlayerD2 } from "./BgmPlayerD2";
import ProfileCropModal from "@/app/components/shared/ProfileCropModal";
import type { MemberDoc } from "./ProfileSection";

// dawnlight2 미니홈피 1단계 — 프로필 영역.
// 동작 (claim, 편집, BGM, MBTI, body, mood, save 등) 은 cosmic
// ProfileSection 와 1:1 동일. 디자인만 v0 양피지 톤.
//
// 1단계 디자인 결정사항:
//   - 베이지 박스 #e8c8a8
//   - 프로필 사진 ripple 2개: 피치 (#f4a87a / #ffd4b0)
//   - 닉네임 + 작은 깃발 SVG
//   - MBTI: ✦ + 텍스트만 (compass 동그라미 X)
//   - 한마디 메모지 + 가로 테이프 1개 (메모지 폭 1/3)
//   - 키워드: KeywordsSectionD2
//   - 아바타: cosmic Avatar 시스템 그대로
//   - BGM: BgmPlayerD2 (음표만 + 짙은 베이지 박스)


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

export function ProfileSectionD2({
  id,
  member,
  loginNick,
  isOwner,
  onChange,
}: Props) {
  const currentMbti = useUserMbti(member?.nickname ?? null);
  const router = useRouter();

  const [editMode, setEditMode] = useState(false);
  const [editStatus, setEditStatus] = useState(member?.statusMessage ?? "");
  const [editBgmUrl, setEditBgmUrl] = useState(member?.bgmUrl ?? "");
  const [editMood, setEditMood] = useState(member?.mood ?? "");
  const [editMbti, setEditMbti] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  // Picked file → crop modal staging (same pattern as cosmic ProfileSection).
  // Cleared by ProfileCropModal cancel/confirm.
  const [cropFile, setCropFile] = useState<File | null>(null);

  const startEdit = () => {
    setEditStatus(member?.statusMessage ?? "");
    setEditBgmUrl(member?.bgmUrl ?? "");
    setEditMood(member?.mood ?? "");
    setEditMbti(currentMbti);
    setEditMode(true);
  };

  const handleClaim = async () => {
    if (!loginNick) return;
    setClaiming(true);
    try {
      const existing = await getDocs(
        query(collection(db, "members"), where("nickname", "==", loginNick)),
      );
      if (!existing.empty) {
        const hit = existing.docs[0];
        onChange(hit.data() as MemberDoc);
        if (hit.id !== id) router.replace(`/members/${hit.id}`);
        return;
      }
      const slotId = await pickFreeSlotId();
      const created: MemberDoc = {
        nickname: loginNick,
        statusMessage: "",
        profileImage: "",
      };
      await setDoc(doc(db, "members", slotId), {
        ...created,
        createdAt: serverTimestamp(),
      });
      onChange(created);
      if (slotId !== id) router.replace(`/members/${slotId}`);
    } catch (e) {
      console.error(e);
      alert("프로필 등록 실패");
    }
    setClaiming(false);
  };

  const handleSave = async () => {
    if (!member) return;
    setSaving(true);
    try {
      const newStatus = editStatus.trim();
      const newBgmUrl = editBgmUrl.trim();
      const newMood = editMood;
      const prevBgmUrl = member.bgmUrl ?? "";
      const prevMood = member.mood ?? "";
      const prevStatus = member.statusMessage ?? "";
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
              ? `${member.nickname}님이 MBTI를 변경했어요`
              : `${member.nickname}님이 MBTI를 설정했어요`,
            `/members/${id}`,
          );
        }
      }
      if (statusChanged) {
        await logActivity(
          "status",
          member.nickname,
          prevStatus
            ? `${member.nickname}님이 한마디를 수정했어요`
            : `${member.nickname}님이 한마디를 설정했어요`,
          `/members/${id}`,
        );
      }
      if (moodChanged && newMood) {
        await logActivity(
          "mood",
          member.nickname,
          `${member.nickname}님이 오늘 기분을 ${getMoodEmoji(newMood)}으로 설정했어요`,
          `/members/${id}`,
        );
      }
      if (bgmChanged && newBgmUrl) {
        await logActivity(
          "bgm",
          member.nickname,
          prevBgmUrl
            ? `${member.nickname}님이 배경음악을 변경했어요`
            : `${member.nickname}님이 배경음악을 설정했어요`,
          `/members/${id}`,
        );
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

  // Accepts Blob too — ProfileCropModal hands us a JPEG Blob (canvas
  // re-encode) instead of the raw File the user picked.
  const handleImageUpload = async (file: Blob | File) => {
    if (!member) return;
    setUploading(true);
    try {
      const hadPrevImage = !!member.profileImage;
      const storageRef = ref(storage, `members/${id}/profile.jpg`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await updateDoc(doc(db, "members", id), { profileImage: url });
      onChange({ ...member, profileImage: url });
      await logActivity(
        "profile_image",
        member.nickname,
        hadPrevImage
          ? `${member.nickname}님이 프로필 사진을 변경했어요`
          : `${member.nickname}님이 프로필 사진을 설정했어요`,
        `/members/${id}`,
      );
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
          background: "rgba(232, 200, 168, 0.7)",
          border: "1px dashed rgba(140, 100, 60, 0.45)",
          boxShadow: "0 4px 22px rgba(80,40,10,0.18)",
        }}
      >
        <div className="flex flex-col items-center text-center">
          <div
            className="relative flex h-[140px] w-[140px] items-center justify-center rounded-full"
            style={{
              border: "1.5px dashed rgba(140, 100, 60, 0.45)",
              background:
                "radial-gradient(circle, rgba(255,255,255,0.25) 0%, rgba(232,200,168,0.4) 70%, transparent 100%)",
            }}
          >
            <span
              className="font-serif text-4xl"
              style={{ color: "rgba(90,58,26,0.45)" }}
            >
              ·
            </span>
          </div>
          <h2
            className="mt-5 font-serif text-lg italic"
            style={{ color: "rgba(90,58,26,0.78)" }}
          >
            미등록된 새벽
          </h2>
          <p
            className="mt-2 break-keep font-serif text-[12px] italic"
            style={{ color: "rgba(90,58,26,0.6)" }}
          >
            아직 이 슬롯에 빛이 머물기 전
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2.5">
            {!loginNick ? (
              <p
                className="font-serif text-[12px] italic"
                style={{ color: "rgba(90,58,26,0.65)" }}
              >
                로그인 후 프로필을 등록할 수 있습니다
              </p>
            ) : loginNick === id ? (
              <ParchmentButton
                onClick={handleClaim}
                disabled={claiming}
                label={claiming ? "등록 중..." : "내 프로필로 등록"}
              />
            ) : (
              <p
                className="font-serif text-[12px] italic"
                style={{ color: "rgba(90,58,26,0.65)" }}
              >
                본인 카드에서만 등록할 수 있어요
              </p>
            )}
          </div>
        </div>
      </section>
    );
  }

  const moodEmoji = getMoodEmoji(member.mood);

  return (
    <>
    <section
      className="relative overflow-hidden rounded-2xl"
      style={{
        background: "rgba(232, 200, 168, 0.7)",
        boxShadow: "0 4px 24px rgba(80, 40, 10, 0.18)",
      }}
    >
      <style>{`
        @keyframes mh-d2-ripple {
          0%   { transform: scale(1);   opacity: 0.7; }
          100% { transform: scale(1.6); opacity: 0; }
        }
      `}</style>

      {/* BGM player — top-left */}
      <div className="absolute left-4 top-4 z-20">
        <BgmPlayerD2 bgmUrl={member.bgmUrl} />
      </div>

      <div className="flex flex-col items-center gap-5 px-6 pb-8 pt-12">
        {/* Avatar with sunset ripple */}
        <div className="relative flex items-center justify-center">
          {/* Two ripple rings — cosmic PulseRing pattern, peach color */}
          <span
            aria-hidden
            className="pointer-events-none absolute rounded-full"
            style={{
              width: 124,
              height: 124,
              border: "2px solid #f4a87a",
              animation: "mh-d2-ripple 3s ease-out infinite",
            }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute rounded-full"
            style={{
              width: 124,
              height: 124,
              border: "1.5px solid #ffd4b0",
              animation: "mh-d2-ripple 3s ease-out 1.5s infinite",
            }}
          />

          <div
            className="relative z-10 flex h-[124px] w-[124px] items-center justify-center overflow-hidden rounded-full"
            style={{
              border: "3px solid #c8a878",
              boxShadow: "0 0 18px rgba(244,168,122,0.4)",
              background: "#c8a070",
            }}
          >
            {member.profileImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={member.profileImage}
                alt={`${member.nickname}의 프로필 사진`}
                className="block h-full w-full object-cover"
              />
            ) : (
              <svg viewBox="0 0 96 96" className="h-full w-full" aria-hidden>
                <rect width="96" height="96" fill="#d4a870" />
                <circle cx="48" cy="36" r="18" fill="#b88850" opacity="0.8" />
                <ellipse cx="48" cy="82" rx="28" ry="20" fill="#a87840" opacity="0.7" />
                <circle cx="42" cy="33" r="2.5" fill="#3a2a1a" opacity="0.7" />
                <circle cx="54" cy="33" r="2.5" fill="#3a2a1a" opacity="0.7" />
                <path
                  d="M 43 41 Q 48 46 53 41"
                  stroke="#3a2a1a"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  fill="none"
                  opacity="0.7"
                />
              </svg>
            )}

            {editMode && isOwner && (
              <label
                className="absolute inset-0 z-20 flex cursor-pointer items-center justify-center rounded-full font-serif text-[11px] tracking-wider transition-all"
                style={{
                  background: "rgba(58,42,26,0.55)",
                  border: "1px solid rgba(255,229,196,0.45)",
                  color: "#fef5e6",
                }}
              >
                {uploading ? "업로드 중..." : "사진 변경"}
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setCropFile(f);
                    // Reset value so picking the same file twice fires onChange.
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>
        </div>

        {editMode ? (
          <div className="w-full max-w-sm space-y-3">
            <ParchmentLabeledInput
              label="닉네임"
              value={member.nickname}
              disabled
            />
            <ParchmentLabeledInput
              label="한마디"
              value={editStatus}
              onChange={setEditStatus}
              placeholder="한마디"
              maxLength={60}
            />
            <div className="flex gap-2">
              <ParchmentLabeledInput
                label="배경음악 (YouTube URL)"
                value={editBgmUrl}
                onChange={setEditBgmUrl}
                placeholder="https://youtube.com/..."
                maxLength={200}
                className="flex-1"
              />
              <div className="flex items-end">
                <ParchmentButton
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
              <p
                className="mb-1.5 font-serif text-[10px] tracking-[0.3em] uppercase"
                style={{ color: "rgba(90,58,26,0.7)" }}
              >
                기분
              </p>
              <div className="flex flex-wrap gap-1.5">
                <ParchmentMoodOption
                  label="–"
                  active={editMood === ""}
                  onClick={() => setEditMood("")}
                />
                {MOOD_OPTIONS.map((m) => (
                  <ParchmentMoodOption
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
                htmlFor="mbti-select-d2"
                className="mb-1.5 block font-serif text-[10px] tracking-[0.3em] uppercase"
                style={{ color: "rgba(90,58,26,0.7)" }}
              >
                MBTI
              </label>
              <select
                id="mbti-select-d2"
                value={editMbti}
                onChange={(e) => setEditMbti(e.target.value)}
                className="w-full rounded-full px-3 py-2 font-serif text-[12px] focus:outline-none"
                style={{
                  background: "rgba(255,255,255,0.45)",
                  border: "1px solid rgba(140,100,60,0.32)",
                  color: "#3a2a1a",
                }}
              >
                <option value="">선택 안 함</option>
                {MBTI_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

          </div>
        ) : (
          <>
            {/* Nickname + mood emoji (깃발 제거 — 닉네임 옆 깃발 element) */}
            <div className="flex items-center gap-2">
              <h1
                className="text-2xl font-semibold leading-none"
                style={{ color: "#3a2a1a" }}
              >
                {member.nickname}
              </h1>
              {moodEmoji && (
                <span className="text-2xl" aria-hidden>
                  {moodEmoji}
                </span>
              )}
            </div>

            {/* MBTI: ✦ + ENFP only (compass dot 제거) */}
            {currentMbti && (
              <div className="flex items-center gap-1.5">
                <span
                  className="font-serif text-sm font-medium"
                  style={{ color: "#5a3a1a" }}
                >
                  ✦ {currentMbti}
                </span>
              </div>
            )}

            {/* 한마디 메모지 + 가로 테이프 1개 */}
            {member.statusMessage && (
              <div
                className="relative w-full max-w-xs"
                style={{ transform: "rotate(-1deg)" }}
              >
                <div
                  className="relative rounded-sm px-4 py-3"
                  style={{
                    background: "#f5e8d0",
                    boxShadow:
                      "0 2px 8px rgba(80,40,10,0.16), 0 1px 2px rgba(80,40,10,0.10)",
                    border: "1px solid rgba(160,120,70,0.20)",
                  }}
                >
                  {/* Horizontal kraft-paper tape — opaque #c9a880, slight tilt */}
                  <div
                    className="absolute -top-2 left-1/2 h-[14px] w-20 -translate-x-1/2"
                    style={{
                      background: "#c9a880",
                      opacity: 0.92,
                      borderRadius: "2px",
                      boxShadow:
                        "0 1px 2px rgba(92,58,31,0.2), inset 0 1px 0 rgba(255,255,255,0.18)",
                      transform: "rotate(-2deg)",
                    }}
                    aria-hidden
                  />
                  <p
                    className="text-center font-serif text-[13px] italic leading-relaxed"
                    style={{ color: "#5a3a1a" }}
                  >
                    {member.statusMessage}
                  </p>
                </div>
              </div>
            )}

          </>
        )}

        {/* Action buttons */}
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2.5">
          {editMode ? (
            <>
              <ParchmentButton
                onClick={handleSave}
                disabled={saving || uploading}
                label={saving ? "저장 중..." : "저장"}
              />
              <ParchmentButton
                onClick={() => setEditMode(false)}
                disabled={saving || uploading}
                label="취소"
                variant="cancel"
              />
            </>
          ) : (
            isOwner && (
              <ParchmentButton onClick={startEdit} label="프로필 수정" />
            )
          )}
        </div>
      </div>
    </section>
    {cropFile && (
      <ProfileCropModal
        file={cropFile}
        dawnlight2
        onCancel={() => setCropFile(null)}
        onConfirm={async (blob) => {
          await handleImageUpload(blob);
          setCropFile(null);
        }}
      />
    )}
    </>
  );
}

function ParchmentButton({
  label,
  onClick,
  disabled,
  variant = "primary",
  small,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "cancel";
  small?: boolean;
}) {
  const padding = small ? "px-3 py-1.5 text-[10px]" : "px-4 py-2 text-[11px]";
  const colors =
    variant === "cancel"
      ? {
          background: "rgba(255,255,255,0.4)",
          border: "1px solid rgba(140,100,60,0.28)",
          color: "rgba(90,58,26,0.7)",
        }
      : {
          background: "rgba(244,168,122,0.32)",
          border: "1px solid rgba(160,120,70,0.32)",
          color: "#5a3a1a",
        };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full font-serif tracking-wider transition-all duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 ${padding}`}
      style={colors}
    >
      {label}
    </button>
  );
}

function ParchmentLabeledInput({
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
      <p
        className="mb-1.5 font-serif text-[10px] tracking-[0.3em] uppercase"
        style={{ color: "rgba(90,58,26,0.7)" }}
      >
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
        className="w-full rounded-full px-3 py-2 font-serif text-[12px] placeholder:opacity-60 focus:outline-none disabled:opacity-60"
        style={{
          background: "rgba(255,255,255,0.45)",
          border: "1px solid rgba(140,100,60,0.32)",
          color: "#3a2a1a",
        }}
      />
    </div>
  );
}

function ParchmentMoodOption({
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
        active ? "scale-110" : "hover:scale-105"
      }`}
      style={
        active
          ? {
              background: "rgba(244,168,122,0.4)",
              border: "1px solid #c87838",
              boxShadow: "0 0 10px rgba(244,168,122,0.45)",
            }
          : {
              background: "rgba(255,255,255,0.4)",
              border: "1px solid rgba(140,100,60,0.25)",
            }
      }
    >
      {label}
    </button>
  );
}
