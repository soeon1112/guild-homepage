"use client";

import { useEffect, useState } from "react";
import BackLink from "@/app/components/BackLink";
import {
  deleteTestRenewalLetters,
  getRenewalEventStatus,
  initRenewalEvent,
  RENEWAL_EVENT_AMOUNT,
  RENEWAL_EVENT_ID,
  sendTestRenewalLetter,
  subscribeRenewalClaims,
  type RenewalEventStatus,
  type RenewalInitResult,
  type TestDeleteResult,
  type TestSendResult,
} from "@/src/lib/renewalEvent";

const ADMIN_PASSWORD = "dawnlight2024";

function formatDateTime(d: Date | null): string {
  if (!d) return "-";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}.${m}.${day} ${hh}:${mm}`;
}

export default function AdminRenewalEventPage() {
  const [pw, setPw] = useState("");
  const [verified, setVerified] = useState(false);
  const [pwErr, setPwErr] = useState("");

  const [status, setStatus] = useState<RenewalEventStatus | null>(null);
  const [eligibleList, setEligibleList] = useState<string[]>([]);
  const [claimedList, setClaimedList] = useState<string[]>([]);
  const [unclaimedList, setUnclaimedList] = useState<string[]>([]);

  const [starting, setStarting] = useState(false);
  const [startResult, setStartResult] = useState<RenewalInitResult | null>(null);
  const [startErr, setStartErr] = useState("");

  // Test mode state
  const [testNick, setTestNick] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testDeleting, setTestDeleting] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [testErr, setTestErr] = useState<string | null>(null);

  // Initial status load.
  useEffect(() => {
    if (!verified) return;
    let cancelled = false;
    getRenewalEventStatus()
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch((e) => {
        console.error(e);
        if (!cancelled) setStartErr("이벤트 상태를 불러오지 못했습니다.");
      });
    return () => {
      cancelled = true;
    };
  }, [verified]);

  // Live subscription to claims (only after event started).
  useEffect(() => {
    if (!verified) return;
    if (!status?.started) return;
    const unsub = subscribeRenewalClaims(({ eligible, claimed, unclaimed }) => {
      setEligibleList(eligible);
      setClaimedList(claimed);
      setUnclaimedList(unclaimed);
      setStatus((prev) =>
        prev
          ? {
              ...prev,
              eligibleCount: eligible.length || prev.eligibleCount,
              claimedCount: claimed.length,
            }
          : prev,
      );
    });
    return unsub;
  }, [verified, status?.started]);

  const handleVerify = () => {
    if (pw !== ADMIN_PASSWORD) {
      setPwErr("관리자 비밀번호가 일치하지 않습니다.");
      return;
    }
    setPwErr("");
    setVerified(true);
  };

  const handleStart = async () => {
    if (starting) return;
    if (status?.started) return;
    const ok = confirm(
      "리뉴얼 기념 이벤트를 정말 시작할까요?\n" +
        "\n" +
        "모든 현재 길드원에게 별똥별 편지가 발송됩니다.\n" +
        "되돌릴 수 없습니다.",
    );
    if (!ok) return;
    setStarting(true);
    setStartErr("");
    setStartResult(null);
    try {
      const result = await initRenewalEvent();
      setStartResult(result);
      // Refresh status so the UI flips to "진행 중".
      const fresh = await getRenewalEventStatus();
      setStatus(fresh);
    } catch (e) {
      console.error(e);
      setStartErr(
        e instanceof Error
          ? `이벤트 시작에 실패했습니다: ${e.message}`
          : "이벤트 시작에 실패했습니다.",
      );
    }
    setStarting(false);
  };

  const describeTestError = (e: unknown): string => {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "NICKNAME_REQUIRED") return "닉네임을 입력해 주세요";
    if (msg === "USER_NOT_FOUND")
      return "해당 닉네임의 계정을 찾을 수 없습니다";
    return `실패: ${msg}`;
  };

  const handleTestSend = async () => {
    if (testSending || testDeleting) return;
    setTestMsg(null);
    setTestErr(null);
    setTestSending(true);
    try {
      const r: TestSendResult = await sendTestRenewalLetter(testNick);
      setTestMsg(
        r.alreadyExisted
          ? `${r.nickname} 계정에 이미 테스트 편지가 있어요 (중복 발송하지 않음)`
          : `${r.nickname} 계정에 테스트 편지를 보냈습니다 ✨`,
      );
    } catch (e) {
      console.error(e);
      setTestErr(describeTestError(e));
    }
    setTestSending(false);
  };

  const handleTestDelete = async () => {
    if (testSending || testDeleting) return;
    setTestMsg(null);
    setTestErr(null);
    const ok = confirm(
      `${testNick.trim()} 계정의 테스트 편지와 테스트 수령 기록을 삭제할까요?\n` +
        "\n" +
        "(이미 지급된 포인트는 되돌리지 않습니다)",
    );
    if (!ok) return;
    setTestDeleting(true);
    try {
      const r: TestDeleteResult = await deleteTestRenewalLetters(testNick);
      setTestMsg(
        `${r.nickname}: 테스트 편지 ${r.lettersDeleted}건 삭제` +
          (r.claimDeleted ? " · 테스트 수령 기록도 삭제됨" : ""),
      );
    } catch (e) {
      console.error(e);
      setTestErr(describeTestError(e));
    }
    setTestDeleting(false);
  };

  if (!verified) {
    return (
      <div className="admin-exchange">
        <BackLink href="/" className="back-link">
          ← 홈으로
        </BackLink>
        <h1 className="admin-exchange-title">리뉴얼 기념 이벤트</h1>
        <div className="admin-exchange-gate">
          <input
            type="password"
            className="loginbar-input"
            placeholder="관리자 비밀번호"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleVerify();
            }}
            autoFocus
          />
          <button className="minihome-btn" onClick={handleVerify}>
            확인
          </button>
          {pwErr && <p className="loginbar-error">{pwErr}</p>}
        </div>
      </div>
    );
  }

  const started = status?.started ?? false;
  const eligibleCount = status?.eligibleCount ?? 0;
  const claimedCount = status?.claimedCount ?? 0;

  return (
    <div className="admin-exchange">
      <BackLink href="/" className="back-link">
        ← 홈으로
      </BackLink>
      <h1 className="admin-exchange-title">리뉴얼 기념 이벤트</h1>

      <p
        style={{
          margin: "0 0 1rem",
          fontSize: 13,
          lineHeight: 1.6,
          opacity: 0.75,
        }}
      >
        이벤트 ID: <code>{RENEWAL_EVENT_ID}</code> · 지급액:{" "}
        <strong>+{RENEWAL_EVENT_AMOUNT}p</strong> · 1인 1회 · 트랜잭션 기반
        중복 방지
      </p>

      {/* Test mode — yellow dashed border, visually segregated from real
          event actions. Hidden once the real event has started. */}
      {!started && (
        <section
          style={{
            margin: "1rem 0 1.25rem",
            padding: "1rem 1.25rem",
            borderRadius: 10,
            border: "2px dashed rgba(240,200,60,0.65)",
            background: "rgba(240,200,60,0.06)",
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              marginBottom: 4,
              color: "#d4a60a",
            }}
          >
            🧪 테스트 영역 — 실제 이벤트 X
          </div>
          <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 12 }}>
            특정 계정 하나에만 편지를 보내서 UI 확인용. 실제 이벤트에는 영향
            없습니다. 테스트 편지는 <code>isTest: true</code>로 구분되어 관리자
            통계에서 제외됩니다.
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              alignItems: "center",
            }}
          >
            <input
              type="text"
              className="loginbar-input"
              placeholder="닉네임 입력 (예: 언쏘)"
              value={testNick}
              onChange={(e) => setTestNick(e.target.value)}
              disabled={testSending || testDeleting}
              style={{ flex: "1 1 180px", minWidth: 160 }}
            />
            <button
              className="minihome-btn"
              onClick={handleTestSend}
              disabled={testSending || testDeleting || !testNick.trim()}
              style={{
                padding: "0.5rem 0.9rem",
                fontSize: 13,
                fontWeight: 500,
                background: testSending
                  ? "rgba(240,200,60,0.2)"
                  : "rgba(240,200,60,0.8)",
                color: "#1a0f3d",
                border: "1px solid rgba(240,200,60,0.9)",
                borderRadius: 6,
                cursor: testSending ? "wait" : "pointer",
              }}
            >
              {testSending ? "발송 중..." : "지정 계정에 테스트 편지 발송"}
            </button>
            <button
              className="minihome-btn"
              onClick={handleTestDelete}
              disabled={testSending || testDeleting || !testNick.trim()}
              style={{
                padding: "0.5rem 0.9rem",
                fontSize: 13,
                fontWeight: 500,
                background: testDeleting
                  ? "rgba(180,180,180,0.3)"
                  : "transparent",
                color: "#d4a60a",
                border: "1px solid rgba(240,200,60,0.6)",
                borderRadius: 6,
                cursor: testDeleting ? "wait" : "pointer",
              }}
            >
              {testDeleting ? "삭제 중..." : "테스트 편지 삭제"}
            </button>
          </div>

          {testMsg && (
            <p
              style={{
                margin: "10px 0 0",
                fontSize: 12,
                color: "#4cc38a",
              }}
            >
              ✓ {testMsg}
            </p>
          )}
          {testErr && (
            <p
              style={{
                margin: "10px 0 0",
                fontSize: 12,
                color: "#e67b6b",
              }}
            >
              {testErr}
            </p>
          )}
        </section>
      )}

      {/* Start button section — real event trigger */}
      <section
        style={{
          margin: "1rem 0 1.5rem",
          padding: "1rem 1.25rem",
          borderRadius: 10,
          border: started
            ? "1px solid rgba(80,200,120,0.35)"
            : "2px solid rgba(230,123,107,0.7)",
          background: started
            ? "rgba(80,200,120,0.08)"
            : "rgba(230,123,107,0.08)",
        }}
      >
        {started ? (
          <div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "#4cc38a",
                marginBottom: 4,
              }}
            >
              ● 이벤트 진행 중
            </div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              시작: {formatDateTime(status?.startedAt ?? null)}
            </div>
          </div>
        ) : (
          <>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                marginBottom: 6,
                color: "#e67b6b",
              }}
            >
              ⚠ 실제 이벤트 시작 — 진짜 실행됩니다
            </div>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 12 }}>
              모든 현재 길드원에게 별똥별 편지를 발송합니다. 한 번 시작하면
              되돌릴 수 없습니다. 배포 전에는 위 <strong>🧪 테스트 영역</strong>
              을 먼저 사용하세요.
            </div>
            <button
              className="minihome-btn"
              onClick={handleStart}
              disabled={starting}
              style={{
                padding: "0.6rem 1.2rem",
                fontSize: 14,
                fontWeight: 600,
                background: starting
                  ? "rgba(216,150,200,0.3)"
                  : "linear-gradient(135deg, #FFE5C4, #FFB5A7, #D896C8)",
                color: starting ? "#888" : "#1a0f3d",
                border: "none",
                borderRadius: 8,
                cursor: starting ? "wait" : "pointer",
                boxShadow: starting
                  ? "none"
                  : "0 0 12px rgba(255,181,167,0.4)",
              }}
            >
              {starting ? "편지 발송 중..." : "✨ 이벤트 시작 (편지 발송)"}
            </button>
            {starting && (
              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
                잠시만 기다려주세요. 길드원 수에 따라 수 초 걸릴 수 있습니다.
              </div>
            )}
          </>
        )}
      </section>

      {/* Start result */}
      {startResult && (
        <section
          style={{
            margin: "0 0 1.5rem",
            padding: "0.875rem 1rem",
            borderRadius: 8,
            border: "1px solid rgba(80,200,120,0.3)",
            background: "rgba(80,200,120,0.06)",
            fontSize: 13,
          }}
        >
          {startResult.alreadyStarted ? (
            <div>이미 시작된 이벤트입니다.</div>
          ) : (
            <div>
              <strong>✓ 발송 완료.</strong> 대상자 {startResult.eligibleCount}
              명 중 편지 {startResult.lettersCreated}건 생성됨.
            </div>
          )}
          {startResult.failures.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <strong style={{ color: "#e67b6b" }}>
                실패 {startResult.failures.length}건
              </strong>
              <ul
                style={{
                  margin: "4px 0 0",
                  paddingLeft: 16,
                  maxHeight: 120,
                  overflowY: "auto",
                }}
              >
                {startResult.failures.map((f, i) => (
                  <li key={i} style={{ fontSize: 12 }}>
                    {f.nickname}: {f.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
      {startErr && <p className="loginbar-error">{startErr}</p>}

      {/* Status summary */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
          margin: "0 0 1.5rem",
        }}
      >
        <div
          style={{
            padding: "0.875rem",
            borderRadius: 8,
            border: "1px solid rgba(216,150,200,0.2)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 11, opacity: 0.7 }}>
            {started ? "대상자" : "현재 길드원"}
          </div>
          <div style={{ fontSize: 24, fontWeight: 600, marginTop: 4 }}>
            {eligibleCount}
          </div>
        </div>
        <div
          style={{
            padding: "0.875rem",
            borderRadius: 8,
            border: "1px solid rgba(80,200,120,0.25)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 11, opacity: 0.7 }}>수령 완료</div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 600,
              marginTop: 4,
              color: "#4cc38a",
            }}
          >
            {claimedCount}
          </div>
        </div>
        <div
          style={{
            padding: "0.875rem",
            borderRadius: 8,
            border: "1px solid rgba(255,181,167,0.25)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 11, opacity: 0.7 }}>미수령</div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 600,
              marginTop: 4,
              color: "#f4a78f",
            }}
          >
            {started ? Math.max(0, eligibleCount - claimedCount) : "-"}
          </div>
        </div>
      </section>

      {/* Unclaimed list */}
      {started && (
        <section style={{ margin: "0 0 2rem" }}>
          <h2
            style={{
              fontSize: 14,
              fontWeight: 600,
              margin: "0 0 0.75rem",
            }}
          >
            미수령자 목록 ({unclaimedList.length})
          </h2>
          {unclaimedList.length === 0 ? (
            <p
              style={{
                padding: "0.75rem",
                fontSize: 13,
                opacity: 0.7,
                textAlign: "center",
                borderRadius: 8,
                border: "1px dashed rgba(216,150,200,0.3)",
              }}
            >
              모든 길드원이 수령했습니다. ✨
            </p>
          ) : (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                padding: "0.75rem",
                borderRadius: 8,
                border: "1px solid rgba(255,181,167,0.2)",
                maxHeight: 240,
                overflowY: "auto",
              }}
            >
              {unclaimedList.map((n) => (
                <span
                  key={n}
                  style={{
                    padding: "4px 10px",
                    fontSize: 12,
                    borderRadius: 999,
                    background: "rgba(255,181,167,0.12)",
                    border: "1px solid rgba(255,181,167,0.3)",
                  }}
                >
                  {n}
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Claimed list (collapsed by default would be nicer, but keep simple) */}
      {started && claimedList.length > 0 && (
        <section>
          <h2
            style={{
              fontSize: 14,
              fontWeight: 600,
              margin: "0 0 0.75rem",
            }}
          >
            수령자 목록 ({claimedList.length})
          </h2>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              padding: "0.75rem",
              borderRadius: 8,
              border: "1px solid rgba(80,200,120,0.2)",
              maxHeight: 240,
              overflowY: "auto",
            }}
          >
            {claimedList.map((n) => (
              <span
                key={n}
                style={{
                  padding: "4px 10px",
                  fontSize: 12,
                  borderRadius: 999,
                  background: "rgba(80,200,120,0.1)",
                  border: "1px solid rgba(80,200,120,0.3)",
                }}
              >
                {n}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
