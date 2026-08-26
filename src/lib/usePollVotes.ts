// usePollVotes.ts
// 게시판 투표 시스템 (Phase 2) — Firestore 서브컬렉션 fetch + 토글 hook.
//
// 데이터 구조 (B' 하이브리드):
//   board/{boardId}                  (board doc 안 옵셔널 필드)
//     type?: "normal" | "poll"
//     poll?: PollMeta                  (question/options/deadline/anonymous/
//                                       allowChange/allowMultiple — 메타데이터만 in-line)
//
//   board/{boardId}/votes/{nickname}
//     { optionIds: string[], createdAt: serverTimestamp }
//
// 정책:
//   - allowMultiple=false (기본): 단일 (한 게시글에 본인 1 표만). 같은 optionId
//     재클릭 → 제거. allowChange=true 일 때만 다른 옵션으로 변경 가능 —
//     false 면 기존 vote 있을 시 재클릭/변경 모두 차단.
//   - allowMultiple=true: 다중 선택. optionId 클릭마다 개별 토글 (allowChange
//     무관 — 여러 항목을 오가며 고르는 행위 자체가 다중 선택의 목적이라
//     변경 잠금 대상이 아님).
//   - 마감: pollMeta.deadline < Date.now() 면 isClosed=true, vote() 차단.
//   - 익명: anonymous=true 면 votersByOption 에서 본인 외 nickname 가림.
//     counts/myVotes/totalVotes 는 정상 노출 (결과 공개는 즉시).
//
// 패턴 출처:
//   - useChatReactions.ts 의 nested onSnapshot + setDoc/deleteDoc 토글
//     verbatim 차용. board.id 가 단일이라 50 메시지 nested 보다 단순.
//   - vote()는 onSnapshot 으로 이미 동기화된 로컬 state(myVotes)를 그대로
//     읽어 판단 — getDoc 왕복 추가 없음 (기존 아키텍처 유지).
//
// 마이그레이션 (Phase 1 → 2):
//   - 기존 vote doc은 { optionId: string }. functions/migrate-poll-votes.mjs
//     로 { optionIds: [optionId] } 로 일괄 변환 필요 (배포 순서: 마이그 먼저).
//
// 호출 예:
//   const { counts, myVotes, totalVotes, isClosed, votersByOption, vote } =
//     usePollVotes(boardId, post.poll, loginNick);
//   counts.get("opt1");           // 옵션별 표 수
//   myVotes.includes("opt1");     // 본인 선택 여부
//   await vote("opt2");           // 옵션 2 토글

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
  allowMultiple: boolean;
};

export type PollVotesState = {
  // optionId → count
  counts: Map<string, number>;
  // 본인 표들 (다중 선택 지원 — 없으면 빈 배열)
  myVotes: string[];
  // 전체 참여자 수 (표 수 합계 아님 — 참여한 사람 수)
  totalVotes: number;
  // 마감 여부 (현재 시간 기준)
  isClosed: boolean;
  // 익명 여부 (poll.anonymous)
  isAnonymous: boolean;
  // optionId → [nicknames] (익명이면 본인만 자기 옵션 노출)
  votersByOption: Map<string, string[]>;
  // 투표/취소 토글 (단일: 덮어씀 / 다중: 개별 토글)
  vote: (optionId: string) => Promise<void>;
};

export function usePollVotes(
  boardId: string,
  pollMeta: PollMeta | null | undefined,
  loginNick: string,
): PollVotesState {
  // nick → optionIds[]. board/{boardId}/votes 서브컬렉션 mirror.
  const [allVotes, setAllVotes] = useState<Map<string, string[]>>(new Map());

  useEffect(() => {
    if (!boardId || !pollMeta) {
      setAllVotes(new Map());
      return;
    }
    const unsub = onSnapshot(
      collection(db, "board", boardId, "votes"),
      (snap) => {
        const next = new Map<string, string[]>();
        snap.forEach((d) => {
          const data = d.data();
          let optionIds: string[] = [];
          if (Array.isArray(data.optionIds)) {
            // 신형식 — 우선.
            optionIds = data.optionIds.filter(
              (v: unknown): v is string => typeof v === "string",
            );
          } else if (typeof data.optionId === "string") {
            // 구형식 fallback — 배포 직후 구버전 클라이언트가 아직 optionId
            // 단수 필드로 쓰고 있는 케이스 대응 (마이그 전에도 즉시 반영).
            optionIds = [data.optionId];
          }
          if (optionIds.length > 0) next.set(d.id, optionIds);
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
  for (const [nick, optionIds] of allVotes) {
    for (const optionId of optionIds) {
      counts.set(optionId, (counts.get(optionId) ?? 0) + 1);
      const arr = votersByOption.get(optionId) ?? [];
      arr.push(nick);
      votersByOption.set(optionId, arr);
    }
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

  const myVotes = loginNick ? (allVotes.get(loginNick) ?? []) : [];
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
    const currentIds = myVotes;

    let nextIds: string[];
    if (pollMeta.allowMultiple) {
      // 다중 선택: allowChange 무관 — 옵션별 개별 토글.
      nextIds = currentIds.includes(optionId)
        ? currentIds.filter((id) => id !== optionId)
        : [...currentIds, optionId];
    } else {
      // 단일 선택 — 기존 로직 그대로.
      if (currentIds.includes(optionId)) {
        // 같은 옵션 다시 클릭 → 제거 (allowChange 시만 가능).
        if (!pollMeta.allowChange) return;
        nextIds = [];
      } else {
        // 다른 옵션 / 신규. 변경 불가 + 이미 투표면 차단.
        if (currentIds.length > 0 && !pollMeta.allowChange) return;
        nextIds = [optionId];
      }
    }

    if (nextIds.length === 0) {
      await deleteDoc(refDoc);
    } else {
      await setDoc(refDoc, {
        optionIds: nextIds,
        createdAt: serverTimestamp(),
      });
    }
  };

  return {
    counts,
    myVotes,
    totalVotes,
    isClosed,
    isAnonymous,
    votersByOption,
    vote,
  };
}
