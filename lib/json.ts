export const readJson = async <T>(source: { json: () => Promise<T> }) =>
  await source.json();
