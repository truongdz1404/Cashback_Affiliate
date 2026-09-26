"use client";

import { useEffect, useState } from "react";

// Keeps a search box responsive while the request it drives stays rare: the
// input updates on every keystroke, the value returned here settles only once
// typing pauses. Without it, "0912345678" is ten round trips to the API and
// ten chances for an out-of-order response to win.
export function useDebounced<T>(value: T, delay = 350): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return settled;
}
