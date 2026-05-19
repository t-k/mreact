export interface LambdaRouteLatencyRow {
  bodyBytes: number;
  iteration: number;
  path: string;
  renderPhases: Record<string, number>;
  requestDurationMs: number;
  requestPhases: Record<string, number>;
  scenario: string;
  status: number;
}
