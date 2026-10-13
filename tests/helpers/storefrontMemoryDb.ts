/** Isolated in-memory Firestore adapter for storefront tests and local visual QA only. */
export function storefrontMemoryDb(seed: Record<string, Record<string, any>>) {
  const data = new Map<string, any>();
  Object.entries(seed).forEach(([collection, rows]) => Object.entries(rows).forEach(([id, row]) => data.set(`${collection}/${id}`, structuredClone(row))));
  const snapshot = (col: string, id: string) => ({ id, exists: data.has(`${col}/${id}`), data: () => data.has(`${col}/${id}`) ? structuredClone(data.get(`${col}/${id}`)) : undefined });
  const ref = (col: string, id: string) => ({ col, id, get: async () => snapshot(col, id) });
  let reads = 0;
  const query = (col: string, filters: any[] = [], after = '', limit = Infinity): any => ({
    where: (key: string, op: string, value: any) => query(col, [...filters, [key, op, value]], after, limit),
    orderBy: () => query(col, filters, after, limit),
    startAfter: (id: string) => query(col, filters, id, limit),
    limit: (count: number) => query(col, filters, after, count),
    get: async () => {
      reads++;
      const docs = [...data.keys()].filter(key => key.startsWith(`${col}/`)).map(key => snapshot(col, key.slice(col.length + 1)))
        .filter(doc => doc.id > after && filters.every(([key, op, value]) => op === 'in' ? value.includes(doc.data()?.[key]) : doc.data()?.[key] === value))
        .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).slice(0, limit);
      return { docs, size: docs.length, empty: !docs.length };
    },
    doc: (id: string) => ref(col, id)
  });
  let chain: Promise<any> = Promise.resolve();
  const db: any = {
    collection: (col: string) => query(col),
    runTransaction: (callback: any) => {
      const run = chain.then(async () => {
        const writes: (() => void)[] = [];
        const result = await callback({
          get: (target: any) => target.get(),
          set: (target: any, value: any) => writes.push(() => data.set(`${target.col}/${target.id}`, structuredClone(value))),
          update: (target: any, value: any) => writes.push(() => data.set(`${target.col}/${target.id}`, { ...data.get(`${target.col}/${target.id}`), ...structuredClone(value) }))
        });
        writes.forEach(write => write());
        return result;
      });
      chain = run.catch(() => {});
      return run;
    }
  };
  return { db, get: (collection: string, id: string) => snapshot(collection, id).data(), set: (collection: string, id: string, row: any) => data.set(`${collection}/${id}`, structuredClone(row)), rows: (collection: string) => [...data.entries()].filter(([key]) => key.startsWith(`${collection}/`)).map(([, value]) => value), readCount: () => reads };
}
