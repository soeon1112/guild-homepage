"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { deleteActivitiesByLink, logActivity } from "@/src/lib/activity";
import { addPoints } from "@/src/lib/points";
import { uploadCommentImage } from "@/src/lib/commentImage";
import {
  CommentImageAttach,
  CommentImageView,
} from "@/app/components/CommentImage";

const detailIds = new Set([
  "a", "1", "1-2", "2", "3", "4", "5", "6", "7", "8", "9",
  "12", "13", "14", "14-1", "15", "16", "17", "17-1", "18", "19", "20", "21",
]);

type MemberDoc = {
  nickname: string;
  statusMessage: string;
  profileImage: string;
  bgmUrl?: string;
};

type GuestbookEntry = {
  id: string;
  nickname: string;
  message: string;
  imageUrl?: string;
  createdAt: Timestamp | null;
};

type ReplyEntry = {
  id: string;
  nickname: string;
  message: string;
  imageUrl?: string;
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
  imageUrl?: string;
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

function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const m = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/v\/|youtube\.com\/live\/)([A-Za-z0-9_-]{11})/,
  );
  return m ? m[1] : null;
}

type YTPlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  destroy: () => void;
};

type YTPlayerConstructor = new (
  element: HTMLElement,
  options: {
    videoId: string;
    playerVars?: Record<string, number>;
    events?: {
      onReady?: () => void;
      onStateChange?: (e: { data: number }) => void;
    };
  },
) => YTPlayer;

declare global {
  interface Window {
    YT?: { Player: YTPlayerConstructor };
    onYouTubeIframeAPIReady?: (() => void) | null;
  }
}

let ytApiPromise: Promise<void> | null = null;

function loadYouTubeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });
  return ytApiPromise;
}

