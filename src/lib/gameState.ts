export type BattingOrderEntry = {
  id: number;
  reason: string;
};

export type UsedPlayerInfoEntry = {
  fromPos?: string;
  subId?: number;
  reason?: string;
  order?: number;
  wasStarter?: boolean;
  hasReentered?: boolean;
};

export type UsedPlayerInfoMap = Record<number, UsedPlayerInfoEntry>;

export type AssignmentsMap = Record<string, number | null>;

export type CurrentBattingSlot = {
  order: number;        // 1〜9
  originalId: number;   // battingOrder上の元ID
  currentId: number;    // 実際に今出ているID
  reason: string;
};

export type CurrentGameState = {
  battingOrder9: CurrentBattingSlot[];
  fieldByPos: AssignmentsMap;
  onFieldPlayerIds: number[];
};

export const resolveCurrentPlayerId = (
  startId: number,
  used: UsedPlayerInfoMap
): number => {
  const first = used?.[startId];

  if (!first || typeof first.subId !== "number") {
    return startId;
  }

  let cur = first.subId;
  const seen = new Set<number>([startId]);

  while (typeof cur === "number" && !seen.has(cur)) {
    const info = used?.[cur];

    if (!info || typeof info.subId !== "number") break;
    if (info.hasReentered) break;

    const reason = String(info.reason ?? "").trim();
    const isActivePinch =
      reason === "代打" || reason === "代走" || reason === "臨時代走";

    if (!isActivePinch) break;

    seen.add(cur);
    cur = info.subId;
  }

  return cur;
};

export const deriveCurrentGameState = (params: {
  battingOrder: BattingOrderEntry[];
  assignments: AssignmentsMap;
  usedPlayerInfo: UsedPlayerInfoMap;
}): CurrentGameState => {
  const { battingOrder, assignments, usedPlayerInfo } = params;

const battingOrder9: CurrentBattingSlot[] = (battingOrder ?? []).map((entry, index) => ({
  order: index + 1,
  originalId: entry.id,
  currentId: entry.id,
  reason: entry.reason,
}));

  const fieldByPos: AssignmentsMap = {};

  for (const [pos, pid] of Object.entries(assignments ?? {})) {
    if (typeof pid !== "number") {
      fieldByPos[pos] = null;
      continue;
    }

    fieldByPos[pos] = resolveCurrentPlayerId(pid, usedPlayerInfo);
  }

  const onFieldPlayerIds = Array.from(
    new Set([
      ...battingOrder9.map((x) => x.currentId),
      ...Object.values(fieldByPos).filter((x): x is number => typeof x === "number"),
    ])
  );

  return {
    battingOrder9,
    fieldByPos,
    onFieldPlayerIds,
  };
};