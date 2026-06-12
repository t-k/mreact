# Investigate AWS Lambda init and route first-hit regressions in Futaba admin after 0.0.156

## Status

Not started.

## Summary

Futaba admin was upgraded to mreact `0.0.156` and deployed to `futaba-admin-prod` on 2026-06-11. Production CloudWatch data shows two separate concerns:

1. Lambda `Init Duration` increased from the previous good production baseline by roughly 100-150ms.
2. The much larger regression is route first-hit latency, especially `/families/:id`, where `loaderModuleLoadMs` reached 3.2-4.9s on warm Lambda environments.

The 5-6s outliers do **not** have `Init Duration` in the Lambda REPORT lines, so they are not Lambda cold starts. They are first-hit route/module-load work after the runtime has already initialized.

## Production evidence

Application:

- App: Futaba admin
- Lambda: `futaba-admin-prod`
- Region: `ap-northeast-1`
- Runtime: `nodejs24.x`
- Memory: 1024 MB
- Current deployed package: mreact `0.0.156`
- Lambda last modified: `2026-06-11T02:26:04Z`
- Current deployed ZIP `CodeSize`: `48,859,472` bytes

CloudWatch Lambda metrics for the first active hour after deploy:

```text
Invocations: 52
Errors: 0
Duration avg: 802.259ms
Duration p50: 251.638ms
Duration p95: 5913.393ms
Duration p99: 6285.926ms
Duration max: 6382.67ms
```

REPORT logs from `2026-06-11T02:26:04Z` to `2026-06-11T08:37:01Z`:

```text
Invocations: 52
Cold starts: 4
Duration avg: 802.259ms
Duration p50: 247.56ms
Duration p95: 5858.81ms
Duration max: 6382.67ms
Init Duration avg: 811.945ms
Init Duration max: 826.06ms
```

Previous good production baseline (`admin/v0.3.26`, mreact `0.0.31`, 2026-05-20):

```text
Invocations: 9
Cold starts: 1
Duration avg: 321.71ms
Duration p50: 46.7ms
Duration p95/max: 1175.47ms
Init Duration: 700.42ms
```

The init delta is not the 5-6s regression, but the 100-150ms increase still matters for UX because admin traffic is sparse and cold/near-cold requests are user-facing.

## Slow route samples

`router:request:timing` after the 0.0.156 deploy:

```text
GET /families/019dbd8f-7b5e-7b91-b348-80c326918551 200 durationMs=6377.082 renderMs=6376.148
GET /families/019dbdcc-ba46-7fa2-b4e1-95c9d2d52ca5 200 durationMs=5918.303 renderMs=5917.353
GET /families/019dbdcb-4886-7492-9b35-c96e06ab9a61 200 durationMs=5855.979 renderMs=5853.571
GET /families/019dbdcc-ba46-7fa2-b4e1-95c9d2d52ca5 200 durationMs=4030.862 renderMs=4030.310
GET /families/019dbdcc-ba46-7fa2-b4e1-95c9d2d52ca5 200 durationMs=3640.243 renderMs=3639.724
GET /users/019dbdca-c399-75c1-bfb6-e26a4c556e7d 200 durationMs=1872.233 renderMs=1819.024
GET /users/019e0cd7-5d2f-70c2-807c-b2ee1e08fccd 200 durationMs=1719.745 renderMs=1659.954
```

`router:render:timing` for the slow `/families/:id` requests:

```text
/families/... loaderModuleLoadMs=4899.382 loaderExecutionMs=332.158 loaderWaitMs=5228.086 pageModuleLoadMs=216.966 metadataMs=395.407
/families/... loaderModuleLoadMs=4883.238 loaderExecutionMs=306.919 loaderWaitMs=5186.910 pageModuleLoadMs=217.240 metadataMs=13.812
/families/... loaderModuleLoadMs=4838.676 loaderExecutionMs=337.146 loaderWaitMs=5164.034 pageModuleLoadMs=202.587 metadataMs=5.959
/families/... loaderModuleLoadMs=3299.644 loaderExecutionMs=66.143 loaderWaitMs=3365.366 pageModuleLoadMs=459.465 metadataMs=0.048
/families/... loaderModuleLoadMs=3219.283 loaderExecutionMs=65.695 loaderWaitMs=3284.632 pageModuleLoadMs=187.079 metadataMs=0.040
```

Direct Lambda invoke probe on a fresh 0.0.156 environment:

```text
cold /healthz:
  request durationMs=694.310
  REPORT Duration=755.59ms
  Init Duration=845.91ms

warm /healthz:
  durationMs=2.168, 1.742

first warm /:
  durationMs=512.191
  loaderModuleLoadMs=492.041

subsequent /:
  durationMs=1.644, 1.505

first warm /login:
  durationMs=259.227

subsequent /login:
  durationMs=2.619, 2.692
```

