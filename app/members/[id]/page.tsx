"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import BackLink from "@/app/components/BackLink";
import { useAuth } from "@/app/components/AuthProvider";
import { db, storage } from "@/src/lib/firebase";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { logActivity } from "@/src/lib/activity";

const detailIds = new Set([
  "a", "1", "1-2", "2", "3", "4", "5", "6", "7", "8", "9",
  "12", "13", "14", "15", "16", "17", "18", "19", "20", "21",
]);

type MemberDoc = {
  nickname: string;
  statusMessage: string;
  profileImage: string;
};

type GuestbookEntry = {
  id: string;
  nickname: string;
  message: string;
  createdAt: Timestamp | null;
};

type ReplyEntry = {
  id: string;
  nickname: string;
  message: string;
  createdAt: Timestamp | null;
};

type MediaKind = "image" | "video" | "gif";

type PhotoEntry = {
  id: string;
  imageUrl: string;
  caption: string;
  fileType?: MediaKind;
  createdAt: Timestamp | null;
};

function detectFileType(file: File): MediaKind {
  const name = file.name.toLowerCase();
  if (file.type.startsWith("video/") || name.endsWith(".mp4")) return "video";
  if (file.type === "image/gif" || name.endsWith(".gif")) return "gif";
  return "image";
}

function resolveFileType(p: { fileType?: MediaKind; imageUrl?: string }): MediaKind {
  if (p.fileType === "video" || p.fileType === "gif" || p.fileType === "image") {
    return p.fileType;
  }
  const url = (p.imageUrl || "").toLowerCase();
  if (url.includes(".mp4")) return "video";
  if (url.includes(".gif")) return "gif";
  return "image";
}

type PhotoComment = {
  id: string;
  nickname: string;
  content: string;
  createdAt: Timestamp | null;
};

function formatTime(ts: Timestamp | null): string {
  if (!ts) return "";
  const d = ts.toDate();
  const now = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  ) {
    return `${hh}:${mm}`;
  }
  const M = String(d.getMonth() + 1).padStart(2, "0");
  const D = String(d.getDate()).padStart(2, "0");
  return `${M}/${D} ${hh}:${mm}`;
}

export default function MemberMiniHomePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { nickname: loginNick } = useAuth();
  const [member, setMember] = useState<MemberDoc | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const snap = await getDoc(doc(db, "members", id));
      if (cancelled) return;
      setMember(snap.exists() ? (snap.data() as MemberDoc) : null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const isOwner = !!loginNick && !!member && member.nickname === loginNick;

  return (
    <div className="minihome">
      <BackLink href="/members" className="back-link">← 돌아가기</BackLink>
      {loading ? (
        <p className="minihome-hint">로딩 중...</p>
      ) : (
        <ProfileSection
          id={id}
          member={member}
          loginNick={loginNick}
          isOwner={isOwner}
          onChange={setMember}
        />
      )}
      <GuestbookSection id={id} loginNick={loginNick} />
      <PhotoSection
        id={id}
        isOwner={isOwner}
        loginNick={loginNick}
        memberNickname={member?.nickname ?? null}
      />
    </div>
  );
}

