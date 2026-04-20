"use client";

import { useEffect, useState } from "react";
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
import { logActivity } from "@/src/lib/activity";

const ADMIN_PASSWORD = "dawnlight2024";

type AlbumPhoto = {
  id: string;
  imageUrl: string;
  caption: string;
  photographer: string;
  people: string[];
  createdAt: Timestamp | null;
};

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
  const [uploading, setUploading] = useState(false);

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
      setPhotos(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })) as AlbumPhoto[],
      );
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
      await addDoc(collection(db, "album"), {
        imageUrl: url,
        caption: caption.trim(),
        photographer: photographer.trim(),
        people,
        createdAt: serverTimestamp(),
      });
      setUploadOpen(false);
      await logActivity("album", "", "새 앨범 사진이 업로드되었습니다");
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
          {photos.map((p) => (
            <button
              key={p.id}
              type="button"
              className="minihome-photo-item"
              onClick={() => setViewer(p)}
            >
              <img src={p.imageUrl} alt={p.caption || "photo"} />
            </button>
          ))}
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
                  accept="image/*"
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
        <img src={photo.imageUrl} alt={photo.caption || "photo"} />
        {editMode ? (
          <>
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
        <button
          className="minihome-btn minihome-btn-small"
          onClick={onClose}
          disabled={saving || deleting}
        >
          닫기
        </button>
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