## Uploaded/current Lambda build artifact evidence

The current uploaded Lambda ZIP was downloaded from `aws lambda get-function --function-name futaba-admin-prod`.

Summary:

```text
zip_bytes=48859472
unzipped_file_bytes=138162966
file_count=7093
.mreact/server bytes=9523876 files=54
.mreact/client bytes=29680 files=3
node_modules bytes=128482548 files=7030
server_module_json_count=21
.mreact/server/manifest.json=167400
.mreact/server/import-policy.json=1477
.mreact/server/mreact-handler.mjs=5601
.mreact/server/server-action-authz.mjs=13988
```

Largest current `.mreact/server` files:

```text
1514028 .mreact/server/server-modules/code/e50de058f1264963.mjs
1454733 .mreact/server/server-modules/code/75795a4046406d85.mjs
1437818 .mreact/server/server-modules/code/fb514acc281f6fe0.mjs
1430878 .mreact/server/server-modules/code/dd8ba3d7e00cf4af.mjs
1423290 .mreact/server/server-modules/code/25f7c4c0c12fdafb.mjs
882107  .mreact/server/server-modules/code/3d2f32105f57e82b.mjs
```

Current route artifact mapping for `/families/:id`:

```json
{
  "serverModuleRequestFiles": {
    "src/app/families/$id/page.tsx": "server-modules/request/b2a0de5000783c08.json"
  },
  "serverModuleRenderFiles": {
    "src/app/families/$id/page.tsx": "server-modules/render/530be4b74f361ff2.json"
  },
  "routeServerActionReferences": {
    "src/app/families/$id/page.tsx": [
      {
        "moduleId": "families/$id/billing-actions.ts",
        "exportName": "grantFamilyBillingOverrideAction",
        "inferred": true
      },
      {
        "moduleId": "families/$id/billing-actions.ts",
        "exportName": "revokeFamilyBillingOverrideAction",
        "inferred": true
      }
    ]
  }
}
```

Current `/families/:id` artifact summary:

```text
families_detail_request b2a0de5000783c08.json json_bytes=11336 route_code_bytes=10372
  moduleFile=server-modules/code/ed79f26e03577597.mjs bytes=22585
  moduleFile=server-modules/code/1ed568e581bb77b8.mjs bytes=2297

families_detail_render 530be4b74f361ff2.json json_bytes=17197
  moduleFile=server-modules/code/75795a4046406d85.mjs bytes=1454733
```

The current request loader module is small but imports runtime packages directly:

```ts
import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { AsyncLocalStorage } from "node:async_hooks";
import { z } from "zod";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { parse } from "cookie";
import { jwtVerify } from "jose";
```

The current render module for `/families/:id` is 1.45MB and also pulls heavy DB/auth/action-related code. This appears to be caused by inferred form server action references on the page:

```ts
import { createRequire } from "node:module";
import crypto$1, { createHash, createHmac } from "crypto";
import { join, sep } from "path";
import { Readable } from "stream";
import { AsyncLocalStorage } from "node:async_hooks";
import { Buffer as Buffer$1 } from "buffer";
import { Readable as Readable$1, Writable } from "node:stream";
import { Agent, request } from "node:https";
import { homedir } from "os";
import { readFile } from "fs/promises";
...
```

## Previous good build artifact comparison

AWS Lambda only has `$LATEST`; old uploaded ZIPs are not retained. To compare artifacts, I rebuilt the Futaba admin `admin/v0.3.26` tag locally. That tag uses mreact `0.0.31` and the old `mreact-router build --target node` flow.

Local rebuilt `admin/v0.3.26` summary:

```text
mreact_file_bytes=23565254
mreact_file_count=62
mreact_server_file_bytes=23563969
mreact_server_file_count=60
mreact_client_file_bytes=1285
mreact_client_file_count=2
server_module_json_count=24
.mreact/server/manifest.json=196874
.mreact/server/import-policy.json=1965
.mreact/server/mreact-handler.mjs=2628
```

Important structural difference: `0.0.31` had billing override actions as separate API route handlers, not inferred form actions on the page.

```json
{
  "serverModuleFiles": {
    "src/app/api/families/$id/billing-override/grant/route.ts": "server-modules/55cc8acd241db466.json",
    "src/app/api/families/$id/billing-override/revoke/route.ts": "server-modules/a6ffb22c9461fddf.json"
  },
  "routeServerActionReferences": null
}
```

Previous `/families/:id` artifact summary:

