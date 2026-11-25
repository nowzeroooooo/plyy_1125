import { useCallback, useEffect, useMemo } from "react";
import type { PropsWithChildren } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useAuth } from "./auth-context";
import { isDemoMode, supabase } from "./supabase";
import type { CollectionName, CollectionRecord, Expense, RecordInput, Task, Vendor, WeddingEvent } from "../types";
import { WeddingDataContext } from "./wedding-data-context";

const emptyTasks: Task[] = [];
const emptyEvents: WeddingEvent[] = [];
const emptyExpenses: Expense[] = [];
const emptyVendors: Vendor[] = [];
const collectionNames: CollectionName[] = ["tasks", "events", "expenses", "vendors"];

function localKey(projectId: string, collection: CollectionName) {
  return `our-wedding:${projectId}:${collection}`;
}

function readDemoCollection<T>(projectId: string, collection: CollectionName): T[] {
  try {
    const stored = window.localStorage.getItem(localKey(projectId, collection));
    return stored ? JSON.parse(stored) as T[] : [];
  } catch {
    throw new Error("이 브라우저의 데모 데이터를 읽지 못했습니다. 저장 공간을 확인해 주세요.");
  }
}

async function loadCollection<T>(projectId: string, collection: CollectionName): Promise<T[]> {
  if (isDemoMode) return readDemoCollection<T>(projectId, collection);
  if (!supabase) throw new Error("Supabase 연결이 설정되지 않았습니다.");
  const { data, error } = await supabase.from(collection).select("*").eq("project_id", projectId).order("created_at", { ascending: false });
  if (error) throw error;
  return data as T[];
}

async function saveCollection(
  projectId: string,
  collection: CollectionName,
  values: RecordInput,
  id?: string,
  expectedUpdatedAt?: string
): Promise<void> {
  if (isDemoMode) {
    if (!navigator.onLine) throw new Error("인터넷 연결이 필요해요. 오프라인에서는 데이터를 수정할 수 없습니다.");
    const records = readDemoCollection<RecordInput & { id: string }>(projectId, collection);
    const record = {
      id: id ?? crypto.randomUUID(),
      project_id: projectId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...values
    };
    const next = id
      ? records.map((existing) => existing.id === id ? { ...existing, ...record, created_at: existing.created_at } : existing)
      : [record, ...records];
    window.localStorage.setItem(localKey(projectId, collection), JSON.stringify(next));
    return;
  }
  if (!supabase) throw new Error("Supabase 연결이 설정되지 않았습니다.");
  if (id) {
    let update = supabase.from(collection).update({ ...values, updated_at: new Date().toISOString() }).eq("project_id", projectId).eq("id", id);
    if (expectedUpdatedAt) update = update.eq("updated_at", expectedUpdatedAt);
    const { data, error } = await update.select("id").maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("다른 기기에서 먼저 수정했거나 항목이 삭제됐어요. 최신 내용을 불러온 뒤 다시 시도해 주세요.");
    return;
  }
  const { error } = await supabase.from(collection).insert({ ...values, project_id: projectId });
  if (error) throw error;
}

async function removeCollection(projectId: string, collection: CollectionName, id: string): Promise<void> {
  if (isDemoMode) {
    if (!navigator.onLine) throw new Error("인터넷 연결이 필요해요. 오프라인에서는 데이터를 수정할 수 없습니다.");
    const records = readDemoCollection<RecordInput & { id: string }>(projectId, collection);
    window.localStorage.setItem(localKey(projectId, collection), JSON.stringify(records.filter((record) => record.id !== id)));
    return;
  }
  if (!supabase) throw new Error("Supabase 연결이 설정되지 않았습니다.");
  const { data, error } = await supabase.from(collection).delete().eq("project_id", projectId).eq("id", id).select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("항목을 찾지 못했어요. 최신 내용을 불러온 뒤 다시 시도해 주세요.");
}

