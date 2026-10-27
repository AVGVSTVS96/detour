import type { Tone } from "@/lib/verdict";

export const TONE_FILL: Record<Tone, string> = {
  bad: "bg-rough",
  good: "bg-smooth",
  plain: "bg-fair",
  unknown: "bg-unknown",
};

export const GRADE_FILL = ["bg-unknown", "bg-smooth", "bg-fair", "bg-rough"];

export const GRADE_STROKE = [
  "stroke-paper",
  "stroke-smooth",
  "stroke-fair",
  "stroke-rough",
];

export const TONE_WORD: Record<Tone, string> = {
  bad: "Rough",
  good: "Smooth",
  plain: "Fair",
  unknown: "Unknown",
};
