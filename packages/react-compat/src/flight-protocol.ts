export const reactFlightBinaryRowTags = [
  "A",
  "O",
  "o",
  "U",
  "S",
  "s",
  "L",
  "l",
  "G",
  "g",
  "M",
  "m",
  "V",
] as const;

export const reactFlightRowTags = [
  "C",
  "D",
  "E",
  "F",
  "H",
  "I",
  "J",
  "N",
  "P",
  "R",
  "T",
  "W",
  "X",
  "x",
  "r",
] as const;

export const reactFlightModelTokens = [
  "$",
  "$$",
  "$@",
  "$D",
  "$E",
  "$F",
  "$I",
  "$K",
  "$L",
  "$N",
  "$Q",
  "$S",
  "$W",
  "$Y",
  "$Z",
  "$i",
  "$n",
  "$u",
  "$undefined",
] as const;

export type ReactFlightBinaryRowTag = (typeof reactFlightBinaryRowTags)[number];

export interface ReactFlightProtocolCoverage {
  binaryRowTags: string[];
  modelTokens: string[];
  rowTags: string[];
}

export function getReactFlightProtocolCoverage(): ReactFlightProtocolCoverage {
  return {
    binaryRowTags: [...reactFlightBinaryRowTags],
    modelTokens: [...reactFlightModelTokens],
    rowTags: [...reactFlightRowTags],
  };
}