function ProfileSection({
  id,
  member,
  loginNick,
  isOwner,
  onChange,
}: {
  id: string;
  member: MemberDoc | null;
  loginNick: string | null;
  isOwner: boolean;
  onChange: (m: MemberDoc) => void;
}) {
  const hasDetail = detailIds.has(id);
  const [editMode, setEditMode] = useState(false);
  const [editNick, setEditNick] = useState(member?.nickname ?? "");
  const [editStatus, setEditStatus] = useState(member?.statusMessage ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [claiming, setClaiming] = useState(false);

  const startEdit = () => {
    setEditNick(member?.nickname ?? loginNick ?? "");
    setEditStatus(member?.statusMessage ?? "");
    setEditMode(true);
  };

  const handleClaim = async () => {
    if (!loginNick) return;
    setClaiming(true);
    try {
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
      const statusChanged = newStatus !== member.statusMessage;
      const updates = { statusMessage: newStatus };
      await updateDoc(doc(db, "members", id), updates);
      onChange({ ...member, ...updates });
      if (statusChanged) {
        await logActivity(
          "status",
          member.nickname,
          `${member.nickname}님이 한마디를 수정했습니다`,
        );
      }
      setEditMode(false);
    } catch (e) {
      console.error(e);
      alert("저장 실패");
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
      );
    } catch (e) {
      console.error(e);
      alert("이미지 업로드 실패");
    }
    setUploading(false);
  };

  if (!member) {
    return (
      <section className="minihome-section profile-section">
        <div className="profile-top">
          <div className="profile-img-wrap">
            <div className="profile-img profile-img-placeholder" />
          </div>
          <div className="profile-info">
            <h2 className="profile-nick">(비어있음)</h2>
            <p className="profile-status">아직 프로필이 없습니다.</p>
          </div>
        </div>
        <div className="profile-actions">
          {loginNick ? (
            <button className="minihome-btn" onClick={handleClaim} disabled={claiming}>
              {claiming ? "등록 중..." : "내 프로필로 등록"}
            </button>
          ) : (
            <p className="login-required">로그인 후 프로필을 등록할 수 있습니다.</p>
          )}
          {hasDetail && (
            <Link className="minihome-btn" href={`/members/${id}/detail`}>
              길드원 소개
            </Link>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="minihome-section profile-section">
      <div className="profile-top">
        <div className="profile-img-wrap">
          {member.profileImage ? (
            <img src={member.profileImage} alt={member.nickname} className="profile-img" />
          ) : (
            <div className="profile-img profile-img-placeholder" />
          )}
          {editMode && isOwner && (
            <label className="profile-img-upload">
              {uploading ? "..." : "변경"}
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
        <div className="profile-info">
          {editMode ? (
            <>
              <input
                className="minihome-input"
                value={editNick}
                disabled
                readOnly
              />
              <input
                className="minihome-input"
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
                placeholder="한마디"
                maxLength={60}
              />
            </>
          ) : (
            <>
              <h2 className="profile-nick">{member.nickname}</h2>
              {member.statusMessage && (
                <p className="profile-status">{member.statusMessage}</p>
              )}
            </>
          )}
        </div>
      </div>

      <div className="profile-actions">
        {editMode ? (
          <>
            <button
              className="minihome-btn"
              onClick={handleSave}
              disabled={saving || uploading}
            >
              저장
            </button>
            <button
              className="minihome-btn minihome-btn-cancel"
              onClick={() => setEditMode(false)}
              disabled={saving || uploading}
            >
              취소
            </button>
          </>
        ) : (
          <>
            {isOwner && (
              <button className="minihome-btn" onClick={startEdit}>
                프로필 수정
              </button>
            )}
            {hasDetail && (
              <Link className="minihome-btn" href={`/members/${id}/detail`}>
                길드원 소개
              </Link>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function GuestbookSection({
  id,
  loginNick,
}: {
  id: string;
  loginNick: string | null;
}) {
  const [entries, setEntries] = useState<GuestbookEntry[]>([]);
  const [msg, setMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showCount, setShowCount] = useState(10);

  useEffect(() => {
    const q = query(
      collection(db, "members", id, "guestbook"),
      orderBy("createdAt", "desc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      setEntries(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })) as GuestbookEntry[],
      );
    });
    return () => unsub();
  }, [id]);

  const handleSubmit = async () => {
    if (!loginNick || !msg.trim()) return;
    setSubmitting(true);
    try {
      await addDoc(collection(db, "members", id, "guestbook"), {
        nickname: loginNick,
        message: msg.trim(),
        createdAt: serverTimestamp(),
      });
      setMsg("");
      await logActivity(
        "guestbook",
        loginNick,
        `${loginNick}님이 방명록을 남겼습니다`,
      );
    } catch (e) {
      console.error(e);
    }
    setSubmitting(false);
  };

  const visible = entries.slice(0, showCount);

  return (
    <section className="minihome-section">
      <h2 className="minihome-section-title">방명록</h2>
      {loginNick ? (
        <div className="minihome-form">
          <input
            className="minihome-input"
            placeholder="한마디를 남겨주세요"
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            maxLength={200}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
          />
          <button
            className="minihome-btn"
            onClick={handleSubmit}
            disabled={submitting}
          >
            등록
          </button>
        </div>
      ) : (
        <p className="login-required">로그인이 필요합니다.</p>
      )}
      {entries.length === 0 ? (
        <p className="minihome-hint">아직 방명록이 없습니다.</p>
      ) : (
        <ul className="minihome-gb-list">
          {visible.map((e) => (
            <GuestbookItem
              key={e.id}
              memberId={id}
              entry={e}
              loginNick={loginNick}
            />
          ))}
        </ul>
      )}
      {entries.length > showCount && (
        <div className="minihome-more">
          <button
            className="minihome-btn minihome-btn-small"
            onClick={() => setShowCount((c) => c + 10)}
          >
            더보기
          </button>
        </div>
      )}
    </section>
  );
}

function GuestbookItem({
  memberId,
  entry,
  loginNick,
}: {
  memberId: string;
  entry: GuestbookEntry;
  loginNick: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [replies, setReplies] = useState<ReplyEntry[]>([]);
  const [msg, setMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const q = query(
      collection(
        db,
        "members",
        memberId,
        "guestbook",
        entry.id,
        "replies",
      ),
      orderBy("createdAt", "asc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      setReplies(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })) as ReplyEntry[],
      );
    });
    return () => unsub();
  }, [memberId, entry.id, open]);

  const handleReply = async () => {
    if (!loginNick || !msg.trim()) return;
    setSubmitting(true);
    try {
      await addDoc(
        collection(
          db,
          "members",
          memberId,
          "guestbook",
          entry.id,
          "replies",
        ),
        {
          nickname: loginNick,
          message: msg.trim(),
          createdAt: serverTimestamp(),
        },
      );
      setMsg("");
    } catch (e) {
      console.error(e);
    }
    setSubmitting(false);
  };

  return (
    <li className="minihome-gb-entry">
      <div className="minihome-gb-row">
        <span className="minihome-gb-nick">{entry.nickname}</span>
        <span className="minihome-gb-msg">: {entry.message}</span>
        <span className="minihome-gb-time">{formatTime(entry.createdAt)}</span>
        <button
          className="minihome-gb-toggle"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "접기" : "답글"}
        </button>
      </div>
      {open && (
        <div className="minihome-gb-replies">
          {replies.map((r) => (
            <div key={r.id} className="minihome-gb-reply">
              <span className="minihome-gb-nick">↳ {r.nickname}</span>
              <span className="minihome-gb-msg">: {r.message}</span>
              <span className="minihome-gb-time">{formatTime(r.createdAt)}</span>
            </div>
          ))}
          {loginNick ? (
            <div className="minihome-form minihome-form-inline">
              <input
                className="minihome-input"
                placeholder="대댓글"
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                maxLength={200}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleReply();
                }}
              />
              <button
                className="minihome-btn minihome-btn-small"
                onClick={handleReply}
                disabled={submitting}
              >
                등록
              </button>
            </div>
          ) : (
            <p className="login-required login-required-sm">로그인이 필요합니다.</p>
          )}
        </div>
      )}
    </li>
  );
}

function PhotoSection({
  id,
  isOwner,
  loginNick,
  memberNickname,
}: {
  id: string;
  isOwner: boolean;
  loginNick: string | null;
  memberNickname: string | null;
}) {
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [viewer, setViewer] = useState<PhotoEntry | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, "members", id, "photos"),
      orderBy("createdAt", "desc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      setPhotos(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })) as PhotoEntry[],
      );
    });
    return () => unsub();
  }, [id]);

  useEffect(() => {
    if (!viewer) return;
    const match = photos.find((p) => p.id === viewer.id);
    if (match && match !== viewer) setViewer(match);
    if (!match) setViewer(null);
  }, [photos, viewer]);

  useEffect(() => {
    if (!viewer) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [viewer]);

  const photoIdsKey = photos.map((p) => p.id).sort().join(",");
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const ids = photoIdsKey ? photoIdsKey.split(",") : [];
    if (ids.length === 0) {
      setCommentCounts({});
      return;
    }
    const unsubs = ids.map((pid) =>
      onSnapshot(
        collection(db, "members", id, "photos", pid, "comments"),
        (snap) => {
          setCommentCounts((prev) => ({ ...prev, [pid]: snap.size }));
        },
      ),
    );
    return () => {
      unsubs.forEach((u) => u());
    };
  }, [photoIdsKey, id]);

  const openUpload = () => {
    setUploadOpen(true);
    setFile(null);
    setCaption("");
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.includes(".")
        ? file.name.substring(file.name.lastIndexOf("."))
        : "";
      const filename = `${Date.now()}${ext}`;
      const storageRef = ref(storage, `members/${id}/photos/${filename}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await addDoc(collection(db, "members", id, "photos"), {
        imageUrl: url,
        caption: caption.trim(),
        fileType: detectFileType(file),
        createdAt: serverTimestamp(),
      });
      setUploadOpen(false);
      const actor = memberNickname ?? loginNick ?? "";
      if (actor) {
        await logActivity(
          "photo",
          actor,
          `${actor}님의 공간이 업데이트되었습니다`,
        );
      }
    } catch (e) {
      console.error(e);
      alert("업로드 실패");
    }
    setUploading(false);
  };

  return (
    <section className="minihome-section">
      <div className="minihome-section-head">
        <h2 className="minihome-section-title">사진첩</h2>
        {isOwner && (
          <button
            className="minihome-btn minihome-btn-small"
            onClick={openUpload}
          >
            사진 올리기
          </button>
        )}
      </div>
      {!isOwner && loginNick === null && (
        <p className="login-required">로그인 후 본인 사진첩에 올릴 수 있습니다.</p>
      )}
      {photos.length === 0 ? (
        <p className="minihome-hint">아직 사진이 없습니다.</p>
      ) : (
        <div className="minihome-photo-grid">
          {photos.map((p) => {
            const count = commentCounts[p.id] ?? 0;
            return (
              <div key={p.id} className="minihome-photo-card">
                <button
                  type="button"
                  className="minihome-photo-item"
                  onClick={() => setViewer(p)}
                >
                  {resolveFileType(p) === "video" ? (
                    <video
                      src={p.imageUrl}
                      muted
                      autoPlay
                      loop
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    <img src={p.imageUrl} alt={p.caption || "photo"} />
                  )}
                </button>
                <div className="minihome-photo-info">
                  {p.caption && (
                    <div className="minihome-photo-caption-text">{p.caption}</div>
                  )}
                  {count > 0 && (
                    <div className="minihome-photo-comment-count">
                      댓글 {count}개
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {uploadOpen && (
        <div className="minihome-modal" onClick={() => setUploadOpen(false)}>
          <div
            className="minihome-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="minihome-modal-title">사진 업로드</h3>
            <input
              type="file"
              accept="image/*,video/mp4,.gif"
              className="minihome-file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <input
              className="minihome-input"
              placeholder="설명 (선택)"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={120}
            />
            <div className="minihome-modal-actions">
              <button
                className="minihome-btn"
                onClick={handleUpload}
                disabled={!file || uploading}
              >
                {uploading ? "업로드 중..." : "업로드"}
              </button>
              <button
                className="minihome-btn minihome-btn-cancel"
                onClick={() => setUploadOpen(false)}
                disabled={uploading}
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {viewer && (
        <MemberPhotoViewer
          memberId={id}
          photo={viewer}
          loginNick={loginNick}
          isOwner={isOwner}
          onClose={() => setViewer(null)}
        />
      )}
    </section>
  );
}

function MemberPhotoViewer({
  memberId,
  photo,
  loginNick,
  isOwner,
  onClose,
}: {
  memberId: string;
  photo: PhotoEntry;
  loginNick: string | null;
  isOwner: boolean;
  onClose: () => void;
}) {
  const [editMode, setEditMode] = useState(false);
  const [editCaption, setEditCaption] = useState(photo.caption);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const startEdit = () => {
    setEditCaption(photo.caption);
    setEditMode(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, "members", memberId, "photos", photo.id), {
        caption: editCaption.trim(),
      });
      setEditMode(false);
    } catch (e) {
      console.error(e);
      alert("저장 실패");
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirm("이 사진을 삭제하시겠습니까?")) return;
    setDeleting(true);
    try {
      try {
        await deleteObject(ref(storage, photo.imageUrl));
      } catch (e) {
        console.warn("storage delete failed", e);
      }
      await deleteDoc(doc(db, "members", memberId, "photos", photo.id));
      onClose();
    } catch (e) {
      console.error(e);
      alert("삭제 실패");
      setDeleting(false);
    }
  };

  return (
    <div className="minihome-modal" onClick={onClose}>
      <div
        className="minihome-photo-viewer"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="minihome-photo-close"
          onClick={onClose}
          aria-label="닫기"
          disabled={saving || deleting}
        >
          ×
        </button>
        {resolveFileType(photo) === "video" ? (
          <video
            src={photo.imageUrl}
            controls
            autoPlay
            playsInline
          />
        ) : (
          <img src={photo.imageUrl} alt={photo.caption || "photo"} />
        )}
        {editMode ? (
          <>
            <input
              className="minihome-input"
              placeholder="설명"
              value={editCaption}
              onChange={(e) => setEditCaption(e.target.value)}
              maxLength={120}
            />
            <div className="minihome-modal-actions">
              <button
                className="minihome-btn minihome-btn-small"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "저장 중..." : "저장"}
              </button>
              <button
                className="minihome-btn minihome-btn-small minihome-btn-cancel"
                onClick={() => setEditMode(false)}
                disabled={saving}
              >
                취소
              </button>
            </div>
          </>
        ) : (
          photo.caption && (
            <p className="minihome-photo-caption">{photo.caption}</p>
          )
        )}

        {isOwner && !editMode && (
          <div className="minihome-modal-actions">
            <button
              className="minihome-btn minihome-btn-small"
              onClick={startEdit}
              disabled={deleting}
            >
              수정
            </button>
            <button
              className="minihome-btn minihome-btn-small minihome-btn-cancel"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "삭제 중..." : "삭제"}
            </button>
          </div>
        )}

        <PhotoCommentsSection
          memberId={memberId}
          photoId={photo.id}
          loginNick={loginNick}
        />
      </div>
    </div>
  );
}

function PhotoCommentsSection({
  memberId,
  photoId,
  loginNick,
}: {
  memberId: string;
  photoId: string;
  loginNick: string | null;
}) {
  const [comments, setComments] = useState<PhotoComment[]>([]);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, "members", memberId, "photos", photoId, "comments"),
      orderBy("createdAt", "asc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      setComments(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })) as PhotoComment[],
      );
    });
    return () => unsub();
  }, [memberId, photoId]);

  const handleSubmit = async () => {
    if (!loginNick || !content.trim()) return;
    setSubmitting(true);
    try {
      await addDoc(
        collection(db, "members", memberId, "photos", photoId, "comments"),
        {
          nickname: loginNick,
          content: content.trim(),
          createdAt: serverTimestamp(),
        },
      );
      setContent("");
    } catch (e) {
      console.error(e);
    }
    setSubmitting(false);
  };

  return (
    <div className="minihome-photo-comments">
      <h4 className="minihome-photo-comments-title">댓글 ({comments.length})</h4>
      <div className="minihome-photo-comments-list">
        {comments.length === 0 ? (
          <p className="minihome-hint">아직 댓글이 없습니다.</p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="minihome-photo-comment">
              <span className="minihome-gb-nick">{c.nickname}</span>
              <span className="minihome-gb-msg">: {c.content}</span>
              <span className="minihome-gb-time">{formatTime(c.createdAt)}</span>
            </div>
          ))
        )}
      </div>
      {loginNick ? (
        <div className="minihome-form minihome-form-inline">
          <input
            className="minihome-input"
            placeholder="댓글을 입력하세요"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={200}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) handleSubmit();
            }}
          />
          <button
            className="minihome-btn minihome-btn-small"
            onClick={handleSubmit}
            disabled={submitting}
          >
            등록
          </button>
        </div>
      ) : (
        <p className="login-required login-required-sm">로그인이 필요합니다.</p>
      )}
    </div>
  );
}
