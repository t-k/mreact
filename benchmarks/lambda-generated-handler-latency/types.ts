export type LambdaGeneratedHandlerPreloadMode = "all" | "hot-route-requests" | "middleware";

export interface LambdaGeneratedHandlerLatencyRow {
  coldTotalMs: number;
  entry: "buffered" | "streaming";
  firstMs: number;
  importMs: number;
  iteration: number;
  path: string;
  preload: LambdaGeneratedHandlerPreloadMode;
  scenario: string;
  status: number;
  warmMs: number;
}
