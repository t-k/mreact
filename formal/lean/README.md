# Lean verification

Install [Elan](https://lean-lang.org/install/manual/), then run the following from the repository root:

```sh
cd formal/lean
lake build
```

Elan reads `lean-toolchain` to select the pinned Lean version. Lake checks the proofs and executable examples. The **Verify Lean proofs** CI job runs the same build. This project has no external Lean libraries, and the npm build and runtime are independent of it.

## Single-node conditional branches

The model describes a candidate for specializing the compiler's `insertBranch` path. Its eligibility check requires both arms to normalize to exactly one node. Given successful renders with an attached marker, the proof shows that tracking an optional node instead of a node list preserves the current node identity and the sequence of scope-disposal, node-removal, and node-insertion operations for every finite sequence of renders and disposals.

The model takes normalized nodes and scopes as inputs. Applying the proof to emitted JavaScript requires validating that the compiler can establish the singleton precondition and that the DOM implementation matches the model. Render and cleanup errors, detached markers, hydration, and reactive scheduling are outside the model. The candidate has no production emitter or runtime implementation yet, so the proof establishes no browser performance result.
