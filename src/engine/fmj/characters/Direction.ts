// Port of fmj/characters/Direction.kt
export enum Direction {
  North = 1,
  East = 2,
  South = 3,
  West = 4,
}

export function directionFromInt(v: number): Direction {
  if (v >= 1 && v <= 4) return v as Direction;
  console.warn("Direction.fromInt invalid v=" + v);
  return Direction.North;
}
