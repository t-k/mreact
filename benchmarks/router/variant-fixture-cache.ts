export interface ClosableFixture {
  close(): Promise<void>;
}

export function createVariantFixtureCache<TKey, TFixture extends ClosableFixture>() {
  const fixtures = new Map<TKey, TFixture>();

  return {
    async getOrCreate(key: TKey, create: () => Promise<TFixture>): Promise<TFixture> {
      const cached = fixtures.get(key);
      if (cached !== undefined) {
        return cached;
      }

      const fixture = await create();
      fixtures.set(key, fixture);
      return fixture;
    },
    async closeAll(): Promise<void> {
      const values = [...fixtures.values()];
      fixtures.clear();

      await Promise.all(values.map((fixture) => fixture.close()));
    },
  };
}