```text
families_detail_request e0d73c38e4c727ed.json json_bytes=11784 route_code_bytes=10833
  moduleFile=server-modules/code/d8b7ae15e8b6565a.mjs bytes=1462162
  moduleFile=server-modules/code/f8ed582c2c3f04a1.mjs bytes=256810

families_detail_render 0eb017c792f425ba.json json_bytes=16538
  moduleFile=server-modules/code/438aaeaf78df616a.mjs bytes=275108
```

The old request module was larger because it bundled dependencies, but production timing for `0.0.31` showed first route module load around 146-156ms:

```text
Cold /:
  durationMs=1124.519
  Init Duration=700.42
  loaderModuleLoadMs=155.943

First /users on same Lambda:
  durationMs=612.680
  loaderModuleLoadMs=146.195

First user detail on same Lambda:
  durationMs=522.284
  loaderModuleLoadMs=148.754

Second same-route hits:
  loaderModuleLoadMs=0.061-0.098
```

## Working hypotheses

Ranked by current evidence:

1. **AWS Lambda target/runtime package externalization regressed first-hit module load.** Current request loader artifacts import `kysely`, `pg`, `@aws-sdk/client-secrets-manager`, `jose`, etc. from deployed `node_modules`, while the older good build bundled similar code into route module artifacts. The current uploaded ZIP has 7,030 `node_modules` files and 128MB of unzipped `node_modules`, so first-hit package resolution/evaluation in Lambda may dominate.
2. **Inferred server actions leak heavy action dependencies into GET render artifacts.** The current `/families/:id` page has inferred actions from `families/$id/billing-actions.ts`; the previous baseline had separate API routes and no `routeServerActionReferences`. The current render artifact is 1.45MB and imports DB/auth/action-heavy code even on a GET render.
3. **Fast paths still load too much on cold requests.** A direct cold `/healthz` request had `request durationMs=694.310` plus `Init Duration=845.91ms`. `/healthz` should be a near-pure route handler and should not require page/render artifacts or broad route preload.

## Likely related code

- `packages/router/src/build.ts`
  - `externalizeServerModuleArtifactCode`
  - `externalizeServerModuleOutputCode`
  - `rewritePortableRuntimePackageImports`
  - `externalizePackageImportsPlugin`
  - AWS Lambda target generation and packaging
- `packages/router/src/serve.ts`
  - `serverModuleRequestFiles`
  - `serverModuleRenderFiles`
  - `routeServerActionReferences`
- `packages/router/src/actions.ts`
  - inferred server action registry and route action references

## Expected behavior

- Lambda `Init Duration` should not regress materially across mreact upgrades for the same app and runtime. A 100-150ms increase is user-visible for sparse admin traffic.
- Request/control-only paths such as `/healthz`, redirects, middleware-only responses, and loader redirects should avoid render/page/action artifacts.
- First route hit should not pay multi-second runtime package resolution/evaluation. If Lambda deploys need runtime packages, mreact should either:
  - keep a fast bundled request-path artifact for loader/auth/control code,
  - provide a generated/preloaded handler strategy that moves this cost into init intentionally and predictably,
  - or split action/render dependencies so GET route first hits do not import mutation/action graphs.
- Inferred server actions should not force GET render artifacts to import heavy server action implementation dependencies unless the action is invoked.

## Suggested validation

Add or extend focused Lambda/build tests:

1. Build an app with a page loader importing DB-like runtime packages and assert the AWS Lambda request artifact shape does not require loading large external package graphs on first route hit, or provide a benchmark that catches the regression.
2. Build a page with inferred form server actions whose action module imports heavy server-only packages. Assert GET render artifacts do not import/evaluate the action implementation graph.
3. Add a Lambda benchmark scenario for:
   - cold `/healthz`
   - first unauthenticated `/` redirect
   - first authenticated route
   - first detail route after another route is warm
   - warm same-route hit
4. Keep reporting `Init Duration`, request duration, `loaderModuleLoadMs`, `pageModuleLoadMs`, and warm same-route hit separately.

## Local evidence paths

Raw investigation files are in the Futaba working copy:

```text
/home/tk/work/reckona/futaba/docs.local/logs/2026-06-11/2026-06-11-001-admin-mreact-156-lambda-performance-check.md
/home/tk/work/reckona/futaba/docs.local/logs/2026-06-11/admin-lambda-artifacts-current/
/home/tk/work/reckona/futaba/docs.local/logs/2026-06-11/admin-lambda-artifacts-fast-baseline/
```

The current uploaded Lambda ZIP is saved locally at:

```text
/home/tk/work/reckona/futaba/docs.local/logs/2026-06-11/admin-lambda-artifacts-current/futaba-admin-prod-current.zip
```
