"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import BackLink from "@/app/components/BackLink";
import { doc, getDoc, deleteDoc } from "firebase/firestore";
import { ref, deleteObject } from "firebase/storage";
import { db, storage } from "@/src/lib/firebase";
import { deleteActivitiesByLink } from "@/src/lib/activity";
import { useAuth } from "@/app/components/AuthProvider";
import { handleEvent } from "@/src/lib/badgeCheck";

const ADMIN_PASSWORD = "dawnlight2024";

function extractYouTubeId(url: string): string | null {
  let m = url.match(/youtu\.be\/([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  if (/youtube\.com/.test(url)) {
    m = url.match(/[?&]v=([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
    m = url.match(/youtube\.com\/(?:embed|shorts|v|live)\/([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
  }
  return null;
}

type AttachmentType = "image" | "video" | "gif";

type Attachment = {
  fileUrl: string;
  fileType: AttachmentType;
};

interface NoticeData {
  title: string;
  content: string;
  attachments: Attachment[];
}

export default function NoticeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { nickname: loginNick } = useAuth();
  const [post, setPost] = useState<NoticeData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const snap = await getDoc(doc(db, "notice", id));
      if (snap.exists()) {
        const d = snap.data();
        setPost({
          title: d.title,
          content: d.content,
          attachments: Array.isArray(d.attachments) ? (d.attachments as Attachment[]) : [],
        });
        if (loginNick) {
          const noticeCreated = d.createdAt?.toDate?.() ?? null;
          handleEvent({
            type: "noticeRead",
            nickname: loginNick,
            noticeCreatedAt: noticeCreated,
          });
        }
      }
      setLoading(false);
    })();
  }, [id, loginNick]);

  const handleEdit = () => {
    router.push(`/notice/edit/${id}`);
  };

  const handleDelete = async () => {
    const pw = prompt("관리자 비밀번호를 입력하세요.");
    if (pw === null) return;
    if (pw !== ADMIN_PASSWORD) {
      alert("관리자 비밀번호가 일치하지 않습니다.");
      return;
    }
    if (!confirm("정말 삭제하시겠습니까?")) return;
    if (post?.attachments?.length) {
      await Promise.all(
        post.attachments.map(async (a) => {
          try {
            await deleteObject(ref(storage, a.fileUrl));
          } catch (e) {
            console.warn("attachment storage delete failed", e);
          }
        }),
      );
    }
    await deleteDoc(doc(db, "notice", id));
    await deleteActivitiesByLink(`/notice/${id}`);
    router.push("/notice");
  };

  if (loading) {
    return (
      <div className="board-content">
        <p className="board-loading">불러오는 중...</p>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="board-content">
        <p className="board-loading">존재하지 않는 공지입니다.</p>
        <BackLink href="/notice" className="board-btn" style={{ display: "inline-block", marginTop: "1rem" }}>
          목록으로
        </BackLink>
      </div>
    );
  }

  return (
    <div className="board-content">
      <BackLink href="/notice" className="back-link">
        ← 목록으로
      </BackLink>

      <div className="board-detail">
        <h1 className="board-detail-title">{post.title}</h1>
        <div className="board-detail-body">
          {post.content.split(/(https?:\/\/[^\s]+)/g).map((part, i) => {
            if (!/^https?:\/\//.test(part)) return part;
            const ytId = extractYouTubeId(part);
            if (ytId) {
              return (
                <div key={i} className="board-youtube-embed">
                  <iframe
                    src={`https://www.youtube.com/embed/${ytId}`}
                    title="YouTube video"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                </div>
              );
            }
            return (
              <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="board-link">
                {part}
              </a>
            );
          })}
        </div>

        {post.attachments.length > 0 && (
          <div className="board-detail-attachments">
            {post.attachments.map((a, i) =>
              a.fileType === "video" ? (
                <video
                  key={i}
                  src={a.fileUrl}
                  controls
                  playsInline
                  className="board-detail-attachment"
                />
              ) : (
                <img
                  key={i}
                  src={a.fileUrl}
                  alt=""
                  className="board-detail-attachment"
                />
              ),
            )}
          </div>
        )}

        <div className="board-detail-actions">
          <button className="board-btn" onClick={handleEdit}>
            수정
          </button>
          <button className="board-btn board-btn-cancel" onClick={handleDelete}>
            삭제
          </button>
          <BackLink href="/notice" className="board-btn">
            목록으로
          </BackLink>
        </div>
      </div>
    </div>
  );
}
