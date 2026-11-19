# Lean verification

Install [Elan](https://lean-lang.org/install/manual/), then run the following from the repository root:

```sh
cd formal/lean
lake build
```

Elan reads `lean-toolchain` to select the pinned Lean version. Lake checks the proofs and executable examples. The **Verify Lean proofs** CI job runs the same build. This project has no external Lean libraries, and the npm build and runtime are independent of it.

## Single-node conditional branches

The model describes the single-node specialization of the compiler's `insertBranch` path. Its eligibility check requires both arms to normalize to exactly one node. Given successful renders with an attached marker, the proof shows that tracking an optional node instead of a node list preserves the current node identity and the sequence of scope-disposal, node-removal, and node-insertion operations for every finite sequence of renders and disposals.

The compiler emits `insertBranch` for conditionals whose arms cannot produce a keyed list render value. The runtime checks each rendered value and uses the single-node path when that value is an `Element`. Other values use the existing normalization, and switching between a directly returned element and a normalized node array preserves node identity.

The Lean model covers the single-node subset. Runtime tests exercise the TypeScript implementation, including mixed representations, detached markers, errors, and hydration. Run `pnpm bench:compiler-specializations` from the repository root to measure repeated branch updates in Chromium.

## Render-value normalization

The normalization proof compares concatenating each child result with accumulating nodes into a single output. It establishes that both traversals preserve node order and identity for any modeled tree. The model takes normalized leaf sequences as inputs. TypeScript tests cover DOM fragments, custom normalizers, iterator errors, and the depth limit.

## Virtual row layout

The row layout proof shows that a single scan over computed row sizes produces the same start offsets and final total as separate scans. It holds for any accumulation step, so it preserves the order of floating-point additions. The model starts with the row sizes. TypeScript tests cover how measured sizes and grid spans determine those sizes and how the resulting offsets are exposed.
