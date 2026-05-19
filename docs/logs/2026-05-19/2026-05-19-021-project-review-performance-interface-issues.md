# プロジェクトレビューと open issue 記録

## 背景

プロジェクト全体をレビューし、性能改善、Cold Start、初回 Route Hit、I/F 改善、機能提案の観点で追加課題を整理した。

## 実施内容

- 既存の `docs/issues/open` と `docs/issues/resolved` を確認し、Lambda 初回ヒット関連の解決済み課題と重複しないようにした。
- ルーター性能、公開 API、パッケージ品質を分けて確認した。
- 新規 open issue を英語で追加した。
- `docs/issues/open/PRIORITY.md` を現在の open issue に合わせて更新した。

## 追加した issue

- `docs/issues/open/2026-05-19-009-router-cold-start-benchmark-missing.md`
- `docs/issues/open/2026-05-19-010-streaming-first-byte-latency-gap.md`
- `docs/issues/open/2026-05-19-011-lambda-preload-strategy-is-all-or-nothing.md`
- `docs/issues/open/2026-05-19-012-router-runtime-cache-observability-and-sizing.md`
- `docs/issues/open/2026-05-19-013-client-bundle-size-budget-coverage-gaps.md`
- `docs/issues/open/2026-05-19-014-form-field-binding-and-validation-state-dx.md`
- `docs/issues/open/2026-05-19-015-query-mutation-lifecycle-and-error-typing.md`
- `docs/issues/open/2026-05-19-016-native-package-release-safety-gaps.md`

## メモ

特に優先度が高いのは、Lambda preload 戦略の粒度不足、native package の release safety、cold-start benchmark の未実装、streaming first-byte latency の gap。
