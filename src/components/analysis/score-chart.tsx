"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ScoreDimension } from "@/lib/analysis/types";

export function ScoreChart({ dimensions }: { dimensions: ScoreDimension[] }) {
  const data = dimensions.map((dimension) => ({
    name: dimension.label,
    score: dimension.score ?? 0
  }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: -18, right: 8, top: 8, bottom: 24 }}>
          <CartesianGrid stroke="rgba(244,239,229,0.1)" vertical={false} />
          <XAxis dataKey="name" tick={{ fill: "#9aa7b8", fontSize: 11 }} interval={0} angle={-30} textAnchor="end" height={58} />
          <YAxis tick={{ fill: "#9aa7b8", fontSize: 11 }} domain={[0, 100]} />
          <Tooltip
            cursor={{ fill: "rgba(185,155,95,0.08)" }}
            contentStyle={{
              background: "#07111f",
              border: "1px solid rgba(244,239,229,0.16)",
              color: "#f4efe5"
            }}
          />
          <Bar dataKey="score" fill="#b99b5f" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
