"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface MemberRow {
  representative: string;
  nickname: string;
  job: string;
  combat: number;
  hell: string;
  challenge: string;
}

export default function StatsPage() {
  const [data, setData] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/sheets")
      .then((res) => res.json())
      .then((json: MemberRow[]) => {
        setData(json);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="stats-content">
      <Link href="/" className="back-link">
        ← 홈으로
      </Link>

      <h1 className="stats-title">투력 및 지옥 현황</h1>

      {loading ? (
        <p className="stats-loading">로딩 중...</p>
      ) : (
        <div className="stats-table-wrap">
          <table className="stats-table">
            <thead>
              <tr>
                <th className="col-representative">대표닉네임</th>
                <th className="col-nickname">닉네임</th>
                <th className="col-job">직업</th>
                <th className="col-combat">전투력</th>
                <th className="col-hell">지옥</th>
                <th className="col-challenge">도전</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i}>
                  <td className="col-representative">{row.representative}</td>
                  <td className="col-nickname">{row.nickname}</td>
                  <td className="col-job">{row.job}</td>
                  <td className="col-combat">{row.combat}</td>
                  <td className="col-hell">{row.hell}</td>
                  <td className="col-challenge">{row.challenge}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
