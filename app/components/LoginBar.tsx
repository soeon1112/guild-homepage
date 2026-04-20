"use client";

import { useState } from "react";
import { useAuth } from "./AuthProvider";

export default function LoginBar() {
  const { nickname, ready, login, signup, logout } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [nick, setNick] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const resetFields = () => {
    setNick("");
    setPw("");
    setPw2("");
    setErr("");
  };

  const handleLogin = async () => {
    setErr("");
    setBusy(true);
    const r = await login(nick, pw);
    setBusy(false);
    if (r.ok) {
      resetFields();
    } else {
      setErr(r.error || "로그인 실패");
    }
  };

  const handleSignup = async () => {
    setErr("");
    if (pw !== pw2) {
      setErr("비밀번호가 일치하지 않습니다.");
      return;
    }
    setBusy(true);
    const r = await signup(nick, pw);
    setBusy(false);
    if (r.ok) {
      resetFields();
      setMode("login");
    } else {
      setErr(r.error || "회원가입 실패");
    }
  };

  if (!ready) {
    return <section className="loginbar loginbar-placeholder" aria-busy="true" />;
  }

  if (nickname) {
    return (
      <section className="loginbar loginbar-loggedin">
        <span className="loginbar-welcome">
          <strong>{nickname}</strong>님 환영합니다
        </span>
        <button className="loginbar-btn" onClick={logout}>
          로그아웃
        </button>
      </section>
    );
  }

  if (mode === "signup") {
    return (
      <section className="loginbar">
        <div className="loginbar-form">
          <input
            className="loginbar-input"
            placeholder="닉네임"
            value={nick}
            onChange={(e) => setNick(e.target.value)}
            maxLength={20}
          />
          <input
            className="loginbar-input"
            type="password"
            placeholder="비밀번호"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            maxLength={40}
          />
          <input
            className="loginbar-input"
            type="password"
            placeholder="비밀번호 확인"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            maxLength={40}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSignup();
            }}
          />
          <button className="loginbar-btn" onClick={handleSignup} disabled={busy}>
            {busy ? "처리 중..." : "등록"}
          </button>
          <button
            className="loginbar-btn loginbar-btn-secondary"
            onClick={() => {
              setMode("login");
              resetFields();
            }}
          >
            취소
          </button>
        </div>
        {err && <p className="loginbar-error">{err}</p>}
      </section>
    );
  }

  return (
    <section className="loginbar">
      <div className="loginbar-form">
        <input
          className="loginbar-input"
          placeholder="닉네임"
          value={nick}
          onChange={(e) => setNick(e.target.value)}
          maxLength={20}
        />
        <input
          className="loginbar-input"
          type="password"
          placeholder="비밀번호"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          maxLength={40}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleLogin();
          }}
        />
        <button className="loginbar-btn" onClick={handleLogin} disabled={busy}>
          {busy ? "처리 중..." : "로그인"}
        </button>
        <button
          className="loginbar-btn loginbar-btn-secondary"
          onClick={() => {
            setMode("signup");
            resetFields();
          }}
        >
          처음 오셨나요?
        </button>
      </div>
      {err && <p className="loginbar-error">{err}</p>}
    </section>
  );
}
