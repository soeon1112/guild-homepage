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

interface Notice {
  id: string;
  title: string;
}

const PAGE_SIZE = 10;

export default function NoticePage() {
  const [items, setItems] = useState<Notice[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [pageSnapshots, setPageSnapshots] = useState<
    (QueryDocumentSnapshot<DocumentData> | null)[]
  >([null]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  useEffect(() => {
    (async () => {
      const col = collection(db, "notice");
      const countSnap = await getCountFromServer(col);
      setTotalCount(countSnap.data().count);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const col = collection(db, "notice");
      const cursor = pageSnapshots[currentPage - 1];

      let q;
      if (cursor) {
        q = query(col, orderBy("createdAt", "desc"), startAfter(cursor), limit(PAGE_SIZE));
      } else {
        q = query(col, orderBy("createdAt", "desc"), limit(PAGE_SIZE));
      }

      const snap = await getDocs(q);
      setItems(
        snap.docs.map((doc) => ({ id: doc.id, title: doc.data().title })),
      );

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

  const getRowNumber = (index: number) => {
    return totalCount - (currentPage - 1) * PAGE_SIZE - index;
  };

  return (
    <div className="board-content">
      <h1 className="board-title">공지 게시판</h1>

      <div className="board-write-btn-wrap">
        <Link href="/notice/write" className="board-btn">
          글쓰기
        </Link>
      </div>

      <div className="board-table-wrap">
        {loading ? (
          <p className="board-loading">불러오는 중...</p>
        ) : items.length === 0 ? (
          <p className="board-loading">공지가 없습니다.</p>
        ) : (
          <table className="board-table">
            <tbody>
              {items.map((n, i) => (
                <tr key={n.id}>
                  <td className="col-no">{getRowNumber(i)}</td>
                  <td className="col-title">
                    <Link href={`/notice/${n.id}`} className="board-post-link">
                      {n.title}
                    </Link>
                  </td>
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