function BgmPlayer({ bgmUrl }: { bgmUrl: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const videoId = extractYouTubeId(bgmUrl);

  useEffect(() => {
    if (!videoId || !hostRef.current) return;
    let cancelled = false;
    const host = hostRef.current;
    const target = document.createElement("div");
    host.appendChild(target);

    loadYouTubeApi().then(() => {
      if (cancelled || !window.YT) return;
      try {
        playerRef.current = new window.YT.Player(target, {
          videoId,
          playerVars: { autoplay: 0, controls: 0, playsinline: 1 },
          events: {
            onReady: () => {
              if (!cancelled) setReady(true);
            },
            onStateChange: (e) => {
              if (cancelled) return;
              if (e.data === 1) setPlaying(true);
              else if (e.data === 2 || e.data === 0) setPlaying(false);
            },
          },
        });
      } catch (err) {
        console.error(err);
      }
    });

    return () => {
      cancelled = true;
      try {
        playerRef.current?.destroy();
      } catch {}
      playerRef.current = null;
      setPlaying(false);
      setReady(false);
      host.innerHTML = "";
    };
  }, [videoId]);

  if (!videoId) return null;

  const toggle = () => {
    if (!ready || !playerRef.current) return;
    if (playing) playerRef.current.pauseVideo();
    else playerRef.current.playVideo();
  };

  return (
    <div className="minihome-bgm">
      <button
        type="button"
        className="minihome-bgm-btn"
        onClick={toggle}
        disabled={!ready}
        aria-label={playing ? "배경음악 일시정지" : "배경음악 재생"}
      >
        {playing ? "⏸" : "♪"}
      </button>
      {playing && <span className="minihome-bgm-status">♪ 재생 중</span>}
      <div ref={hostRef} className="minihome-bgm-frame" aria-hidden="true" />
    </div>
  );
}

export default function MemberMiniHomePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { nickname: loginNick } = useAuth();
  const [member, setMember] = useState<MemberDoc | null>(null);
  const [loading, setLoading] = useState(true);

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  };

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
      <button type="button" className="back-link" onClick={handleBack}>
        ← 돌아가기
      </button>
      {member?.bgmUrl && <BgmPlayer bgmUrl={member.bgmUrl} />}
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
      <GuestbookSection
        id={id}
        loginNick={loginNick}
        memberNickname={member?.nickname ?? null}
      />
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
  const [editBgmUrl, setEditBgmUrl] = useState(member?.bgmUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [claiming, setClaiming] = useState(false);

  const startEdit = () => {
    setEditNick(member?.nickname ?? loginNick ?? "");
    setEditStatus(member?.statusMessage ?? "");
    setEditBgmUrl(member?.bgmUrl ?? "");
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
      const newBgmUrl = editBgmUrl.trim();
      const prevBgmUrl = member.bgmUrl ?? "";
      const statusChanged = newStatus !== member.statusMessage;
      const bgmChanged = newBgmUrl !== prevBgmUrl;
      const updates = { statusMessage: newStatus, bgmUrl: newBgmUrl };
      await updateDoc(doc(db, "members", id), updates);
      onChange({ ...member, ...updates });
      if (statusChanged) {
        await logActivity(
          "status",
          member.nickname,
          `${member.nickname}님이 한마디를 수정했습니다`,
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
              <div className="minihome-bgm-edit">
                <input
                  className="minihome-input"
                  value={editBgmUrl}
                  onChange={(e) => setEditBgmUrl(e.target.value)}
                  placeholder="배경음악 유튜브 링크 (선택)"
                  maxLength={200}
                />
                <button
                  type="button"
                  className="minihome-btn minihome-btn-small minihome-btn-cancel"
                  onClick={handleBgmDelete}
                  disabled={saving || uploading || !member?.bgmUrl}
                >
                  삭제
                </button>
              </div>
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
  memberNickname,
}: {
  id: string;
  loginNick: string | null;
  memberNickname: string | null;
}) {
  const [entries, setEntries] = useState<GuestbookEntry[]>([]);
  const [msg, setMsg] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showCount, setShowCount] = useState(10);
  const [openReplyId, setOpenReplyId] = useState<string | null>(null);

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
    if (!loginNick) return;
    if (!msg.trim() && !image) return;
    setSubmitting(true);
    try {
      let imageUrl = "";
      if (image) {
        imageUrl = await uploadCommentImage(image);
      }
      await addDoc(collection(db, "members", id, "guestbook"), {
        nickname: loginNick,
        message: msg.trim(),
        imageUrl,
        createdAt: serverTimestamp(),
      });
      setMsg("");
      setImage(null);
      if (memberNickname) {
        await logActivity(
          "guestbook",
          loginNick,
          `${memberNickname}님의 공간에 방명록이 달렸습니다`,
          `/members/${id}`,
        );
      }
      await addPoints(
        loginNick,
        "방명록",
        2,
        `${memberNickname ?? "미니홈피"}님의 방명록에 글 남김`,
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
          <CommentImageAttach
            file={image}
            setFile={setImage}
            disabled={submitting}
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
              memberNickname={memberNickname}
              replyOpen={openReplyId === e.id}
              onToggleReply={() =>
                setOpenReplyId((cur) => (cur === e.id ? null : e.id))
              }
              onCloseReply={() => setOpenReplyId(null)}
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
  memberNickname,
  replyOpen,
  onToggleReply,
  onCloseReply,
}: {
  memberId: string;
  entry: GuestbookEntry;
  loginNick: string | null;
  memberNickname: string | null;
  replyOpen: boolean;
  onToggleReply: () => void;
  onCloseReply: () => void;
}) {
  const [replies, setReplies] = useState<ReplyEntry[]>([]);
  const [msg, setMsg] = useState("");
  const [replyImage, setReplyImage] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
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
  }, [memberId, entry.id]);

  const handleReply = async () => {
    if (!loginNick) return;
    if (!msg.trim() && !replyImage) return;
    setSubmitting(true);
    try {
      let imageUrl = "";
      if (replyImage) {
        imageUrl = await uploadCommentImage(replyImage);
      }
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
          imageUrl,
          createdAt: serverTimestamp(),
        },
      );
      setMsg("");
      setReplyImage(null);
      onCloseReply();
      if (memberNickname) {
        await logActivity(
          "guestbook",
          loginNick,
          `${memberNickname}님의 공간에 댓글이 달렸습니다`,
          `/members/${memberId}`,
        );
      }
      await addPoints(
        loginNick,
        "대댓글",
        1,
        `${memberNickname ?? "미니홈피"}님 방명록에 대댓글 작성`,
      );
    } catch (e) {
      console.error(e);
    }
    setSubmitting(false);
  };

  const handleDeleteEntry = async () => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    try {
      await deleteDoc(doc(db, "members", memberId, "guestbook", entry.id));
    } catch (e) {
      console.error(e);
      alert("방명록 삭제에 실패했습니다.");
    }
  };

  const handleDeleteReply = async (replyId: string) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    try {
      await deleteDoc(
        doc(db, "members", memberId, "guestbook", entry.id, "replies", replyId),
      );
    } catch (e) {
      console.error(e);
      alert("대댓글 삭제에 실패했습니다.");
    }
  };

  return (
    <li className="minihome-gb-entry">
      <div className="minihome-gb-row">
        <span className="minihome-gb-nick">{entry.nickname}</span>
        <span className="minihome-gb-msg">: {entry.message}</span>
        <span className="minihome-gb-time">{formatTime(entry.createdAt)}</span>
        {loginNick && (
          <button
            type="button"
            className="minihome-reply-btn"
            onClick={onToggleReply}
          >
            답글
          </button>
        )}
        {loginNick === entry.nickname && (
          <button
            type="button"
            className="minihome-reply-btn"
            onClick={handleDeleteEntry}
          >
            삭제
          </button>
        )}
      </div>
      {entry.imageUrl && <CommentImageView url={entry.imageUrl} />}
      <div className="minihome-gb-replies">
        {replies.map((r) => (
          <div key={r.id} className="minihome-gb-reply">
            <div>
              <span className="minihome-gb-nick">↳ {r.nickname}</span>
              <span className="minihome-gb-msg">: {r.message}</span>
              <span className="minihome-gb-time">{formatTime(r.createdAt)}</span>
              {loginNick === r.nickname && (
                <button
                  type="button"
                  className="minihome-reply-btn"
                  onClick={() => handleDeleteReply(r.id)}
                >
                  삭제
                </button>
              )}
            </div>
            {r.imageUrl && <CommentImageView url={r.imageUrl} />}
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
            <CommentImageAttach
              file={replyImage}
              setFile={setReplyImage}
              disabled={submitting}
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
  const autoOpenedRef = useRef(false);

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
      onSnapshot(
        collection(db, "members", id, "photos", pid, "comments"),
        (snap) => {
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
                collection(
                  db,
                  "members",
                  id,
                  "photos",
                  pid,
                  "comments",
                  cid,
                  "replies",
                ),
                (rSnap) => {
                  replyCounts[key] = rSnap.size;
                  recompute();
                },
              );
            }
          }
          recompute();
        },
      ),
    );

    return () => {
      commentUnsubs.forEach((u) => u());
      Object.values(replyUnsubs).forEach((u) => u());
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
      const newRef = await addDoc(collection(db, "members", id, "photos"), {
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
          `/members/${id}?photo=${newRef.id}`,
        );
      }
      await addPoints(loginNick, "사진", 2, "미니홈피 사진첩에 사진 업로드");
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
          memberNickname={memberNickname}
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
  memberNickname,
  onClose,
}: {
  memberId: string;
  photo: PhotoEntry;
  loginNick: string | null;
  isOwner: boolean;
  memberNickname: string | null;
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
      await deleteActivitiesByLink(`/members/${memberId}?photo=${photo.id}`);
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
          memberNickname={memberNickname}
        />
      </div>
    </div>
  );
}

