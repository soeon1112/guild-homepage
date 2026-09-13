"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { doc, updateDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "@/src/lib/firebase";
import { useUserMbti } from "@/src/lib/userMbti";
import { MEMBER_TAGS } from "@/src/lib/memberTags";
import { PLAY_TIME_OPTIONS } from "@/src/lib/playTime";
import type { MemberRowData } from "@/app/components/members/MemberRow";

// 길드원 한 줄 목록 — 본인 프사 클릭 시 여는 편집 모달 (Phase 3).
//
// "ProfileEditModal 재사용" 지시가 있었지만 그런 이름의 컴포넌트는
// 코드베이스에 없다(Phase 0 진단에서도 확인) — 실제로 있는 건
// app/components/redesign/minihompi/ProfileSectionD2.tsx의 인라인 편집
// 폼(오버레이 모달이 아니라 페이지 내 토글)뿐이다. 그 파일은 손대지
// 않고, 같은 저장 패턴만 그대로 복제했다:
//   - 프사 업로드: ProfileSectionD2.handleImageUpload 동일 패턴
//     (members/{id}/profile.jpg) — 단, 그쪽의 1:1 crop 단계(setCropFile
//     + 별도 크롭 모달)는 이 Phase 지시에 없어 생략, 고른 파일을 그대로
//     업로드한다.
//   - MBTI: users/{nickname}.mbti — useUserMbti(읽기)는 그대로 재사용,
//     저장은 이 파일에서 새로 함(그 훅은 구독 전용이라 쓰기 함수가 없음)
//   - 한마디: members/{id}.statusMessage
//
// 취향 태그 · 플레이 시간대는 logActivity를 호출하지 않는다 — 그 두
// 타입은 어디에도 등록돼 있지 않아서 등록하려면 functions/를 건드려야
// 하고, 이번 Phase 지시엔 없는 일이라 범위 밖으로 남겨뒀다.

const CREAM = "#fef5e6";
const PARCHMENT = "#f8f2e8";
const INK = "#3a2a1a";
const INK_SOFT = "rgba(58, 42, 26, 0.65)";
const SUNSET_GOLD = "#ffc785";
const STATUS_MAX_LEN = 50;

const MBTI_TYPES = [
  "ISTJ", "ISFJ", "INFJ", "INTJ",
  "ISTP", "ISFP", "INFP", "INTP",
  "ESTP", "ESFP", "ENFP", "ENTP",
  "ESTJ", "ESFJ", "ENFJ", "ENTJ",
];

function toggleValue(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value];
}

