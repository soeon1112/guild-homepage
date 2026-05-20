// usePollVotes.ts
// 게시판 투표 시스템 (Phase 1) — Firestore 서브컬렉션 fetch + 토글 hook.
//
// 데이터 구조 (B' 하이브리드):
//   board/{boardId}                  (board doc 안 옵셔널 필드)
//     type?: "normal" | "poll"
//     poll?: PollMeta                  (question/options/deadline/anonymous/
//                                       allowChange — 메타데이터만 in-line)
//
//   board/{boardId}/votes/{nickname}
//     { optionId: string, createdAt: serverTimestamp }
//
// 정책:
//   - 단일 (한 게시글에 본인 1 표만). 같은 optionId 재클릭 → 제거.
//   - 변경 가능: allowChange=true 일 때만. false 면 기존 vote 있을 시 차단.
//   - 마감: pollMeta.deadline < Date.now() 면 isClosed=true, vote() 차단.
//   - 익명: anonymous=true 면 votersByOption 에서 본인 외 nickname 가림.
//     counts/myVote/totalVotes 는 정상 노출 (결과 공개는 즉시).
//
// 패턴 출처:
//   - useChatReactions.ts 의 nested onSnapshot + setDoc/deleteDoc 토글
//     verbatim 차용. board.id 가 단일이라 50 메시지 nested 보다 단순.
//
// 호출 예:
//   const { counts, myVote, totalVotes, isClosed, votersByOption, vote } =
//     usePollVotes(boardId, post.poll, loginNick);
//   counts.get("opt1");           // 옵션별 표 수
//   myVote === "opt1";            // 본인 선택
//   await vote("opt2");           // 옵션 2로 변경 (또는 같은 옵션이면 취소)

import { useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";

export type PollOption = {
  id: string;
  text: string;
};

export type PollMeta = {
  question: string;
  options: PollOption[];
  deadline?: Timestamp;
  anonymous: boolean;
  allowChange: boolean;
};

export type PollVotesState = {
  // optionId → count
  counts: Map<string, number>;
  // 본인 표 (없으면 null)
  myVote: string | null;
  // 전체 참여자 수
  totalVotes: number;
  // 마감 여부 (현재 시간 기준)
  isClosed: boolean;
  // 익명 여부 (poll.anonymous)
  isAnonymous: boolean;
  // optionId → [nicknames] (익명이면 본인만 자기 옵션 노출)
  votersByOption: Map<string, string[]>;
  // 투표/취소 토글
  vote: (optionId: string) => Promise<void>;
};

export function usePollVotes(
  boardId: string,
  pollMeta: PollMeta | null | undefined,
  loginNick: string,
): PollVotesState {
  // nick → optionId. board/{boardId}/votes 서브컬렉션 mirror.
  const [allVotes, setAllVotes] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!boardId || !pollMeta) {
      setAllVotes(new Map());
      return;
    }
    const unsub = onSnapshot(
      collection(db, "board", boardId, "votes"),
      (snap) => {
        const next = new Map<string, string>();
        snap.forEach((d) => {
          const data = d.data();
          const optionId =
            typeof data.optionId === "string" ? data.optionId : "";
          if (optionId) next.set(d.id, optionId);
        });
        setAllVotes(next);
      },
    );
    return () => unsub();
    // pollMeta 자체는 매 렌더 새 객체일 수 있어 !!pollMeta 로 boolean 화 —
    // 단순 mount/unmount/poll 존재 여부 토글에만 반응.
  }, [boardId, !!pollMeta]);

  // counts + votersByOption 계산 (매 렌더 — 11명 비공개라 비용 무관).
  const counts = new Map<string, number>();
  const votersByOption = new Map<string, string[]>();
  for (const [nick, optionId] of allVotes) {
    counts.set(optionId, (counts.get(optionId) ?? 0) + 1);
    const arr = votersByOption.get(optionId) ?? [];
    arr.push(nick);
    votersByOption.set(optionId, arr);
  }

  // 익명 처리: 익명이면 본인만 자기 옵션 노출. counts/totalVotes 는 그대로.
  if (pollMeta?.anonymous) {
    for (const [optionId, nicks] of votersByOption) {
      votersByOption.set(
        optionId,
        nicks.filter((n) => n === loginNick),
      );
    }
  }

  const myVote = loginNick ? (allVotes.get(loginNick) ?? null) : null;
  const totalVotes = allVotes.size;

  // 마감 검사 — 클라이언트 시간 기준. Firestore Rules 도 동일 검사 권장.
  const isClosed = pollMeta?.deadline
    ? pollMeta.deadline.toMillis() < Date.now()
    : false;

  const isAnonymous = !!pollMeta?.anonymous;

  const vote = async (optionId: string) => {
    if (!loginNick || !boardId || !optionId || !pollMeta) return;
    if (isClosed) return;

    const refDoc = doc(db, "board", boardId, "votes", loginNick);
    const current = myVote;

    // 같은 옵션 다시 클릭 → 제거 (allowChange 시만 가능).
    if (current === optionId) {
      if (!pollMeta.allowChange) return;
      await deleteDoc(refDoc);
      return;
    }

    // 다른 옵션 / 신규 → setDoc. 변경 불가 + 이미 투표면 차단.
    if (current && !pollMeta.allowChange) return;

    await setDoc(refDoc, {
      optionId,
      createdAt: serverTimestamp(),
    });
  };

  return {
    counts,
    myVote,
    totalVotes,
    isClosed,
    isAnonymous,
    votersByOption,
    vote,
  };
}