function PhotoCommentsSection({
  memberId,
  photoId,
  loginNick,
  memberNickname,
}: {
  memberId: string;
  photoId: string;
  loginNick: string | null;
  memberNickname: string | null;
}) {
  const [comments, setComments] = useState<PhotoComment[]>([]);
  const [content, setContent] = useState("");
  const [image, setImage] = useState<File | null>(null);
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

  const totalCount =
    comments.length +
    comments.reduce((n, c) => n + (replyCounts[c.id] ?? 0), 0);

  const handleSubmit = async () => {
    if (!loginNick) return;
    if (!content.trim() && !image) return;
    setSubmitting(true);
    try {
      let imageUrl = "";
      if (image) {
        imageUrl = await uploadCommentImage(image);
      }
      await addDoc(
        collection(db, "members", memberId, "photos", photoId, "comments"),
        {
          nickname: loginNick,
          content: content.trim(),
          imageUrl,
          createdAt: serverTimestamp(),
        },
      );
      setContent("");
      setImage(null);
      if (memberNickname) {
        await logActivity(
          "minihome_photo_comment",
          loginNick,
          `${memberNickname}님의 공간에 댓글이 달렸습니다`,
          `/members/${memberId}?photo=${photoId}`,
        );
      }
      await addPoints(
        loginNick,
        "댓글",
        1,
        `${memberNickname ?? "미니홈피"}님 사진에 댓글 작성`,
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
            <PhotoCommentItem
              key={c.id}
              memberId={memberId}
              photoId={photoId}
              comment={c}
              loginNick={loginNick}
              memberNickname={memberNickname}
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
          <CommentImageAttach
            file={image}
            setFile={setImage}
            disabled={submitting}
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

function PhotoCommentItem({
  memberId,
  photoId,
  comment,
  loginNick,
  memberNickname,
  replyOpen,
  onToggleReply,
  onCloseReply,
  onReplyCountChange,
}: {
  memberId: string;
  photoId: string;
  comment: PhotoComment;
  loginNick: string | null;
  memberNickname: string | null;
  replyOpen: boolean;
  onToggleReply: () => void;
  onCloseReply: () => void;
  onReplyCountChange: (commentId: string, count: number) => void;
}) {
  const [replies, setReplies] = useState<PhotoComment[]>([]);
  const [msg, setMsg] = useState("");
  const [replyImage, setReplyImage] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const q = query(
      collection(
        db,
        "members",
        memberId,
        "photos",
        photoId,
        "comments",
        comment.id,
        "replies",
      ),
      orderBy("createdAt", "asc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      setReplies(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })) as PhotoComment[],
      );
      onReplyCountChange(comment.id, snap.size);
    });
    return () => unsub();
  }, [memberId, photoId, comment.id, onReplyCountChange]);

  const handleReply = async () => {
    if (!loginNick) return;
    if (!msg.trim() && !replyImage) return;
    setSubmitting(true);
    try {
      let imageUrl = "";
      if (replyImage) {
        imageUrl = await uploadCommentImage(replyImage);
      }
      await addDoc(
        collection(
          db,
          "members",
          memberId,
          "photos",
          photoId,
          "comments",
          comment.id,
          "replies",
        ),
        {
          nickname: loginNick,
          content: msg.trim(),
          imageUrl,
          createdAt: serverTimestamp(),
        },
      );
      setMsg("");
      setReplyImage(null);
      onCloseReply();
      if (memberNickname) {
        await logActivity(
          "minihome_photo_comment",
          loginNick,
          `${memberNickname}님의 공간에 댓글이 달렸습니다`,
          `/members/${memberId}?photo=${photoId}`,
        );
      }
      await addPoints(
        loginNick,
        "대댓글",
        1,
        `${memberNickname ?? "미니홈피"}님 사진에 대댓글 작성`,
      );
    } catch (e) {
      console.error(e);
    }
    setSubmitting(false);
  };

  const handleDeleteComment = async () => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    try {
      await deleteDoc(
        doc(db, "members", memberId, "photos", photoId, "comments", comment.id),
      );
    } catch (e) {
      console.error(e);
      alert("댓글 삭제에 실패했습니다.");
    }
  };

  const handleDeleteReply = async (replyId: string) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    try {
      await deleteDoc(
        doc(
          db,
          "members",
          memberId,
          "photos",
          photoId,
          "comments",
          comment.id,
          "replies",
          replyId,
        ),
      );
    } catch (e) {
      console.error(e);
      alert("대댓글 삭제에 실패했습니다.");
    }
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
        {loginNick === comment.nickname && (
          <button
            type="button"
            className="minihome-reply-btn"
            onClick={handleDeleteComment}
          >
            삭제
          </button>
        )}
      </div>
      {comment.imageUrl && <CommentImageView url={comment.imageUrl} />}
      {(replies.length > 0 || replyOpen) && (
        <div className="minihome-gb-replies">
          {replies.map((r) => (
            <div key={r.id} className="minihome-gb-reply">
              <div>
                <span className="minihome-gb-nick">↳ {r.nickname}</span>
                <span className="minihome-gb-msg">: {r.content}</span>
                <span className="minihome-gb-time">{formatTime(r.createdAt)}</span>
                {loginNick === r.nickname && (
                  <button
                    type="button"
                    className="minihome-reply-btn"
                    onClick={() => handleDeleteReply(r.id)}
                  >
                    삭제
                  </button>
                )}
              </div>
              {r.imageUrl && <CommentImageView url={r.imageUrl} />}
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
              <CommentImageAttach
                file={replyImage}
                setFile={setReplyImage}
                disabled={submitting}
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
