import { createContext, useContext } from "react";
import type { WeddingData } from "../types";

export const WeddingDataContext = createContext<WeddingData | null>(null);

export function useWeddingData() {
  const value = useContext(WeddingDataContext);
  if (!value) throw new Error("useWeddingData는 WeddingDataProvider 내부에서 사용해야 합니다.");
  return value;
}
