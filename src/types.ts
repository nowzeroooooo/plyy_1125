export type Assignee = "신랑" | "신부" | "함께";

export interface Project {
  id: string;
  name: string;
  wedding_date: string;
  budget_target: number;
  groom_name: string;
  bride_name: string;
}

export interface Task {
  id: string;
  project_id: string;
  title: string;
  category: string;
  due_date: string | null;
  assignee: Assignee;
  priority: "낮음" | "보통" | "높음";
  notes: string;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface WeddingEvent {
  id: string;
  project_id: string;
  title: string;
  starts_at: string;
  location: string;
  category: string;
  attendees: string;
  assignee: Assignee;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface Expense {
  id: string;
  project_id: string;
  category: string;
  title: string;
  estimate_amount: number;
  contracted_amount: number;
  paid_amount: number;
  due_date: string | null;
  paid_on: string | null;
  payer: Assignee;
  created_at: string;
  updated_at: string;
}

export interface Vendor {
  id: string;
  project_id: string;
  name: string;
  category: string;
  status: string;
  estimate_amount: number;
  contracted_amount: number;
  contact: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export type CollectionName = "tasks" | "events" | "expenses" | "vendors";
export type CollectionRecord = Task | WeddingEvent | Expense | Vendor;
export type RecordInput = Record<string, string | number | boolean | null>;

export interface WeddingData {
  tasks: Task[];
  events: WeddingEvent[];
  expenses: Expense[];
  vendors: Vendor[];
  loading: boolean;
  error: string | null;
  saveRecord: (collection: CollectionName, values: RecordInput, id?: string) => Promise<void>;
  deleteRecord: (collection: CollectionName, id: string) => Promise<void>;
}