export function WeddingDataProvider({ children }: PropsWithChildren) {
  const { state } = useAuth();
  const queryClient = useQueryClient();
  const projectId = state.status === "ready" ? state.project.id : isDemoMode ? "local-demo" : "";

  const tasksQuery = useQuery({ queryKey: ["wedding", projectId, "tasks"], queryFn: () => loadCollection<Task>(projectId, "tasks"), enabled: Boolean(projectId) });
  const eventsQuery = useQuery({ queryKey: ["wedding", projectId, "events"], queryFn: () => loadCollection<WeddingEvent>(projectId, "events"), enabled: Boolean(projectId) });
  const expensesQuery = useQuery({ queryKey: ["wedding", projectId, "expenses"], queryFn: () => loadCollection<Expense>(projectId, "expenses"), enabled: Boolean(projectId) });
  const vendorsQuery = useQuery({ queryKey: ["wedding", projectId, "vendors"], queryFn: () => loadCollection<Vendor>(projectId, "vendors"), enabled: Boolean(projectId) });

  useEffect(() => {
    if (!supabase || isDemoMode || !projectId) return;
    const client = supabase;
    const channels: RealtimeChannel[] = collectionNames.map((collection) =>
      client.channel(`${collection}-${projectId}`)
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: collection,
          filter: `project_id=eq.${projectId}`
        }, () => {
          void queryClient.invalidateQueries({ queryKey: ["wedding", projectId, collection] });
        })
        .subscribe()
    );
    return () => {
      channels.forEach((channel) => { void client.removeChannel(channel); });
    };
  }, [projectId, queryClient]);

  const mutation = useMutation({
    mutationFn: ({ collection, values, id }: { collection: CollectionName; values: RecordInput; id?: string }) => {
      const current = id
        ? queryClient.getQueryData<CollectionRecord[]>(["wedding", projectId, collection])?.find((record) => record.id === id)
        : undefined;
      return saveCollection(projectId, collection, values, id, current?.updated_at);
    },
    onSuccess: (_data, variables) => queryClient.invalidateQueries({ queryKey: ["wedding", projectId, variables.collection] }),
    onError: (_error, variables) => queryClient.invalidateQueries({ queryKey: ["wedding", projectId, variables.collection] })
  });
  const deleteMutation = useMutation({
    mutationFn: ({ collection, id }: { collection: CollectionName; id: string }) => removeCollection(projectId, collection, id),
    onSuccess: (_data, variables) => queryClient.invalidateQueries({ queryKey: ["wedding", projectId, variables.collection] }),
    onError: (_error, variables) => queryClient.invalidateQueries({ queryKey: ["wedding", projectId, variables.collection] })
  });
  const saveRecord = useCallback((collection: CollectionName, values: RecordInput, id?: string) =>
    mutation.mutateAsync({ collection, values, id }), [mutation]);
  const deleteRecord = useCallback((collection: CollectionName, id: string) =>
    deleteMutation.mutateAsync({ collection, id }), [deleteMutation]);

  const errors = [tasksQuery.error, eventsQuery.error, expensesQuery.error, vendorsQuery.error]
    .filter((error): error is Error => error instanceof Error);
  const value = useMemo(() => ({
    tasks: tasksQuery.data ?? emptyTasks,
    events: eventsQuery.data ?? emptyEvents,
    expenses: expensesQuery.data ?? emptyExpenses,
    vendors: vendorsQuery.data ?? emptyVendors,
    loading: [tasksQuery, eventsQuery, expensesQuery, vendorsQuery].some((query) => query.isLoading),
    error: errors[0]?.message ?? null,
    saveRecord,
    deleteRecord
  }), [tasksQuery, eventsQuery, expensesQuery, vendorsQuery, errors, saveRecord, deleteRecord]);

  return <WeddingDataContext.Provider value={value}>{children}</WeddingDataContext.Provider>;
}
