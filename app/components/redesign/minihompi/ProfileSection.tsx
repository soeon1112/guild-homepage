"use client";

import Link from "next/link";
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

// Pick the next free numeric slot id (1, 2, 3, ... 22, 23 ...). Avoids
// Korean-keyed doc ids that trip URL normalization on some clients.
async function pickFreeSlotId(): Promise<string> {
  const snap = await getDocs(collection(db, "members"));
  const used = new Set<string>();
  snap.forEach((d) => used.add(d.id));
  for (let i = 1; i < 10000; i++) {
    const candidate = String(i);
    if (!used.has(candidate)) return candidate;
  }
  // Pathological fallback — should never happen.
  return `slot-${Date.now()}`;
}
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "@/src/lib/firebase";
import { useUserMbti } from "@/src/lib/userMbti";
import { logActivity } from "@/src/lib/activity";
import { handleEvent } from "@/src/lib/badgeCheck";
import { BgmPlayer } from "./BgmPlayer";
import { KeywordsSection } from "./KeywordsSection";
import ProfileCropModal from "@/app/components/shared/ProfileCropModal";

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
  // Picked file → crop modal staging. Set by the <input> onChange,
  // cleared either by ProfileCropModal cancel/confirm. Holds the user's
  // raw upload until they pick a 1:1 frame.
  const [cropFile, setCropFile] = useState<File | null>(null);

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
    setEditMbti(currentMbti);
    setEditMode(true);
  };

  const handleClaim = async () => {
    if (!loginNick) return;
    setClaiming(true);
    try {
      // If this nickname already has a members doc (any id), route to
      // it rather than creating a duplicate.
      const existing = await getDocs(
        query(collection(db, "members"), where("nickname", "==", loginNick)),
      );
      if (!existing.empty) {
        const hit = existing.docs[0];
        onChange(hit.data() as MemberDoc);
        if (hit.id !== id) router.replace(`/members/${hit.id}`);
        return;
      }
      // Always assign an ASCII slot id, even when the URL slug is the
      // user's nickname. Korean-keyed doc ids break getDoc-by-URL on
      // some clients due to NFC/NFD normalization mismatches.
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
      handleEvent({
        type: "profileCreate",
        nickname: loginNick,
        when: new Date(),
      });
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

  // Accepts Blob too — ProfileCropModal hands us a JPEG Blob (canvas
  // re-encode) instead of the raw File the user picked. uploadBytes
  // takes either, so we just widen the type.
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
    <>
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
                  if (f) setCropFile(f);
                  // Reset value so picking the same file twice in a row
                  // still fires onChange (otherwise the browser dedupes).
                  e.target.value = "";
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

            {currentMbti && (
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
                {currentMbti}
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
            isOwner && (
              <CosmicButton onClick={startEdit} label="프로필 수정" />
            )
          )}
        </div>
      </div>
    </section>
    {cropFile && (
      <ProfileCropModal
        file={cropFile}
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

// ==== helper components ====

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
