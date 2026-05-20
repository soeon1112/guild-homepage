"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  collection,
  query,
  orderBy,
  getDocs,
  limit,
  startAfter,
  getCountFromServer,
  QueryDocumentSnapshot,
  DocumentData,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import NicknameLink from "@/app/components/NicknameLink";
import { useDawnlight2 } from "@/src/lib/featureFlags";
import { formatSmart } from "@/src/lib/formatSmart";

interface Post {
  id: string;
  title: string;
  nickname: string;
  createdAt: Date;
  commentCount: number;
  // poll/p4: 투표 게시글 목록 배지용. ms 로 비교해 마감 임박/마감 분기.
  isPoll?: boolean;
  pollDeadlineMs?: number;
}

const PAGE_SIZE = 10;

export default function BoardPage() {
  // dl2 reskin: wrap root with `dawnlight2 dl2-board` so the CSS
  // overrides in globals.css attach. Page head + table + pagination
  // are recolored centrally — same pattern as /notice and /proposals.
  const isDawnlight2 = useDawnlight2();
  const [posts, setPosts] = useState<Post[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [pageSnapshots, setPageSnapshots] = useState<
    (QueryDocumentSnapshot<DocumentData> | null)[]
  >([null]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  useEffect(() => {
    (async () => {
      const col = collection(db, "board");
      const countSnap = await getCountFromServer(col);
      setTotalCount(countSnap.data().count);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const col = collection(db, "board");
      const cursor = pageSnapshots[currentPage - 1];

      let q;
      if (cursor) {
        q = query(col, orderBy("createdAt", "desc"), startAfter(cursor), limit(PAGE_SIZE));
      } else {
        q = query(col, orderBy("createdAt", "desc"), limit(PAGE_SIZE));
      }

      const snap = await getDocs(q);
      const items: Post[] = await Promise.all(
        snap.docs.map(async (doc) => {
          const d = doc.data();
          const commentsCol = collection(db, "board", doc.id, "comments");
          const commentsSnap = await getDocs(commentsCol);
          const replyCounts = await Promise.all(
            commentsSnap.docs.map(async (c) => {
              const rSnap = await getCountFromServer(
                collection(db, "board", doc.id, "comments", c.id, "replies"),
              );
              return rSnap.data().count;
            }),
          );
          const total =
            commentsSnap.size + replyCounts.reduce((a, b) => a + b, 0);
          // poll/p4: type/poll.deadline 매핑 — 목록 배지 표시용.
          const isPoll = d.type === "poll";
          const dl = (d.poll as { deadline?: { toMillis?: () => number } } | undefined)?.deadline;
          const pollDeadlineMs =
            isPoll && dl && typeof dl.toMillis === "function"
              ? dl.toMillis()
              : undefined;
          return {
            id: doc.id,
            title: d.title,
            nickname: d.nickname,
            createdAt: d.createdAt?.toDate?.() ?? new Date(),
            commentCount: total,
            isPoll,
            pollDeadlineMs,
          };
        })
      );
      setPosts(items);

      if (snap.docs.length > 0) {
        setPageSnapshots((prev) => {
          const next = [...prev];
          next[currentPage] = snap.docs[snap.docs.length - 1];
          return next;
        });
      }

      setLoading(false);
    })();
  }, [currentPage]);

  const formatDate = (d: Date) => formatSmart(d);

  const getRowNumber = (index: number) => {
    return totalCount - (currentPage - 1) * PAGE_SIZE - index;
  };

  return (
    <div
      className={
        "board-content" + (isDawnlight2 ? " dl2-board" : "")
      }
    >
      {isDawnlight2 ? (
        <header className="dl2-board-page-head">
          <h1 className="dl2-board-page-title">게시판</h1>
          <p className="dl2-board-page-sub">BOARD</p>
        </header>
      ) : (
        <h1 className="board-title">게시판</h1>
      )}

      <div className="board-write-btn-wrap">
        <Link href="/board/write" className="board-btn">
          {isDawnlight2 ? "✦ 글쓰기" : "글쓰기"}
        </Link>
      </div>

      <div className="board-table-wrap">
        {loading ? (
          <p className="board-loading">불러오는 중...</p>
        ) : posts.length === 0 ? (
          <p className="board-loading">게시글이 없습니다.</p>
        ) : (
          <table className="board-table">
            <tbody>
              {posts.map((post, i) => {
                // poll/p4: 투표 게시글 배지 — 마감 상태별 색.
                const now = Date.now();
                const isClosed =
                  post.pollDeadlineMs !== undefined &&
                  post.pollDeadlineMs < now;
                const isImminent =
                  post.pollDeadlineMs !== undefined &&
                  !isClosed &&
                  post.pollDeadlineMs - now < 24 * 60 * 60 * 1000;
                const badgeColor = isImminent
                  ? "#c44545"
                  : isClosed
                    ? isDawnlight2
                      ? "rgba(92,58,31,0.45)"
                      : "rgba(244,239,255,0.45)"
                    : isDawnlight2
                      ? "#5c3a1f"
                      : undefined;
                return (
                <tr key={post.id}>
                  <td className="col-no">{getRowNumber(i)}</td>
                  <td className="col-title">
                    <Link href={`/board/${post.id}`} className="board-post-link">
                      {post.isPoll && (
                        <span
                          aria-label={
                            isClosed
                              ? "마감된 투표"
                              : isImminent
                                ? "마감 임박 투표"
                                : "투표"
                          }
                          style={{
                            display: "inline-block",
                            marginRight: 6,
                            color: badgeColor,
                            fontWeight: isImminent ? 600 : undefined,
                          }}
                        >
                          📊
                        </span>
                      )}
                      {post.title}
                      {post.commentCount > 0 && (
                        <span className="comment-count"> [{post.commentCount}]</span>
                      )}
                    </Link>
                  </td>
                  <td className="col-author">
                    <NicknameLink
                      nickname={post.nickname}
                      className={isDawnlight2 ? "dl2-board-nick" : undefined}
                    />
                  </td>
                  <td className="col-date">{formatDate(post.createdAt)}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="board-pagination">
        <button
          className="board-page-btn"
          disabled={currentPage <= 1}
          onClick={() => setCurrentPage((p) => p - 1)}
        >
          이전
        </button>
        <span className="board-page-info">
          {currentPage} / {totalPages}
        </span>
        <button
          className="board-page-btn"
          disabled={currentPage >= totalPages}
          onClick={() => setCurrentPage((p) => p + 1)}
        >
          다음
        </button>
      </div>
    </div>
  );
}
