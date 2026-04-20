"use client";

import { useEffect, useState } from "react";
import BackLink from "@/app/components/BackLink";
import { useAuth } from "@/app/components/AuthProvider";
import { db, storage } from "@/src/lib/firebase";
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
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
        <div className="minihome-modal" onClick={() => setViewer(null)}>
          <div
            className="minihome-photo-viewer"
            onClick={(e) => e.stopPropagation()}
          >
            <img src={viewer.imageUrl} alt={viewer.caption || "photo"} />
            {viewer.caption && (
              <p className="minihome-photo-caption">{viewer.caption}</p>
            )}
            {viewer.photographer && (
              <p className="album-photographer">photo by {viewer.photographer}</p>
            )}
            {viewer.people && viewer.people.length > 0 && (
              <div className="album-tags">
                {viewer.people.map((p) => (
                  <span key={p} className="album-tag album-tag-readonly">
                    {p}
                  </span>
                ))}
              </div>
            )}
            <AlbumCommentsSection photoId={viewer.id} loginNick={loginNick} />
            <button
              className="minihome-btn minihome-btn-small"
              onClick={() => setViewer(null)}
            >
              닫기
            </button>
          </div>
        </div>
      )}
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