export function MemberProfileEditModal({
  visible,
  member,
  onClose,
  onSaved,
}: {
  visible: boolean;
  member: MemberRowData | null;
  onClose: () => void;
  /** 저장/업로드 성공 후 호출 — 부모가 리스트를 다시 fetch한다. */
  onSaved: () => void;
}) {
  const currentMbti = useUserMbti(member?.nickname ?? null);

  const [editStatus, setEditStatus] = useState("");
  const [editMbti, setEditMbti] = useState("");
  const [editPlayTime, setEditPlayTime] = useState<string[]>([]);
  const [editTags, setEditTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // 열릴 때(visible: false → true)만 폼을 현재 값으로 시드한다. mbti는
  // onSnapshot 구독이라 계속 값이 갱신되는데, 그때마다 재시드하면 편집
  // 중인 선택이 날아가므로 의도적으로 `visible`에만 의존한다.
  useEffect(() => {
    if (!visible || !member) return;
    setEditStatus(member.statusMessage ?? "");
    setEditMbti(currentMbti);
    setEditPlayTime(member.playTime ?? []);
    setEditTags(member.tags ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!member) return null;

  const handleImageUpload = async (file: File) => {
    if (!member.memberDocId) return;
    try {
      setUploading(true);
      const storageRef = ref(storage, `members/${member.memberDocId}/profile.jpg`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await updateDoc(doc(db, "members", member.memberDocId), {
        profileImage: url,
      });
      onSaved();
    } catch (e) {
      console.error(e);
      alert("이미지 업로드 실패");
    }
    setUploading(false);
  };

  const handleSave = async () => {
    if (!member.memberDocId) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "users", member.nickname), {
        playTime: editPlayTime,
        tags: editTags,
        mbti: editMbti,
      });
      await updateDoc(doc(db, "members", member.memberDocId), {
        statusMessage: editStatus.trim(),
      });
      onSaved();
      onClose();
    } catch (e) {
      console.error(e);
      alert("저장 실패");
    }
    setSaving(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(11, 8, 33, 0.55)" }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[90vh] w-full max-w-[480px] flex-col overflow-y-auto rounded-[20px] p-5"
            style={{ background: CREAM }}
          >
            <h2
              className="mb-4 text-center text-base font-semibold"
              style={{ color: INK }}
            >
              프로필 편집
            </h2>

            <label
              className="relative mx-auto flex h-[88px] w-[88px] cursor-pointer items-center justify-center overflow-hidden rounded-full"
              style={{ background: PARCHMENT }}
            >
              {member.profileImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={member.profileImage}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-3xl" style={{ color: INK_SOFT }}>
                  +
                </span>
              )}
              <span
                className="absolute inset-x-0 bottom-0 py-1.5 text-center text-[10px]"
                style={{ background: "rgba(58, 42, 26, 0.55)", color: CREAM }}
              >
                {uploading ? "업로드 중..." : "사진 변경"}
              </span>
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleImageUpload(f);
                  e.target.value = "";
                }}
              />
            </label>

            <div className="mt-5 flex flex-col gap-1.5">
              <span className="text-xs font-semibold" style={{ color: INK }}>
                한마디
              </span>
              <input
                type="text"
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
                placeholder="한마디"
                maxLength={STATUS_MAX_LEN}
                className="rounded-xl px-3 py-2.5 text-sm focus:outline-none"
                style={{
                  background: PARCHMENT,
                  border: "1px solid rgba(58, 42, 26, 0.2)",
                  color: INK,
                }}
              />
            </div>

            <div className="mt-4 flex flex-col gap-1.5">
              <span className="text-xs font-semibold" style={{ color: INK }}>
                MBTI
              </span>
              <div className="flex flex-wrap gap-2">
                <EditPill
                  label="선택 안 함"
                  active={editMbti === ""}
                  onClick={() => setEditMbti("")}
                />
                {MBTI_TYPES.map((t) => (
                  <EditPill
                    key={t}
                    label={t}
                    active={editMbti === t}
                    onClick={() => setEditMbti(t)}
                  />
                ))}
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-1.5">
              <span className="text-xs font-semibold" style={{ color: INK }}>
                플레이 시간대 (여러 개 선택 가능)
              </span>
              <div className="flex flex-wrap gap-2">
                {PLAY_TIME_OPTIONS.map((t) => (
                  <EditPill
                    key={t}
                    label={t}
                    active={editPlayTime.includes(t)}
                    onClick={() => setEditPlayTime((prev) => toggleValue(prev, t))}
                  />
                ))}
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-1.5">
              <span className="text-xs font-semibold" style={{ color: INK }}>
                취향 태그 (여러 개 선택 가능)
              </span>
              <div className="flex flex-wrap gap-2">
                {MEMBER_TAGS.map((t) => (
                  <EditPill
                    key={t}
                    label={t}
                    active={editTags.includes(t)}
                    onClick={() => setEditTags((prev) => toggleValue(prev, t))}
                  />
                ))}
              </div>
            </div>

            <div className="mt-5 flex gap-2.5">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || uploading}
                className="flex-1 rounded-full py-3 text-sm font-semibold transition-opacity disabled:opacity-60"
                style={{ background: SUNSET_GOLD, color: INK }}
              >
                {saving ? "저장 중..." : "저장"}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="flex-1 rounded-full py-3 text-sm transition-opacity disabled:opacity-60"
                style={{ border: "1px solid rgba(58, 42, 26, 0.25)", color: INK_SOFT }}
              >
                취소
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function EditPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-3 py-1.5 text-[11px] transition-colors"
      style={
        active
          ? { background: SUNSET_GOLD, border: `1px solid ${SUNSET_GOLD}`, color: INK, fontWeight: 600 }
          : { background: "transparent", border: "1px solid rgba(58, 42, 26, 0.25)", color: INK_SOFT }
      }
    >
      {label}
    </button>
  );
}
