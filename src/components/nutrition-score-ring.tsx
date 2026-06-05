"use client";

interface Props {
  score: number; // 0–100
  size?: number;
  strokeWidth?: number;
}

const BAND_LABELS = [
  { min: 90, label: "Excellent", color: "#22c55e" },
  { min: 70, label: "Good", color: "#84cc16" },
  { min: 50, label: "Fair", color: "#f59e0b" },
  { min: 0, label: "Needs Work", color: "#ef4444" },
];

export function NutritionScoreRing({ score, size = 120, strokeWidth = 10 }: Props) {
  const band = BAND_LABELS.find((b) => score >= b.min) ?? BAND_LABELS[BAND_LABELS.length - 1];
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - score / 100);
  const cx = size / 2;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="#e5e7eb" strokeWidth={strokeWidth} />
        <circle
          cx={cx} cy={cx} r={r} fill="none"
          stroke={band.color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center" style={{ marginTop: size * 0.28 }}>
        <span className="text-2xl font-bold" style={{ color: band.color }}>{score}</span>
        <span className="text-xs text-muted-foreground">{band.label}</span>
      </div>
      <p className="text-sm font-medium" style={{ color: band.color }}>{band.label}</p>
      <p className="text-xs text-muted-foreground">Nutrition Score</p>
    </div>
  );
}
