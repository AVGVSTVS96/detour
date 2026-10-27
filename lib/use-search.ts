"use client";

import { useMemo, useState } from "react";

import type { Point } from "@/lib/geo";
import { hitsFor, loadDirectory } from "@/lib/search";
import type { Directory } from "@/lib/search";
import { loadIndex } from "@/lib/use-roads";

export const useSearch = (near: Point | null) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [directory, setDirectory] = useState<Directory | null>(null);

  const hits = useMemo(
    () => (directory ? hitsFor(directory, query, near) : []),
    [directory, query, near]
  );

  const load = async () => {
    const { build } = await loadIndex();
    setDirectory(await loadDirectory(build));
  };

  return {
    close: () => {
      setOpen(false);
      setQuery("");
    },
    hits,
    open,
    query,
    ready: directory !== null,
    setQuery,
    start: () => {
      setOpen(true);
      load().catch(() => null);
    },
  };
};
