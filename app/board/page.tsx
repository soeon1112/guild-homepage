"use client";

import Link from "next/link";
import BackLink from "@/app/components/BackLink";
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

interface Post {
  id: string;
  title: string;
  nickname: string;
  createdAt: Date;
  commentCount: number;
}

const PAGE_SIZE = 10;

export default function BoardPage() {
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
          return {
            id: doc.id,
            title: d.title,
            nickname: d.nickname,
            createdAt: d.createdAt?.toDate?.() ?? new Date(),
            commentCount: total,
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

  const formatDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}.${m}.${day}`;
  };

  const getRowNumber = (index: number) => {
    return totalCount - (currentPage - 1) * PAGE_SIZE - index;
  };

  return (
    <div className="board-content">
      <BackLink href="/" className="back-link">
        ← 홈으로
      </BackLink>

      <h1 className="board-title">게시판</h1>

      <div className="board-write-btn-wrap">
        <Link href="/board/write" className="board-btn">
          글쓰기
        </Link>
      </div>

      <div className="board-table-wrap">
        {loading ? (
          <p className="board-loading">불러오는 중...</p>
        ) : posts.length === 0 ? (
          <p className="board-loading">게시글이 없습니다.</p>
        ) : (
          <table className="board-table">
            <thead>
              <tr>
                <th className="col-no">번호</th>
                <th className="col-title">제목</th>
                <th className="col-author">작성자</th>
                <th className="col-date">날짜</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((post, i) => (
                <tr key={post.id}>
                  <td className="col-no">{getRowNumber(i)}</td>
                  <td className="col-title">
                    <Link href={`/board/${post.id}`} className="board-post-link">
                      {post.title}
                      {post.commentCount > 0 && (
                        <span className="comment-count"> [{post.commentCount}]</span>
                      )}
                    </Link>
                  </td>
                  <td className="col-author">{post.nickname}</td>
                  <td className="col-date">{formatDate(post.createdAt)}</td>
                </tr>
              ))}
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
