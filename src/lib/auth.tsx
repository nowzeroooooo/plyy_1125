import { useCallback, useEffect, useMemo, useState } from "react";
import type { PropsWithChildren } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase, supabaseConfigError } from "./supabase";
import type { Project } from "../types";
import { AuthContext } from "./auth-context";
import type { AuthState } from "./auth-context";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ status: "loading", user: null, project: null, role: null, error: null });
  const [session, setSession] = useState<Session | null>(null);

  const loadMembership = useCallback(async (user: User | null) => {
    if (!user || !supabase) {
      setState({ status: "signed-out", user: null, project: null, role: null, error: null });
      return;
    }

    try {
      let memberQuery = supabase
        .from("project_members")
        .select("project_id, role, display_name")
        .eq("user_id", user.id);
      const configuredProjectId = import.meta.env.VITE_WEDDING_PROJECT_ID?.trim();
      if (configuredProjectId) memberQuery = memberQuery.eq("project_id", configuredProjectId);
      const { data: member, error: memberError } = await memberQuery.maybeSingle();
      if (memberError) throw memberError;
      if (!member) {
        setState({ status: "unapproved", user, project: null, role: null, error: null });
        return;
      }

      const { data: project, error: projectError } = await supabase
        .from("wedding_projects")
        .select("id, name, wedding_date, budget_target, groom_name, bride_name")
        .eq("id", member.project_id)
        .single();
      if (projectError) throw projectError;
      const { error: defaultsError } = await supabase.rpc("initialize_wedding_defaults", { target_project: member.project_id });
      if (defaultsError) throw defaultsError;
      setState({
        status: "ready",
        user,
        role: member.role,
        project: {
          ...project,
          budget_target: Number(project.budget_target)
        },
        error: null
      });

      if (window.location.search) {
        window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.hash}`);
      }
    } catch (error) {
      setState({ status: "error", user, project: null, role: null, error: errorMessage(error) });
    }
  }, []);

  useEffect(() => {
    if (supabaseConfigError) {
      setState({ status: "error", user: null, project: null, role: null, error: supabaseConfigError });
      return;
    }
    if (!supabase) {
      try {
        const savedProject = window.localStorage.getItem("our-wedding-project");
        const project = savedProject ? JSON.parse(savedProject) as Project : {
          id: "local-demo",
          name: "Our Wedding",
          wedding_date: "2027-09-05",
          budget_target: 0,
          groom_name: "신랑",
          bride_name: "신부"
        };
        setState({ status: "demo", user: null, project, role: "demo", error: null });
      } catch {
        setState({
          status: "error",
          user: null,
          project: null,
          role: null,
          error: "이 브라우저의 데모 설정을 읽지 못했습니다. 저장 공간을 확인해 주세요."
        });
      }
      return;
    }
    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        setState({ status: "error", user: null, project: null, role: null, error: error.message });
        return;
      }
      setSession(data.session);
    }).catch((error: unknown) => {
      setState({ status: "error", user: null, project: null, role: null, error: errorMessage(error) });
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!nextSession) queryClient.clear();
      setSession(nextSession);
    });
    return () => authListener.subscription.unsubscribe();
  }, [queryClient]);

  useEffect(() => {
    if (supabase) void loadMembership(session?.user ?? null);
  }, [loadMembership, session]);

  const signIn = useCallback(async () => {
    if (!supabase) throw new Error("로그인을 위해 Supabase 설정이 필요합니다.");
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo }
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  const updateProject = useCallback(async (values: Partial<Project>) => {
    if (state.status !== "ready" && state.status !== "demo") throw new Error("프로젝트에 접근할 수 없습니다.");
    if (state.status === "ready" && supabase) {
      const { error } = await supabase.from("wedding_projects").update(values).eq("id", state.project.id);
      if (error) throw error;
    } else if (state.status === "demo") {
      if (!navigator.onLine) throw new Error("인터넷 연결이 필요해요. 오프라인에서는 데이터를 수정할 수 없습니다.");
      window.localStorage.setItem("our-wedding-project", JSON.stringify({ ...state.project, ...values }));
    }
    setState({ ...state, project: { ...state.project, ...values } });
  }, [state]);

  const saveWeddingSettings = useCallback(async (
    values: Pick<Project, "wedding_date" | "groom_name" | "bride_name">,
    recalculateDeadlines: boolean
  ) => {
    if (state.status !== "ready" && state.status !== "demo") throw new Error("프로젝트에 접근할 수 없습니다.");
    let updatedTasks = 0;
    if (state.status === "ready" && supabase) {
      const { data, error } = await supabase.rpc("save_wedding_settings", {
        target_project: state.project.id,
        target_wedding_date: values.wedding_date,
        target_groom_name: values.groom_name,
        target_bride_name: values.bride_name,
        recalculate_deadlines: recalculateDeadlines
      });
      if (error) throw error;
      updatedTasks = data ?? 0;
    } else if (state.status === "demo") {
      if (!navigator.onLine) throw new Error("인터넷 연결이 필요해요. 오프라인에서는 데이터를 수정할 수 없습니다.");
      window.localStorage.setItem("our-wedding-project", JSON.stringify({ ...state.project, ...values }));
    }
    setState({ ...state, project: { ...state.project, ...values } });
    return updatedTasks;
  }, [state]);

  const value = useMemo(() => ({ state, signIn, signOut, updateProject, saveWeddingSettings }), [state, signIn, signOut, updateProject, saveWeddingSettings]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
