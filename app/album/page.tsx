"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import BackLink from "@/app/components/BackLink";
import { useAuth } from "@/app/components/AuthProvider";
import { db, storage } from "@/src/lib/firebase";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { deleteActivitiesByLink, logActivity } from "@/src/lib/activity";

const ADMIN_PASSWORD = "dawnlight2024";

type MediaKind = "image" | "video" | "gif";

type AlbumPhoto = {
  id: string;
  imageUrl: string;
  caption: string;
  photographer: string;
  people: string[];
  photoDate: string;
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

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatPhotoDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${y}.${m}.${d}`;
}

function photoSortKey(p: AlbumPhoto): string {
  if (p.photoDate) return p.photoDate;
  if (p.createdAt) {
    const d = p.createdAt.toDate();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return "";
}

type AlbumComment = {
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

export default function AlbumPage() {
  const { nickname: loginNick } = useAuth();
  const [photos, setPhotos] = useState<AlbumPhoto[]>([]);
  const [viewer, setViewer] = useState<AlbumPhoto | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwVerified, setPwVerified] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [photographer, setPhotographer] = useState("");
  const [people, setPeople] = useState<string[]>([]);
  const [peopleInput, setPeopleInput] = useState("");
  const [photoDate, setPhotoDate] = useState<string>(todayISO());
  const [uploading, setUploading] = useState(false);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const photoIdsKey = photos.map((p) => p.id).sort().join(",");
  const autoOpenedRef = useRef(false);

  useEffect(() => {
    if (autoOpenedRef.current) return;
    if (photos.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const pid = params.get("photo");
    if (!pid) {
      autoOpenedRef.current = true;
      return;
    }
    const target = photos.find((p) => p.id === pid);
    if (target) {
      setViewer(target);
      autoOpenedRef.current = true;
    }
  }, [photos]);

  useEffect(() => {
    const ids = photoIdsKey ? photoIdsKey.split(",") : [];
    if (ids.length === 0) {
      setCommentCounts({});
      return;
    }
    const commentsByPhoto: Record<string, string[]> = {};
    const replyCounts: Record<string, number> = {};
    const replyUnsubs: Record<string, () => void> = {};

    const recompute = () => {
      const totals: Record<string, number> = {};
      for (const pid of ids) {
        const cIds = commentsByPhoto[pid] ?? [];
        let n = cIds.length;
        for (const cid of cIds) n += replyCounts[`${pid}|${cid}`] ?? 0;
        totals[pid] = n;
      }
      setCommentCounts(totals);
    };

    const commentUnsubs = ids.map((pid) =>
      onSnapshot(collection(db, "album", pid, "comments"), (snap) => {
        const newIds = snap.docs.map((d) => d.id);
        const oldIds = commentsByPhoto[pid] ?? [];
        commentsByPhoto[pid] = newIds;
        for (const cid of oldIds) {
          if (!newIds.includes(cid)) {
            const key = `${pid}|${cid}`;
            replyUnsubs[key]?.();
            delete replyUnsubs[key];
            delete replyCounts[key];
          }
        }
        for (const cid of newIds) {
          const key = `${pid}|${cid}`;
          if (!replyUnsubs[key]) {
            replyUnsubs[key] = onSnapshot(
              collection(db, "album", pid, "comments", cid, "replies"),
              (rSnap) => {
                replyCounts[key] = rSnap.size;
                recompute();
              },
            );
          }
        }
        recompute();
      }),
    );

    return () => {
      commentUnsubs.forEach((u) => u());
      Object.values(replyUnsubs).forEach((u) => u());
    };
  }, [photoIdsKey]);

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

  useEffect(() => {
    const q = query(collection(db, "album"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as AlbumPhoto,
      );
      list.sort((a, b) => {
        const ak = photoSortKey(a);
        const bk = photoSortKey(b);
        if (ak !== bk) return ak < bk ? 1 : -1;
        const at = a.createdAt?.toMillis() ?? 0;
        const bt = b.createdAt?.toMillis() ?? 0;
        return bt - at;
      });
      setPhotos(list);
    });
    return () => unsub();
  }, []);

  const openUpload = () => {
    setUploadOpen(true);
    setPwInput("");
    setPwVerified(false);
    setFile(null);
    setCaption("");
    setPhotographer("");
    setPeople([]);
    setPeopleInput("");
    setPhotoDate(todayISO());
  };

  const addPerson = () => {
    const v = peopleInput.trim();
    if (!v) return;
    if (people.includes(v)) {
      setPeopleInput("");
      return;
    }
    setPeople((p) => [...p, v]);
    setPeopleInput("");
  };

  const removePerson = (v: string) => {
    setPeople((p) => p.filter((n) => n !== v));
  };

  const confirmPw = () => {
    if (pwInput !== ADMIN_PASSWORD) {
      alert("관리자 비밀번호가 일치하지 않습니다.");
      return;
    }
    setPwVerified(true);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.includes(".")
        ? file.name.substring(file.name.lastIndexOf("."))
        : "";
      const filename = `${Date.now()}${ext}`;
      const storageRef = ref(storage, `album/${filename}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      const newRef = await addDoc(collection(db, "album"), {
        imageUrl: url,
        caption: caption.trim(),
        photographer: photographer.trim(),
        people,
        photoDate: photoDate || todayISO(),
        fileType: detectFileType(file),
        createdAt: serverTimestamp(),
      });
      setUploadOpen(false);
      await logActivity(
        "album",
        "",
        "새 앨범 사진이 업로드되었습니다",
        `/album?photo=${newRef.id}`,
      );
    } catch (e) {
      console.error(e);
      alert("업로드 실패");
    }
    setUploading(false);
  };

  return (
    <div className="album-content">
      <BackLink href="/" className="back-link">← 홈으로</BackLink>

      <div className="album-head">
        <h1 className="album-title">앨범</h1>
        <button className="minihome-btn minihome-btn-small" onClick={openUpload}>
          사진 올리기
        </button>
      </div>

      {photos.length === 0 ? (
        <p className="minihome-hint">아직 사진이 없습니다.</p>
      ) : (
        <div className="album-grid">
          {photos.map((p) => {
            const count = commentCounts[p.id] ?? 0;
            return (
              <div key={p.id} className="album-photo-card">
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
                <div className="album-photo-info">
                  {p.photoDate && (
                    <div className="album-photo-date">{formatPhotoDate(p.photoDate)}</div>
                  )}
                  {p.photographer && (
                    <div className="album-photo-by">photo by {p.photographer}</div>
                  )}
                  {p.people && p.people.length > 0 && (
                    <div className="album-photo-people">
                      {p.people.map((person) => (
                        <span key={person} className="album-photo-person">
                          {person}
                        </span>
                      ))}
                    </div>
                  )}
                  {p.caption && (
                    <div className="album-photo-caption-text">{p.caption}</div>
                  )}
                  {count > 0 && (
                    <div className="album-photo-comment-count">댓글 {count}개</div>
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
            {!pwVerified ? (
              <>
                <input
                  type="password"
                  className="minihome-input"
                  placeholder="관리자 비밀번호"
                  value={pwInput}
                  onChange={(e) => setPwInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmPw();
                  }}
                  autoFocus
                />
                <div className="minihome-modal-actions">
                  <button className="minihome-btn" onClick={confirmPw}>확인</button>
                  <button
                    className="minihome-btn minihome-btn-cancel"
                    onClick={() => setUploadOpen(false)}
                  >
                    취소
                  </button>
                </div>
              </>
            ) : (
              <>
                <input
                  type="file"
                  accept="image/*,video/mp4,.gif"
                  className="minihome-file"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <label className="album-date-label">
                  <span className="album-date-label-text">촬영 날짜</span>
                  <input
                    type="date"
                    className="minihome-input"
                    value={photoDate}
                    onChange={(e) => setPhotoDate(e.target.value)}
                    max={todayISO()}
                  />
                </label>
                <input
                  className="minihome-input"
                  placeholder="설명 (선택)"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  maxLength={120}
                />
                <input
                  className="minihome-input"
                  placeholder="촬영자 (선택)"
                  value={photographer}
                  onChange={(e) => setPhotographer(e.target.value)}
                  maxLength={30}
                />
                <div className="album-people-input">
                  {people.length > 0 && (
                    <div className="album-tags">
                      {people.map((p) => (
                        <span key={p} className="album-tag">
                          {p}
                          <button
                            type="button"
                            className="album-tag-remove"
                            onClick={() => removePerson(p)}
                            aria-label={`${p} 제거`}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <input
                    className="minihome-input"
                    placeholder="출연자 (엔터로 추가)"
                    value={peopleInput}
                    onChange={(e) => setPeopleInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        addPerson();
                      }
                    }}
                    maxLength={30}
                  />
                </div>
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
              </>
            )}
          </div>
        </div>
      )}

      {viewer && (
        <AlbumPhotoViewer
          photo={viewer}
          loginNick={loginNick}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}

function AlbumPhotoViewer({
  photo,
  loginNick,
  onClose,
}: {
  photo: AlbumPhoto;
  loginNick: string | null;
  onClose: () => void;
}) {
  const [pwInput, setPwInput] = useState("");
  const [adminVerified, setAdminVerified] = useState(false);
  const [pwPrompt, setPwPrompt] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editCaption, setEditCaption] = useState(photo.caption);
  const [editPhotographer, setEditPhotographer] = useState(photo.photographer);
  const [editPeople, setEditPeople] = useState<string[]>(photo.people ?? []);
  const [editPeopleInput, setEditPeopleInput] = useState("");
  const [editPhotoDate, setEditPhotoDate] = useState<string>(
    photo.photoDate || todayISO(),
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const confirmPw = () => {
    if (pwInput !== ADMIN_PASSWORD) {
      alert("관리자 비밀번호가 일치하지 않습니다.");
      return;
    }
    setAdminVerified(true);
    setPwPrompt(false);
    setPwInput("");
  };

  const startEdit = () => {
    if (!adminVerified) {
      setPwPrompt(true);
      return;
    }
    setEditCaption(photo.caption);
    setEditPhotographer(photo.photographer);
    setEditPeople(photo.people ?? []);
    setEditPeopleInput("");
    setEditPhotoDate(photo.photoDate || todayISO());
    setEditMode(true);
  };

  const cancelEdit = () => {
    setEditMode(false);
    setEditPeopleInput("");
  };

  const addEditPerson = () => {
    const v = editPeopleInput.trim();
    if (!v) return;
    if (editPeople.includes(v)) {
      setEditPeopleInput("");
      return;
    }
    setEditPeople((p) => [...p, v]);
    setEditPeopleInput("");
  };

  const removeEditPerson = (v: string) => {
    setEditPeople((p) => p.filter((n) => n !== v));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, "album", photo.id), {
        caption: editCaption.trim(),
        photographer: editPhotographer.trim(),
        people: editPeople,
        photoDate: editPhotoDate || todayISO(),
      });
      setEditMode(false);
    } catch (e) {
      console.error(e);
      alert("저장 실패");
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!adminVerified) {
      setPwPrompt(true);
      return;
    }
    if (!confirm("이 사진을 삭제하시겠습니까?")) return;
    setDeleting(true);
    try {
      try {
        await deleteObject(ref(storage, photo.imageUrl));
      } catch (e) {
        console.warn("storage delete failed", e);
      }
      await deleteDoc(doc(db, "album", photo.id));
      await deleteActivitiesByLink(`/album?photo=${photo.id}`);
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
            <label className="album-date-label">
              <span className="album-date-label-text">촬영 날짜</span>
              <input
                type="date"
                className="minihome-input"
                value={editPhotoDate}
                onChange={(e) => setEditPhotoDate(e.target.value)}
                max={todayISO()}
              />
            </label>
            <input
              className="minihome-input"
              placeholder="설명"
              value={editCaption}
              onChange={(e) => setEditCaption(e.target.value)}
              maxLength={120}
            />
            <input
              className="minihome-input"
              placeholder="촬영자"
              value={editPhotographer}
              onChange={(e) => setEditPhotographer(e.target.value)}
              maxLength={30}
            />
            <div className="album-people-input">
              {editPeople.length > 0 && (
                <div className="album-tags">
                  {editPeople.map((p) => (
                    <span key={p} className="album-tag">
                      {p}
                      <button
                        type="button"
                        className="album-tag-remove"
                        onClick={() => removeEditPerson(p)}
                        aria-label={`${p} 제거`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <input
                className="minihome-input"
                placeholder="출연자 (엔터로 추가)"
                value={editPeopleInput}
                onChange={(e) => setEditPeopleInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    addEditPerson();
                  }
                }}
                maxLength={30}
              />
            </div>
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
                onClick={cancelEdit}
                disabled={saving}
              >
                취소
              </button>
            </div>
          </>
        ) : (
          <>
            {photo.photoDate && (
              <p className="album-viewer-date">{formatPhotoDate(photo.photoDate)}</p>
            )}
            {photo.caption && (
              <p className="minihome-photo-caption">{photo.caption}</p>
            )}
            {photo.photographer && (
              <p className="album-photographer">photo by {photo.photographer}</p>
            )}
            {photo.people && photo.people.length > 0 && (
              <div className="album-tags">
                {photo.people.map((p) => (
                  <span key={p} className="album-tag album-tag-readonly">
                    {p}
                  </span>
                ))}
              </div>
            )}
          </>
        )}

        {pwPrompt && !adminVerified && (
          <div className="minihome-form minihome-form-inline">
            <input
              type="password"
              className="minihome-input"
              placeholder="관리자 비밀번호"
              value={pwInput}
              onChange={(e) => setPwInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmPw();
              }}
              autoFocus
            />
            <button
              className="minihome-btn minihome-btn-small"
              onClick={confirmPw}
            >
              확인
            </button>
            <button
              className="minihome-btn minihome-btn-small minihome-btn-cancel"
              onClick={() => {
                setPwPrompt(false);
                setPwInput("");
              }}
            >
              취소
            </button>
          </div>
        )}

        {!editMode && (
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

        <AlbumCommentsSection photoId={photo.id} loginNick={loginNick} />
      </div>
    </div>
  );
}

function AlbumCommentsSection({
  photoId,
  loginNick,
}: {
  photoId: string;
  loginNick: string | null;
}) {
  const [comments, setComments] = useState<AlbumComment[]>([]);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [openReplyId, setOpenReplyId] = useState<string | null>(null);
  const [replyCounts, setReplyCounts] = useState<Record<string, number>>({});

  const reportReplyCount = useCallback((commentId: string, count: number) => {
    setReplyCounts((prev) =>
      prev[commentId] === count ? prev : { ...prev, [commentId]: count },
    );
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, "album", photoId, "comments"),
      orderBy("createdAt", "asc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      setComments(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })) as AlbumComment[],
      );
    });
    return () => unsub();
  }, [photoId]);

  const totalCount =
    comments.length +
    comments.reduce((n, c) => n + (replyCounts[c.id] ?? 0), 0);

  const handleSubmit = async () => {
    if (!loginNick || !content.trim()) return;
    setSubmitting(true);
    try {
      await addDoc(collection(db, "album", photoId, "comments"), {
        nickname: loginNick,
        content: content.trim(),
        createdAt: serverTimestamp(),
      });
      setContent("");
      await logActivity(
        "album_comment",
        loginNick,
        "앨범에 새 댓글이 달렸습니다",
        `/album?photo=${photoId}`,
      );
    } catch (e) {
      console.error(e);
    }
    setSubmitting(false);
  };

  return (
    <div className="minihome-photo-comments">
      <h4 className="minihome-photo-comments-title">댓글 ({totalCount})</h4>
      <div className="minihome-photo-comments-list">
        {comments.length === 0 ? (
          <p className="minihome-hint">아직 댓글이 없습니다.</p>
        ) : (
          comments.map((c) => (
            <AlbumCommentItem
              key={c.id}
              photoId={photoId}
              comment={c}
              loginNick={loginNick}
              replyOpen={openReplyId === c.id}
              onToggleReply={() =>
                setOpenReplyId((cur) => (cur === c.id ? null : c.id))
              }
              onCloseReply={() => setOpenReplyId(null)}
              onReplyCountChange={reportReplyCount}
            />
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

function AlbumCommentItem({
  photoId,
  comment,
  loginNick,
  replyOpen,
  onToggleReply,
  onCloseReply,
  onReplyCountChange,
}: {
  photoId: string;
  comment: AlbumComment;
  loginNick: string | null;
  replyOpen: boolean;
  onToggleReply: () => void;
  onCloseReply: () => void;
  onReplyCountChange: (commentId: string, count: number) => void;
}) {
  const [replies, setReplies] = useState<AlbumComment[]>([]);
  const [msg, setMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, "album", photoId, "comments", comment.id, "replies"),
      orderBy("createdAt", "asc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      setReplies(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })) as AlbumComment[],
      );
      onReplyCountChange(comment.id, snap.size);
    });
    return () => unsub();
  }, [photoId, comment.id, onReplyCountChange]);

  const handleReply = async () => {
    if (!loginNick || !msg.trim()) return;
    setSubmitting(true);
    try {
      await addDoc(
        collection(db, "album", photoId, "comments", comment.id, "replies"),
        {
          nickname: loginNick,
          content: msg.trim(),
          createdAt: serverTimestamp(),
        },
      );
      setMsg("");
      onCloseReply();
      await logActivity(
        "album_comment",
        loginNick,
        "앨범에 새 댓글이 달렸습니다",
        `/album?photo=${photoId}`,
      );
    } catch (e) {
      console.error(e);
    }
    setSubmitting(false);
  };

  return (
    <div className="minihome-photo-comment-block">
      <div className="minihome-photo-comment">
        <span className="minihome-gb-nick">{comment.nickname}</span>
        <span className="minihome-gb-msg">: {comment.content}</span>
        <span className="minihome-gb-time">{formatTime(comment.createdAt)}</span>
        {loginNick && (
          <button
            type="button"
            className="minihome-reply-btn"
            onClick={onToggleReply}
          >
            답글
          </button>
        )}
      </div>
      {(replies.length > 0 || replyOpen) && (
        <div className="minihome-gb-replies">
          {replies.map((r) => (
            <div key={r.id} className="minihome-gb-reply">
              <span className="minihome-gb-nick">↳ {r.nickname}</span>
              <span className="minihome-gb-msg">: {r.content}</span>
              <span className="minihome-gb-time">{formatTime(r.createdAt)}</span>
            </div>
          ))}
          {replyOpen && loginNick && (
            <div className="minihome-form minihome-form-inline">
              <input
                className="minihome-input"
                placeholder="대댓글"
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                maxLength={200}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) handleReply();
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
          )}
        </div>
      )}
    </div>
  );
}
