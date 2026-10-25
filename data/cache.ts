import { mkdir } from "node:fs/promises";

import { readJson } from "@/lib/json";

export const MONTH =
  process.env.DETOUR_MONTH ?? new Date().toISOString().slice(0, 7);

export const CACHE = `${import.meta.dir}/.cache/${MONTH}`;

export const cached = async <T>(
  name: string,
  make: () => Promise<T>
): Promise<T> => {
  await mkdir(CACHE, { recursive: true });
  const file = Bun.file(`${CACHE}/${name}.json`);

  if (await file.exists()) {
    return await readJson<T>(file);
  }

  const value = await make();
  await Bun.write(file, JSON.stringify(value));

  return value;
};
