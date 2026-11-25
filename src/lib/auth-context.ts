import { createContext, useContext } from "react";
import type { User } from "@supabase/supabase-js";
import type { Project } from "../types";

export type AuthState =
  | { status: "loading"; user: null; project: null; role: null; error: null }
  | { status: "signed-out"; user: null; project: null; role: null; error: null }
  | { status: "demo"; user: null; project: Project; role: "demo"; error: null }
  | { status: "unapproved"; user: User; project: null; role: null; error: null }
  | { status: "ready"; user: User; project: Project; role: string; error: null }
  | { status: "error"; user: User | null; project: null; role: null; error: string };

export interface AuthContextValue {
  state: AuthState;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  updateProject: (values: Partial<Project>) => Promise<void>;
  saveWeddingSettings: (values: Pick<Project, "wedding_date" | "groom_name" | "bride_name">, recalculateDeadlines: boolean) => Promise<number>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth는 AuthProvider 내부에서 사용해야 합니다.");
  return value;
}
