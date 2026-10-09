import React, { useEffect, useState, useRef } from "react";
/** Rolling RMS envelope from native capture, sampled every 200 ms; no synthetic activity. */
export function Waveform({
  level,
  label,
  system = false,
}: {
  level: number;
  label: string;
  system?: boolean;
}) {
  const [history, setHistory] = useState<number[]>(() => Array(36).fill(0));
  const current = useRef(level);
  current.current = level;
  useEffect(() => {
    const timer = setInterval(
      () =>
        setHistory((values) => [
          ...values.slice(1),
          Math.max(0, Math.min(1, current.current)),
        ]),
      200
    );
    return () => clearInterval(timer);
  }, []);
  return (
    <svg
      viewBox="0 0 180 48"
      className={`h-12 w-full min-w-20 ${
        system
          ? "text-violet-500 dark:text-violet-400"
          : "text-emerald-500 dark:text-emerald-400"
      }`}
      role="img"
      aria-label={`${label} ${Math.round(level * 100)}%`}
    >
      <path d="M0 24H180" className="stroke-current opacity-15" />
      {history.map((value, index) => {
        const height = 2 + Math.sqrt(value) * 42;
        return (
          <rect
            key={index}
            x={index * 5}
            y={(48 - height) / 2}
            width="3"
            height={height}
            rx="1.5"
            className="fill-current opacity-80 transition-all duration-200 motion-reduce:transition-none"
          />
        );
      })}
    </svg>
  );
}
