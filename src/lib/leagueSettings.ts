// src/lib/leagueSettings.ts
export type LeagueMode = "pony" | "boys" | "senior";

const STORAGE_KEY = "easyannounce_league_mode";

export function getLeagueMode(): LeagueMode {
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "boys" ? "boys" : v === "senior" ? "senior" : "pony";
}

export function setLeagueMode(mode: LeagueMode) {
  localStorage.setItem(STORAGE_KEY, mode);
}

export function getLeagueLabel(mode: LeagueMode): string {
  return mode === "boys" ? "ボーイズリーグ" : mode === "senior" ? "リトルシニア" : "ポニーリーグ";
}