import { describe, expect, test } from "vitest";
import { withCleanupScope } from "@reckona/mreact-reactive-core/internal";
import { createQuery, createQueryClient } from "../src/index.js";

describe("query cleanup scope ownership", () => {
  test("disposes a query observer when its cleanup scope ends", () => {
    const disposers: Array<() => void> = [];
    const client = createQueryClient();
    let observer: ReturnType<typeof createQuery<number>> | undefined;

    withCleanupScope((dispose) => disposers.push(dispose), () => {
      observer = createQuery(client, {
        autoFetch: false,
        queryFn: async () => 1,
        queryKey: ["scoped"],
      });
    });

    expect(disposers).toHaveLength(1);
    disposers[0]?.();
    client.setQueryData(["scoped"], 2);

    expect(observer?.result.get().data).toBeUndefined();
  });
});
