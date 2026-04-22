"use client";

import { useState } from "react";
import BackLink from "@/app/components/BackLink";
import { logActivity } from "@/src/lib/activity";

const ADMIN_PASSWORD = "dawnlight2024";

export default function AdminActivityPage() {
  const [pw, setPw] = useState("");
  const [verified, setVerified] = useState(false);
  const [err, setErr] = useState("");

  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState("");
  const [submitErr, setSubmitErr] = useState("");

  const handleVerify = () => {
    if (pw !== ADMIN_PASSWORD) {
      setErr("관리자 비밀번호가 일치하지 않습니다.");
      return;
    }
    setErr("");
    setVerified(true);
  };

  const handleSubmit = async () => {
    const trimmed = message.trim();
    if (!trimmed) {
      setSubmitErr("메시지를 입력해주세요.");
      setSuccess("");
      return;
    }
    setSubmitting(true);
    setSubmitErr("");
    setSuccess("");
    try {
      const trimmedLink = link.trim();
      await logActivity("admin", "관리자", trimmed, trimmedLink || undefined);
      setMessage("");
      setLink("");
      setSuccess("등록되었습니다.");
    } catch (e) {
      console.error(e);
      setSubmitErr("등록에 실패했습니다.");
    }
    setSubmitting(false);
  };

  if (!verified) {
    return (
      <div className="admin-exchange">
        <BackLink href="/" className="back-link">← 홈으로</BackLink>
        <h1 className="admin-exchange-title">최신 현황 관리</h1>
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
          {err && <p className="loginbar-error">{err}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="admin-exchange">
      <BackLink href="/" className="back-link">← 홈으로</BackLink>
      <h1 className="admin-exchange-title">최신 현황 작성</h1>

      <div className="admin-activity-form">
        <label className="admin-activity-label">
          메시지
          <textarea
            className="admin-activity-textarea"
            placeholder="최신 현황에 표시할 메시지를 입력하세요."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
          />
        </label>
        <label className="admin-activity-label">
          링크 (선택)
          <input
            type="text"
            className="loginbar-input"
            placeholder="/notice/123 또는 https://..."
            value={link}
            onChange={(e) => setLink(e.target.value)}
          />
        </label>
        <button
          className="minihome-btn"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? "등록 중..." : "등록"}
        </button>
        {success && <p className="admin-activity-success">{success}</p>}
        {submitErr && <p className="loginbar-error">{submitErr}</p>}
      </div>
    </div>
  );
}
