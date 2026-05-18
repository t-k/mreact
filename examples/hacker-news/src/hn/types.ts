export type HnItemType = "job" | "story" | "comment" | "poll" | "pollopt";

export interface HnItem {
  by?: string;
  dead?: boolean;
  deleted?: boolean;
  descendants?: number;
  id: number;
  kids?: number[];
  parent?: number;
  parts?: number[];
  poll?: number;
  score?: number;
  text?: string;
  time?: number;
  title?: string;
  type?: HnItemType;
  url?: string;
}

export interface HnUser {
  about?: string;
  created?: number;
  delay?: number;
  id: string;
  karma?: number;
  submitted?: number[];
}
