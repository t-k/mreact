export interface ClosableFixture {
  close(): Promise<void>;
}

export function createVariantFixtureCache<TKey, TFixture extends ClosableFixture>() {
  const fixtures = new Map<TKey, TFixture>();
  const pendingFixtures = new Map<TKey, Promise<TFixture>>();

  return {
    async getOrCreate(key: TKey, create: () => Promise<TFixture>): Promise<TFixture> {
      const cached = fixtures.get(key);
      if (cached !== undefined) {
        return cached;
      }

      const pending = pendingFixtures.get(key);
      if (pending !== undefined) {
        return pending;
      }

      const created = create()
        .then((fixture) => {
          fixtures.set(key, fixture);
          return fixture;
        })
        .finally(() => {
          pendingFixtures.delete(key);
        });
      pendingFixtures.set(key, created);
      const fixture = await created;

      fixtures.set(key, fixture);
      return fixture;
    },
    async closeAll(): Promise<void> {
      const pendingValues = await Promise.allSettled(pendingFixtures.values());
      const values = [...fixtures.values()];
      for (const result of pendingValues) {
        if (result.status === "fulfilled" && !values.includes(result.value)) {
          values.push(result.value);
        }
      }
      pendingFixtures.clear();
      fixtures.clear();

      await Promise.all(values.map((fixture) => fixture.close()));
    },
  };
}
