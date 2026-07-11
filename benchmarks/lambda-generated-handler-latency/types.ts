export type LambdaGeneratedHandlerPreloadMode = "all" | "hot-route-requests" | "middleware";

export interface LambdaGeneratedHandlerLatencyRow {
  coldTotalMs: number;
  entry: "buffered" | "streaming";
  effectivePreload: LambdaGeneratedHandlerPreloadMode;
  firstMs: number;
  importMs: number;
  iteration: number;
  path: string;
  preload: LambdaGeneratedHandlerPreloadMode;
  scenario: string;
  status: number;
  warmMs: number;
}
