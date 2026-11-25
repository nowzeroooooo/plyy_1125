import { createContext, lazy, Suspense, useContext, useEffect, useState } from "react";
import type { FormEvent, PropsWithChildren, ReactNode } from "react";
import { HashRouter, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useRegisterSW } from "virtual:pwa-register/react";
import {
  ArrowDownRight, ArrowRight, Bell, CalendarDays, Check, CheckCircle2, ChevronRight,
  Circle, ClipboardCheck, CloudOff, Download, Heart, House, Image, LogOut, Menu,
  Plus, Settings, ShieldCheck, Sparkles, Store, Wallet, X
} from "lucide-react";
import { useAuth } from "./lib/auth-context";
import { WeddingDataProvider } from "./lib/wedding-data";
import { useWeddingData } from "./lib/wedding-data-context";
import { isDemoMode } from "./lib/supabase";
import { formatWon, getBudgetSummary } from "./utils/finance";
import type { Assignee, CollectionName, Task } from "./types";

const CategorySpendingChart = lazy(() => import("./components/CategorySpendingChart"));
type Toast = { message: string; tone: "success" | "error" };
const ToastContext = createContext<(message: string, tone?: Toast["tone"]) => void>(() => undefined);
const navItems = [
  { to: "/", label: "홈", icon: House, end: true },
  { to: "/schedule", label: "일정", icon: CalendarDays },
  { to: "/budget", label: "예산", icon: Wallet },
  { to: "/vendors", label: "업체", icon: Store },
  { to: "/more", label: "더보기", icon: Menu }
];
const categories = ["웨딩홀", "식대", "스튜디오", "드레스", "메이크업", "웨딩 플래너", "예복", "예물", "본식 스냅", "본식 영상", "청첩장", "혼주 의상", "혼주 메이크업", "신혼여행", "기타", "예비비"];
const vendorCategories = ["웨딩홀", "웨딩 플래너", "스튜디오", "드레스", "메이크업", "예복", "예물", "본식 스냅", "본식 영상", "혼주 의상", "기타"];
const assignees: Assignee[] = ["함께", "신랑", "신부"];

function useToast() {
  return useContext(ToastContext);
}

function ToastProvider({ children }: PropsWithChildren) {
  const [toast, setToast] = useState<Toast | null>(null);
  const notify = (message: string, tone: Toast["tone"] = "success") => setToast({ message, tone });
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  return (
    <ToastContext.Provider value={notify}>
      {children}
      {toast && (
        <div role="status" className={`fixed left-4 right-4 z-[80] mx-auto flex max-w-md items-center gap-2 rounded-2xl px-4 py-3 text-sm text-white shadow-lg ${toast.tone === "error" ? "bg-[#b95858]" : "bg-[#343a32]"}`} style={{ bottom: "calc(90px + env(safe-area-inset-bottom))" }}>
          {toast.tone === "success" ? <Check size={17} /> : <X size={17} />}{toast.message}
        </div>
      )}
    </ToastContext.Provider>
  );
}

function dateLabel(date: string, options: Intl.DateTimeFormatOptions = { year: "numeric", month: "long", day: "numeric", weekday: "short" }) {
  return new Intl.DateTimeFormat("ko-KR", { ...options, timeZone: "Asia/Seoul" }).format(new Date(`${date.slice(0, 10)}T00:00:00+09:00`));
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short", hour: "numeric", minute: "2-digit"
  }).format(new Date(value));
}

function downloadFile(filename: string, content: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportCalendar(events: ReturnType<typeof useWeddingData>["events"]) {
  const escape = (value: string) => value.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  const lines = events.flatMap((event) => [
    "BEGIN:VEVENT",
    `UID:${event.id}@our-wedding.local`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
    `DTSTART:${new Date(event.starts_at).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
    `SUMMARY:${escape(event.title)}`,
    ...(event.location ? [`LOCATION:${escape(event.location)}`] : []),
    `CATEGORIES:${escape(event.category)}`,
    "END:VEVENT"
  ]);
  downloadFile("our-wedding.ics", ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Our Wedding//KO", ...lines, "END:VCALENDAR", ""].join("\r\n"), "text/calendar;charset=utf-8");
}

function daysUntil(date: string) {
  const wedding = new Date(`${date}T00:00:00+09:00`);
  const today = new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date()) + "T00:00:00+09:00");
  return Math.ceil((wedding.getTime() - today.getTime()) / 86_400_000);
}

function PageTitle({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-3">
      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[.2em] text-[#858a80]">{eyebrow}</p>
        <h1 className="serif text-[32px] leading-tight text-[#343a32] md:text-[38px]">{title}</h1>
        {description && <p className="mt-2 text-sm leading-6 text-[#858a80]">{description}</p>}
      </div>
      {action}
    </div>
  );
}

function EmptyState({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center px-5 py-12 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#f3f4ee] text-[#829472]">{icon}</div>
      <h3 className="font-semibold text-[#4c5349]">{title}</h3>
      <p className="mt-2 max-w-xs text-sm leading-6 text-[#858a80]">{description}</p>
    </div>
  );
}

function AuthGate() {
  const { state, signIn, signOut } = useAuth();
  const notify = useToast();
  const location = useLocation();

  if (state.status === "loading") return <div className="grid min-h-screen place-items-center text-sm text-[#858a80]">Our Wedding을 준비하고 있어요…</div>;
  if (state.status === "signed-out") {
    return (
      <main className="grid min-h-screen place-items-center px-5 py-10">
        <section className="panel w-full max-w-md p-8 text-center">
          <img className="mx-auto mb-5 h-16 w-16" src={`${import.meta.env.BASE_URL}icons/wedding-rings.svg`} alt="" />
          <p className="serif text-3xl">Our Wedding</p>
          <h1 className="mt-3 text-lg font-semibold">우리의 결혼 준비를 함께</h1>
          <p className="mt-2 text-sm leading-6 text-[#858a80]">승인된 두 사람만 접근할 수 있는 공동 웨딩 플래너예요.</p>
          {!isDemoMode ? (
            <button className="primary-button mt-7 w-full" onClick={() => void signIn().catch((error: unknown) => notify(error instanceof Error ? error.message : "Google 로그인에 실패했습니다.", "error"))}>
              Google 계정으로 로그인
            </button>
          ) : <p className="mt-6 rounded-xl bg-[#f6f5f0] p-3 text-xs leading-5 text-[#858a80]">현재 브라우저 전용 데모 모드예요. Supabase 환경 변수를 설정하면 실제 계정 로그인을 사용할 수 있어요.</p>}
          <p className="mt-5 text-xs text-[#a0a399]">Asia/Seoul · 대한민국 원화</p>
        </section>
      </main>
    );
  }
  if (state.status === "unapproved") {
    return (
      <main className="grid min-h-screen place-items-center px-5">
        <section className="panel max-w-md p-8 text-center">
          <ShieldCheck className="mx-auto mb-4 text-[#829472]" size={34} />
          <h1 className="text-xl font-semibold">아직 초대되지 않은 계정이에요</h1>
          <p className="mt-3 text-sm leading-6 text-[#858a80]">프로젝트 관리자가 이 Google 계정을 승인하면 사용할 수 있어요.</p>
          <button className="ghost-button mt-6" onClick={() => void signOut()}><LogOut size={16} /> 로그아웃</button>
        </section>
      </main>
    );
  }
  if (state.status === "error") {
    return (
      <main className="grid min-h-screen place-items-center px-5">
        <section className="panel max-w-md p-8 text-center">
          <p className="font-semibold text-[#b95858]">연결 중 문제가 발생했어요</p>
          <p className="mt-3 text-sm leading-6 text-[#858a80]">{state.error}</p>
          <button className="ghost-button mt-6" onClick={() => window.location.reload()}>다시 시도</button>
        </section>
      </main>
    );
  }
  return (
    <WeddingDataGate key={state.status === "ready" ? state.project.id : "local-demo"}>
      <AppShell locationKey={location.pathname} />
    </WeddingDataGate>
  );
}

function WeddingDataGate({ children }: PropsWithChildren) {
  const { state } = useAuth();
  const projectReady = state.status === "ready" || state.status === "demo";
  return projectReady ? <WeddingDataProvider>{children}</WeddingDataProvider> : null;
}

function AppShell({ locationKey }: { locationKey: string }) {
  const { state, signOut } = useAuth();
  const queryClient = useQueryClient();
  const [online, setOnline] = useState(navigator.onLine);
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();
  const notify = useToast();

  useEffect(() => {
    const setStatus = () => setOnline(navigator.onLine);
    window.addEventListener("online", setStatus);
    window.addEventListener("offline", setStatus);
    return () => {
      window.removeEventListener("online", setStatus);
      window.removeEventListener("offline", setStatus);
    };
  }, []);

  const title = navItems.find((item) => item.to === locationKey)?.label
    ?? (locationKey.startsWith("/checklist") ? "체크리스트" : locationKey.startsWith("/settings") ? "설정" : "더보기");
  return (
    <div className="min-h-screen bg-[#f8f6f0]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] border-r border-[#e9e8e0] bg-[#fbfaf6] px-5 py-7 md:flex md:flex-col">
        <Brand />
        <div className="my-8 rounded-2xl bg-[#f1f1e9] p-4">
          <p className="text-[11px] tracking-wide text-[#858a80]">우리의 결혼식</p>
          <p className="mt-1 text-sm font-medium">{state.status === "ready" || state.status === "demo" ? state.project.groom_name : "신랑"} & {state.status === "ready" || state.status === "demo" ? state.project.bride_name : "신부"}</p>
        </div>
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => <NavItem key={item.to} {...item} />)}
        </nav>
        <div className="mt-auto rounded-2xl border border-[#eeede7] p-4">
          <p className="text-xs text-[#858a80]">결혼식까지</p>
          <p className="serif mt-1 text-2xl text-[#829472]">{state.status === "ready" || state.status === "demo" ? `D-${Math.max(0, daysUntil(state.project.wedding_date))}` : "D-Day"}</p>
        </div>
      </aside>

      <main className="safe-shell min-h-screen md:ml-[248px]">
        <header className="sticky top-0 z-20 border-b border-[#e9e8e0]/80 bg-[#f8f6f0]/90 px-5 pt-[max(14px,env(safe-area-inset-top))] backdrop-blur-md md:px-10 md:pt-5">
          <div className="mx-auto flex max-w-6xl items-center justify-between pb-4">
            <div className="md:hidden"><Brand compact /></div>
            <div className="hidden text-sm font-medium text-[#858a80] md:block">{title}</div>
            <div className="flex items-center gap-3">
              {isDemoMode && <span className="rounded-full bg-[#f0eadc] px-3 py-1.5 text-[10px] font-semibold text-[#856d46]">데모 모드</span>}
              <span className="grid h-10 w-10 place-items-center rounded-full bg-white text-[#73796f]" aria-label="앱 내 알림 기능은 이후 단계에서 제공됩니다." title="앱 내 알림 기능은 이후 단계에서 제공됩니다."><Bell size={18} /></span>
              <div className="grid h-9 w-9 place-items-center rounded-full bg-[#e8ebdd] text-xs font-semibold text-[#637257]">{state.status === "ready" ? state.role === "groom" ? "신" : "부" : "둘"}</div>
            </div>
          </div>
        </header>
        {!online && <div className="flex items-center justify-center gap-2 bg-[#f1eee5] px-4 py-2 text-xs text-[#6f685c]"><CloudOff size={14} />인터넷 연결이 필요해요. 오프라인 편집은 지원하지 않아요.</div>}
        {needRefresh && <div className="flex items-center justify-center gap-3 bg-[#e8ebdd] px-4 py-2 text-xs"><span>새 버전이 준비됐어요.</span><button className="font-semibold underline" onClick={() => void updateServiceWorker(true)}>업데이트</button></div>}
        <div className="mx-auto max-w-6xl px-5 py-7 md:px-10 md:py-10">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/schedule" element={<SchedulePage />} />
            <Route path="/budget" element={<BudgetPage />} />
            <Route path="/vendors" element={<VendorsPage />} />
            <Route path="/checklist" element={<TasksPage />} />
            <Route path="/settings" element={<SettingsPage onSignOut={() => void signOut().then(() => queryClient.clear()).catch((error: unknown) => notify(error instanceof Error ? error.message : "로그아웃하지 못했습니다.", "error"))} />} />
            <Route path="/more" element={<MorePage />} />
            <Route path="*" element={<HomePage />} />
          </Routes>
        </div>
        <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-[#e9e8e0] bg-white/95 px-2 pt-2 backdrop-blur-xl md:hidden">
          <div className="mx-auto flex max-w-xl justify-around pb-1">
            {navItems.map((item) => <NavItem key={item.to} {...item} mobile />)}
          </div>
        </nav>
      </main>
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <img className={compact ? "h-8 w-8" : "h-10 w-10"} src={`${import.meta.env.BASE_URL}icons/wedding-rings.svg`} alt="" />
      <div>
        <p className={`serif leading-none text-[#343a32] ${compact ? "text-lg" : "text-[21px]"}`}>Our Wedding</p>
        {!compact && <p className="mt-1 text-[10px] tracking-[.13em] text-[#858a80]">우리의 결혼 준비</p>}
      </div>
    </div>
  );
}

function NavItem({ to, label, icon: Icon, end, mobile = false }: { to: string; label: string; icon: typeof House; end?: boolean; mobile?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => mobile
        ? `flex min-w-[57px] flex-col items-center justify-center gap-1 rounded-xl px-2 py-1.5 text-[10px] ${isActive ? "font-semibold text-[#71825f]" : "text-[#92968c]"}`
        : `flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm transition-colors ${isActive ? "bg-[#e8ebdd] font-semibold text-[#657456]" : "text-[#73796f] hover:bg-[#f1f1eb]"}`}
    >
      <Icon size={mobile ? 20 : 18} strokeWidth={1.8} /><span>{label}</span>
    </NavLink>
  );
}

function HomePage() {
  const { state } = useAuth();
  const { tasks, events, expenses, vendors, loading, error } = useWeddingData();
  const navigate = useNavigate();
  if (state.status !== "ready" && state.status !== "demo") return null;
  const project = state.project;
  const summary = getBudgetSummary(expenses, project.budget_target);
  const completed = tasks.filter((task) => task.is_completed).length;
  const percent = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
  const upcoming = events.filter((event) => new Date(event.starts_at) >= new Date()).sort((a, b) => a.starts_at.localeCompare(b.starts_at)).slice(0, 4);
  const dueTasks = tasks.filter((task) => !task.is_completed && task.due_date).sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? "")).slice(0, 3);
  return (
    <div className="page-enter">
      <div className="mb-6 flex items-end justify-between">
        <div><p className="text-sm text-[#858a80]">함께 만드는 우리의 하루</p><h1 className="serif mt-1 text-3xl">안녕하세요, {project.groom_name} & {project.bride_name}</h1></div>
        <span className="hidden text-xs text-[#858a80] sm:block">Asia/Seoul · KRW</span>
      </div>
      {error && <ErrorBanner message={error} />}
      {loading && <div className="mb-4 text-sm text-[#858a80]">최신 정보를 불러오고 있어요…</div>}
      <section className="relative mb-5 overflow-hidden rounded-[26px] bg-[#829472] px-6 py-7 text-white md:px-9 md:py-9">
        <div className="absolute -right-7 -top-14 h-52 w-52 rounded-full border border-white/15" />
        <div className="absolute -right-1 -top-8 h-40 w-40 rounded-full border border-white/10" />
        <p className="text-xs tracking-[.16em] text-white/75">OUR WEDDING DAY</p>
        <p className="serif mt-2 text-5xl md:text-6xl">{daysUntil(project.wedding_date) >= 0 ? `D-${daysUntil(project.wedding_date)}` : `D+${Math.abs(daysUntil(project.wedding_date))}`}</p>
        <div className="mt-5 flex items-center justify-between gap-4">
          <p className="text-sm text-white/85">{dateLabel(project.wedding_date)}</p>
          <button onClick={() => navigate("/settings")} className="flex min-h-11 items-center gap-1 rounded-full bg-white/15 px-4 text-xs font-medium hover:bg-white/25">날짜 설정 <ChevronRight size={14} /></button>
        </div>
        <Heart className="absolute right-8 top-1/2 hidden -translate-y-1/2 text-white/60 md:block" size={31} strokeWidth={1.2} />
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <section className="panel p-5">
          <div className="flex items-center justify-between"><div><p className="text-xs text-[#858a80]">준비 현황</p><p className="mt-1 text-lg font-semibold">{completed}<span className="font-normal text-[#9b9e95]"> / {tasks.length}개 완료</span></p></div><div className="grid h-10 w-10 place-items-center rounded-full bg-[#eef1e8] text-[#829472]"><ClipboardCheck size={19} /></div></div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#eff0eb]"><div className="h-full rounded-full bg-[#829472] transition-all" style={{ width: `${percent}%` }} /></div>
          <p className="mt-2 text-right text-xs text-[#858a80]">{percent}% 진행</p>
        </section>
        <section className="panel p-5">
          <div className="flex items-center justify-between"><div><p className="text-xs text-[#858a80]">예산 사용</p><p className="mt-1 text-lg font-semibold">{formatWon(summary.contracted)}</p></div><div className="grid h-10 w-10 place-items-center rounded-full bg-[#f2ede4] text-[#b39b74]"><Wallet size={19} /></div></div>
          <p className="mt-3 text-xs text-[#858a80]">목표 {formatWon(project.budget_target)} · 잔여 {formatWon(summary.remaining)}</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#eff0eb]"><div className="h-full rounded-full bg-[#c1ab87]" style={{ width: `${summary.usedPercent}%` }} /></div>
        </section>
        <section className="panel p-5 sm:col-span-2 xl:col-span-1">
          <div className="mb-2 flex items-center justify-between"><p className="text-xs text-[#858a80]">함께 살펴본 업체</p><Store size={18} className="text-[#829472]" /></div>
          <p className="text-lg font-semibold">{vendors.length}<span className="ml-1 font-normal text-[#9b9e95]">곳</span></p>
          <p className="mt-3 text-xs text-[#858a80]">체크리스트 {tasks.length}개 · 일정 {events.length}개</p>
        </section>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section className="panel p-5 md:p-6">
          <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">다가오는 일정</h2><button className="text-xs text-[#829472]" onClick={() => navigate("/schedule")}>모두 보기 <ArrowRight className="inline" size={13} /></button></div>
          {upcoming.length ? <div className="divide-y divide-[#f0f0eb]">{upcoming.map((event) => <div key={event.id} className="flex items-center gap-3 py-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#eef1e8] text-[#71825f]"><CalendarDays size={18} /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{event.title}</p><p className="mt-1 text-xs text-[#858a80]">{timeLabel(event.starts_at)}{event.location ? ` · ${event.location}` : ""}</p></div><span className="rounded-full bg-[#f4f4ef] px-2.5 py-1 text-[10px] text-[#858a80]">{event.category}</span></div>)}</div> : <EmptyState icon={<CalendarDays />} title="아직 예정된 일정이 없어요" description="상담과 방문 일정을 함께 등록해 보세요." />}
        </section>
        <section className="panel p-5 md:p-6">
          <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">마감이 다가오는 할 일</h2><button className="text-xs text-[#829472]" onClick={() => navigate("/checklist")}>체크리스트 <ArrowRight className="inline" size={13} /></button></div>
          {dueTasks.length ? <div className="divide-y divide-[#f0f0eb]">{dueTasks.map((task) => <QuickTask key={task.id} task={task} />)}</div> : <EmptyState icon={<CheckCircle2 />} title="급한 할 일이 없어요" description="체크리스트에서 함께 준비할 일을 추가해 보세요." />}
        </section>
      </div>

      <section className="mt-5">
        <h2 className="mb-3 text-sm font-semibold">빠르게 시작하기</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <QuickLink title="할 일 추가" icon={<ClipboardCheck size={17} />} onClick={() => navigate("/checklist")} />
          <QuickLink title="일정 추가" icon={<CalendarDays size={17} />} onClick={() => navigate("/schedule")} />
          <QuickLink title="지출 추가" icon={<Wallet size={17} />} onClick={() => navigate("/budget")} />
          <QuickLink title="업체 추가" icon={<Store size={17} />} onClick={() => navigate("/vendors")} />
        </div>
      </section>
    </div>
  );
}

function QuickLink({ title, icon, onClick }: { title: string; icon: ReactNode; onClick: () => void }) {
  return <button onClick={onClick} className="panel flex min-h-14 items-center gap-2.5 px-4 text-left text-sm font-medium hover:border-[#cbd3c2]">{<span className="text-[#829472]">{icon}</span>}{title}<Plus className="ml-auto text-[#a6aa9f]" size={16} /></button>;
}

function QuickTask({ task }: { task: Task }) {
  const { saveRecord } = useWeddingData();
  const notify = useToast();
  return (
    <div className="flex items-center gap-3 py-3">
      <button aria-label={`${task.title} 완료`} className="text-[#829472]" onClick={() => void saveRecord("tasks", { is_completed: true }, task.id).then(() => notify("할 일을 완료했어요.")).catch((error: unknown) => notify(error instanceof Error ? error.message : "저장하지 못했습니다.", "error"))}><Circle size={19} /></button>
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{task.title}</p><p className={`mt-1 text-xs ${task.due_date && task.due_date < new Date().toISOString().slice(0, 10) ? "text-[#c46b6b]" : "text-[#858a80]"}`}>{task.due_date ? dateLabel(task.due_date, { month: "long", day: "numeric" }) : "마감일 없음"} · {task.assignee}</p></div>
      <span className="rounded-full bg-[#f5f4ef] px-2.5 py-1 text-[10px] text-[#858a80]">{task.category}</span>
    </div>
  );
}

function TasksPage() {
  const { tasks, loading, error, saveRecord, deleteRecord } = useWeddingData();
  const notify = useToast();
  const [filter, setFilter] = useState("전체");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("기타");
  const [dueDate, setDueDate] = useState("");
  const [assignee, setAssignee] = useState<Assignee>("함께");
  const [priority, setPriority] = useState("보통");
  const visible = tasks.filter((task) => filter === "전체" || filter === "미완료" && !task.is_completed || filter === "완료" && task.is_completed || filter === task.assignee);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await saveRecord("tasks", { title: title.trim(), category, due_date: dueDate || null, assignee, priority, notes: "", is_completed: false });
      setTitle(""); setDueDate("");
      notify("체크리스트에 추가했어요.");
    } catch (saveError) { notify(saveError instanceof Error ? saveError.message : "저장하지 못했습니다.", "error"); }
  };
  return (
    <div className="page-enter">
      <PageTitle eyebrow="OUR CHECKLIST" title="함께 준비하기" description="작은 한 걸음씩, 우리만의 결혼식을 준비해요." />
      {error && <ErrorBanner message={error} />}
      <form className="panel mb-5 grid gap-3 p-4 md:grid-cols-[1.4fr_1fr_1fr_1fr_auto]" onSubmit={(event) => void submit(event)}>
        <input className="field" placeholder="새로운 할 일" aria-label="새로운 할 일" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={160} />
        <select className="field" aria-label="카테고리" value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select>
        <input className="field" type="date" aria-label="마감일" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        <select className="field" aria-label="담당자" value={assignee} onChange={(event) => setAssignee(event.target.value as Assignee)}>{assignees.map((item) => <option key={item}>{item}</option>)}</select>
        <button className="primary-button flex items-center justify-center gap-2" type="submit"><Plus size={17} />추가</button>
        <select className="field md:col-span-2" aria-label="우선순위" value={priority} onChange={(event) => setPriority(event.target.value)}><option>보통</option><option>높음</option><option>낮음</option></select>
      </form>
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">{["전체", "미완료", "완료", ...assignees].map((item) => <button key={item} onClick={() => setFilter(item)} className={`min-h-11 shrink-0 rounded-full px-4 text-xs ${filter === item ? "bg-[#829472] text-white" : "bg-white text-[#73796f]"}`}>{item}</button>)}</div>
      <section className="panel p-4 md:p-6">
        {loading ? <p className="py-8 text-center text-sm text-[#858a80]">불러오는 중…</p> : visible.length ? <div className="divide-y divide-[#f0f0eb]">{visible.map((task) => <TaskRow key={task.id} task={task} deleteRecord={deleteRecord} />)}</div> : <EmptyState icon={<ClipboardCheck />} title="아직 등록된 할 일이 없어요" description="두 사람의 첫 번째 준비 항목을 추가해 보세요." />}
      </section>
    </div>
  );
}

function TaskRow({ task, deleteRecord }: { task: Task; deleteRecord: (collection: CollectionName, id: string) => Promise<void> }) {
  const { saveRecord } = useWeddingData();
  const notify = useToast();
  const remove = async () => {
    if (!window.confirm(`"${task.title}" 할 일을 삭제할까요?`)) return;
    try { await deleteRecord("tasks", task.id); notify("할 일을 삭제했어요."); }
    catch (error) { notify(error instanceof Error ? error.message : "삭제하지 못했습니다.", "error"); }
  };
  const toggle = async () => {
    try { await saveRecord("tasks", { is_completed: !task.is_completed }, task.id); notify(task.is_completed ? "할 일을 다시 열었어요." : "할 일을 완료했어요."); }
    catch (error) { notify(error instanceof Error ? error.message : "저장하지 못했습니다.", "error"); }
  };
  const overdue = !task.is_completed && task.due_date && task.due_date < new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  return (
    <div className="flex items-center gap-3 py-3.5">
      <button className={task.is_completed ? "text-[#829472]" : "text-[#c5c8bf]"} aria-label={task.is_completed ? "완료 취소" : "완료"} onClick={() => void toggle()}>{task.is_completed ? <CheckCircle2 size={21} /> : <Circle size={21} />}</button>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-medium ${task.is_completed ? "text-[#9b9e95] line-through" : "text-[#41473e]"}`}>{task.title}</p>
        <p className={`mt-1 text-xs ${overdue ? "font-medium text-[#c46b6b]" : "text-[#858a80]"}`}>{task.due_date ? `${dateLabel(task.due_date, { month: "long", day: "numeric" })}${overdue ? " · 기한 초과" : ""}` : "마감일 없음"} · {task.assignee} · {task.category}</p>
      </div>
      <span className={`hidden rounded-full px-2.5 py-1 text-[10px] sm:inline ${task.priority === "높음" ? "bg-[#f8eeee] text-[#b95858]" : "bg-[#f4f4ef] text-[#858a80]"}`}>{task.priority}</span>
      <button className="grid h-11 w-11 place-items-center rounded-full text-[#a1a59b] hover:bg-[#f5f4ef] hover:text-[#b95858]" aria-label="삭제" onClick={() => void remove()}><X size={17} /></button>
    </div>
  );
}

function SchedulePage() {
  const { events, loading, error, saveRecord, deleteRecord } = useWeddingData();
  const notify = useToast();
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState("기타");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await saveRecord("events", { title: title.trim(), starts_at: new Date(startsAt).toISOString(), location: location.trim(), category, attendees: "", assignee: "함께", notes: "" });
      setTitle(""); setLocation(""); setStartsAt("");
      notify("일정을 저장했어요.");
    } catch (saveError) { notify(saveError instanceof Error ? saveError.message : "일정을 저장하지 못했습니다.", "error"); }
  };
  const ordered = [...events].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  return (
    <div className="page-enter">
      <PageTitle eyebrow="SHARED CALENDAR" title="우리의 일정" description="상담, 투어, 촬영 날짜를 함께 기록해요." action={events.length > 0 ? <button className="ghost-button" onClick={() => exportCalendar(events)}><Download size={15} />ICS</button> : undefined} />
      {error && <ErrorBanner message={error} />}
      <form className="panel mb-5 grid gap-3 p-4 md:grid-cols-[1.2fr_1fr_1fr_1fr_auto]" onSubmit={(event) => void submit(event)}>
        <input className="field" placeholder="일정 제목" aria-label="일정 제목" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} required />
        <input className="field" type="datetime-local" aria-label="날짜와 시간" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required />
        <input className="field" placeholder="장소" aria-label="장소" value={location} onChange={(event) => setLocation(event.target.value)} maxLength={160} />
        <select className="field" aria-label="일정 카테고리" value={category} onChange={(event) => setCategory(event.target.value)}>{["웨딩홀", "스튜디오", "드레스", "메이크업", "계약 및 납부", "신혼여행", "기타"].map((item) => <option key={item}>{item}</option>)}</select>
        <button className="primary-button flex items-center justify-center gap-2" type="submit"><Plus size={17} />추가</button>
      </form>
      <section className="panel p-4 md:p-6">
        {loading ? <p className="py-8 text-center text-sm text-[#858a80]">불러오는 중…</p> : ordered.length ? <div className="divide-y divide-[#f0f0eb]">{ordered.map((item) => <div key={item.id} className="flex gap-4 py-4">
          <div className="w-[66px] shrink-0 text-center"><p className="text-[11px] text-[#858a80]">{dateLabel(item.starts_at, { month: "short" })}</p><p className="serif text-2xl text-[#829472]">{new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", day: "numeric" }).format(new Date(item.starts_at))}</p></div>
          <div className="flex min-w-0 flex-1 items-start gap-3 border-l border-[#e9e8e0] pl-4"><div className="min-w-0 flex-1"><p className="font-medium">{item.title}</p><p className="mt-1 text-xs text-[#858a80]">{timeLabel(item.starts_at)}{item.location ? ` · ${item.location}` : ""}</p></div><span className="rounded-full bg-[#eef1e8] px-2.5 py-1 text-[10px] text-[#708160]">{item.category}</span><button className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[#a1a59b] hover:bg-[#f5f4ef]" aria-label="일정 삭제" onClick={() => {
            if (!window.confirm(`"${item.title}" 일정을 삭제할까요?`)) return;
            void deleteRecord("events", item.id).then(() => notify("일정을 삭제했어요.")).catch((e: unknown) => notify(e instanceof Error ? e.message : "삭제하지 못했습니다.", "error"));
          }}><X size={16} /></button></div>
        </div>)}</div> : <EmptyState icon={<CalendarDays />} title="등록된 일정이 없어요" description="첫 상담이나 웨딩홀 투어를 기록해 보세요." />}
      </section>
      <p className="mt-3 text-xs leading-5 text-[#969a90]">월간/주간 달력 보기와 ICS 내보내기는 이후 단계에서 추가됩니다. 현재 등록된 일정은 목록과 홈 화면에 표시돼요.</p>
    </div>
  );
}

function BudgetPage() {
  const { state, updateProject } = useAuth();
  const { expenses, loading, error, saveRecord, deleteRecord } = useWeddingData();
  const notify = useToast();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("기타");
  const [estimate, setEstimate] = useState("");
  const [contracted, setContracted] = useState("");
  const [paid, setPaid] = useState("");
  const [dueDate, setDueDate] = useState("");
  const project = state.status === "ready" || state.status === "demo" ? state.project : null;
  const [budgetDraft, setBudgetDraft] = useState(String(project?.budget_target ?? 0));
  useEffect(() => setBudgetDraft(String(project?.budget_target ?? 0)), [project?.budget_target]);
  const summary = getBudgetSummary(expenses, project?.budget_target ?? 0);
  const categorySpending = Object.values(expenses.reduce<Record<string, { category: string; amount: number }>>((result, expense) => {
    result[expense.category] ??= { category: expense.category, amount: 0 };
    result[expense.category].amount += expense.contracted_amount;
    return result;
  }, {})).filter((item) => item.amount > 0);
  const exportExpenses = () => {
    const csvCell = (value: string | number) => {
      const text = String(value);
      const safe = typeof value === "string" && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const rows = [
      ["항목", "카테고리", "예상 견적", "확정 계약 금액", "실제 납부 금액", "미납 금액", "납부 예정일"],
      ...expenses.map((item) => [item.title, item.category, item.estimate_amount, item.contracted_amount, item.paid_amount, item.contracted_amount - item.paid_amount, item.due_date ?? ""])
    ];
    downloadFile("our-wedding-budget.csv", `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`, "text/csv;charset=utf-8");
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const estimated = Math.max(0, Math.trunc(Number(estimate) || 0));
    const confirmed = Math.max(0, Math.trunc(Number(contracted) || 0));
    const paidValue = Math.max(0, Math.trunc(Number(paid) || 0));
    if (paidValue > confirmed) { notify("실제 납부액은 확정 계약 금액보다 클 수 없어요.", "error"); return; }
    try {
      await saveRecord("expenses", { title: title.trim(), category, estimate_amount: estimated, contracted_amount: confirmed, paid_amount: paidValue, due_date: dueDate || null, paid_on: paidValue > 0 ? new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }) : null, payer: "함께" });
      setTitle(""); setEstimate(""); setContracted(""); setPaid(""); setDueDate("");
      notify("예산 항목을 추가했어요.");
    } catch (saveError) { notify(saveError instanceof Error ? saveError.message : "저장하지 못했습니다.", "error"); }
  };
  const updateBudget = async (value: string) => {
    if (!project || state.status !== "ready" && state.status !== "demo") return;
    const amount = Math.max(0, Math.trunc(Number(value) || 0));
    try { await updateProject({ budget_target: amount }); notify("목표 예산을 저장했어요."); }
    catch (saveError) { notify(saveError instanceof Error ? saveError.message : "저장하지 못했습니다.", "error"); }
  };
  return (
    <div className="page-enter">
      <PageTitle eyebrow="WEDDING BUDGET" title="우리의 예산" description="계약 금액과 실제 납부액을 구분해 관리해요." action={expenses.length > 0 ? <button className="ghost-button" onClick={exportExpenses}><Download size={15} />CSV</button> : undefined} />
      {error && <ErrorBanner message={error} />}
      <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <BudgetStat label="목표 예산" value={formatWon(project?.budget_target ?? 0)} icon={<Wallet size={18} />} />
        <BudgetStat label="확정 계약 금액" value={formatWon(summary.contracted)} icon={<ShieldCheck size={18} />} />
        <BudgetStat label="실제 납부 금액" value={formatWon(summary.paid)} icon={<CheckCircle2 size={18} />} />
        <BudgetStat label="미납 / 잔여 예산" value={`${formatWon(summary.unpaid)} / ${formatWon(summary.remaining)}`} icon={<ArrowDownRight size={18} />} />
      </section>
      <div className="panel mb-5 p-5">
        <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">예산 사용률</p><p className="mt-1 text-xs text-[#858a80]">예상 견적 {formatWon(summary.estimated)} · 확정 금액 기준 {summary.usedPercent}%</p></div>
          <label className="flex items-center gap-2 text-xs text-[#858a80]">목표 예산<input className="field w-36 text-right" type="number" min="0" step="10000" aria-label="목표 예산" value={budgetDraft} onChange={(event) => setBudgetDraft(event.target.value)} onBlur={(event) => void updateBudget(event.target.value)} /></label>
        </div>
        {categorySpending.length > 0 && <section className="panel mb-5 p-5">
          <h2 className="mb-4 text-sm font-semibold">카테고리별 확정 계약 금액</h2>
          <Suspense fallback={<div className="grid h-[230px] place-items-center text-xs text-[#858a80]">차트를 불러오는 중…</div>}>
            <CategorySpendingChart data={categorySpending} />
          </Suspense>
        </section>}
        <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-[#eff0eb]"><div className="h-full rounded-full bg-[#c1ab87]" style={{ width: `${summary.usedPercent}%` }} /></div>
        {summary.remaining < 0 && <p className="mt-2 text-xs font-medium text-[#c46b6b]">목표 예산보다 확정 금액이 {formatWon(Math.abs(summary.remaining))} 초과했어요.</p>}
      </div>
      <form className="panel mb-5 grid gap-3 p-4 md:grid-cols-3" onSubmit={(event) => void submit(event)}>
        <input className="field" placeholder="예산 항목" aria-label="예산 항목" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} required />
        <select className="field" aria-label="예산 카테고리" value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select>
        <input className="field" type="date" aria-label="납부 예정일" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        <input className="field" type="number" min="0" step="10000" placeholder="예상 견적 (원)" aria-label="예상 견적" value={estimate} onChange={(event) => setEstimate(event.target.value)} />
        <input className="field" type="number" min="0" step="10000" placeholder="확정 계약액 (원)" aria-label="확정 계약액" value={contracted} onChange={(event) => setContracted(event.target.value)} />
        <div className="flex gap-2"><input className="field" type="number" min="0" step="10000" placeholder="실제 납부액 (원)" aria-label="실제 납부액" value={paid} onChange={(event) => setPaid(event.target.value)} /><button className="primary-button shrink-0 px-4" type="submit"><Plus size={18} /></button></div>
      </form>
      <section className="panel p-4 md:p-6">
        <h2 className="mb-3 font-semibold">지출 항목</h2>
        {loading ? <p className="py-8 text-center text-sm text-[#858a80]">불러오는 중…</p> : expenses.length ? <div className="divide-y divide-[#f0f0eb]">{expenses.map((expense) => <div key={expense.id} className="flex items-center gap-3 py-3.5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#f4f0e9] text-[#a88f66]"><Wallet size={17} /></div>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{expense.title}</p><p className="mt-1 text-xs text-[#858a80]">{expense.category}{expense.due_date ? ` · 납부 예정 ${dateLabel(expense.due_date, { month: "short", day: "numeric" })}` : ""}</p></div>
          <div className="text-right"><p className="text-sm font-semibold">{formatWon(expense.contracted_amount)}</p><p className="mt-1 text-[11px] text-[#858a80]">납부 {formatWon(expense.paid_amount)} · 미납 {formatWon(expense.contracted_amount - expense.paid_amount)}</p></div>
          <button className="grid h-11 w-11 place-items-center rounded-full text-[#a1a59b]" aria-label={`${expense.title} 삭제`} onClick={() => {
            if (!window.confirm(`"${expense.title}" 예산 항목을 삭제할까요?`)) return;
            void deleteRecord("expenses", expense.id).then(() => notify("예산 항목을 삭제했어요.")).catch((e: unknown) => notify(e instanceof Error ? e.message : "삭제하지 못했습니다.", "error"));
          }}><X size={16} /></button>
        </div>)}</div> : <EmptyState icon={<Wallet />} title="예산 항목이 없어요" description="예상 견적과 계약 금액을 나누어 기록해 보세요." />}
      </section>
      <p className="mt-3 text-xs leading-5 text-[#969a90]">예상 견적은 확정 지출에 포함하지 않으며, 잔여 예산은 목표 예산에서 확정 계약액만 차감합니다. 금융 결제 기능은 제공하지 않아요.</p>
    </div>
  );
}

function BudgetStat({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return <div className="panel p-4"><div className="flex items-center justify-between"><p className="text-xs text-[#858a80]">{label}</p><span className="text-[#829472]">{icon}</span></div><p className="mt-3 break-words text-base font-semibold">{value}</p></div>;
}

function VendorsPage() {
  const { vendors, loading, error, saveRecord, deleteRecord } = useWeddingData();
  const notify = useToast();
  const [name, setName] = useState("");
  const [category, setCategory] = useState(vendorCategories[0]);
  const [estimate, setEstimate] = useState("");
  const [status, setStatus] = useState("관심");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await saveRecord("vendors", { name: name.trim(), category, status, estimate_amount: Math.max(0, Math.trunc(Number(estimate) || 0)), contracted_amount: 0, contact: "", notes: "" });
      setName(""); setEstimate("");
      notify("업체를 추가했어요.");
    } catch (saveError) { notify(saveError instanceof Error ? saveError.message : "업체를 저장하지 못했습니다.", "error"); }
  };
  return (
    <div className="page-enter">
      <PageTitle eyebrow="VENDOR NOTES" title="함께 고른 업체" description="관심 있는 업체와 예상 견적을 정리해요." />
      {error && <ErrorBanner message={error} />}
      <form className="panel mb-5 grid gap-3 p-4 md:grid-cols-[1.3fr_1fr_1fr_1fr_auto]" onSubmit={(event) => void submit(event)}>
        <input className="field" placeholder="업체 이름" aria-label="업체 이름" value={name} onChange={(event) => setName(event.target.value)} maxLength={160} required />
        <select className="field" aria-label="업체 카테고리" value={category} onChange={(event) => setCategory(event.target.value)}>{vendorCategories.map((item) => <option key={item}>{item}</option>)}</select>
        <input className="field" type="number" min="0" step="10000" placeholder="예상 견적 (원)" aria-label="예상 견적" value={estimate} onChange={(event) => setEstimate(event.target.value)} />
        <select className="field" aria-label="진행 상태" value={status} onChange={(event) => setStatus(event.target.value)}>{["관심", "상담 예정", "상담 완료", "비교 중", "계약 완료", "제외"].map((item) => <option key={item}>{item}</option>)}</select>
        <button className="primary-button flex items-center justify-center gap-2" type="submit"><Plus size={17} />추가</button>
      </form>
      {error && <ErrorBanner message={error} />}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {loading ? <div className="panel col-span-full py-10 text-center text-sm text-[#858a80]">불러오는 중…</div> : vendors.length ? vendors.map((vendor) => <article key={vendor.id} className="panel p-5">
          <div className="flex items-start justify-between gap-3"><div><span className="rounded-full bg-[#eef1e8] px-2.5 py-1 text-[10px] text-[#708160]">{vendor.category}</span><h2 className="mt-3 text-lg font-semibold">{vendor.name}</h2></div><button className="grid h-11 w-11 place-items-center rounded-full text-[#a1a59b]" aria-label={`${vendor.name} 삭제`} onClick={() => {
            if (!window.confirm(`${vendor.name} 업체를 삭제할까요?`)) return;
            void deleteRecord("vendors", vendor.id).then(() => notify("업체를 삭제했어요.")).catch((e: unknown) => notify(e instanceof Error ? e.message : "삭제하지 못했습니다.", "error"));
          }}><X size={16} /></button></div>
          <p className="mt-4 text-sm text-[#73796f]">예상 견적 <strong className="ml-1 text-[#343a32]">{formatWon(vendor.estimate_amount)}</strong></p>
          <label className="mt-4 block text-xs text-[#858a80]">진행 상태<select className="field mt-1" value={vendor.status} onChange={(event) => void saveRecord("vendors", { status: event.target.value }, vendor.id).then(() => notify("업체 상태를 바꿨어요.")).catch((e: unknown) => notify(e instanceof Error ? e.message : "저장하지 못했습니다.", "error"))}>{["관심", "상담 예정", "상담 완료", "비교 중", "계약 완료", "제외"].map((item) => <option key={item}>{item}</option>)}</select></label>
        </article>) : <div className="panel col-span-full"><EmptyState icon={<Store />} title="업체를 아직 등록하지 않았어요" description="상담할 곳이나 기억해 두고 싶은 업체를 추가해 보세요." /></div>}
      </section>
      <p className="mt-4 text-xs leading-5 text-[#969a90]">업체 비교표, 상세 견적 구성과 신랑·신부별 점수 평가는 이후 단계에서 추가됩니다.</p>
    </div>
  );
}

function MorePage() {
  const navigate = useNavigate();
  const available = [
    { title: "체크리스트", sub: "할 일과 담당자 관리", icon: <ClipboardCheck size={19} />, action: () => navigate("/checklist") },
    { title: "설정", sub: "예식일, 이름, 목표 예산", icon: <Settings size={19} />, action: () => navigate("/settings") }
  ];
  const planned = [
    { title: "무드보드", icon: <Image size={18} /> },
    { title: "계약 관리", icon: <ShieldCheck size={18} /> },
    { title: "하객 관리", icon: <Heart size={18} /> },
    { title: "신혼여행", icon: <Sparkles size={18} /> },
    { title: "공동 메모", icon: <ClipboardCheck size={18} /> }
  ];
  return (
    <div className="page-enter">
      <PageTitle eyebrow="MORE TOGETHER" title="더보기" description="우리의 준비를 한 곳에서 차근차근." />
      <div className="grid gap-3 sm:grid-cols-2">
        {available.map((item) => <button key={item.title} onClick={item.action} className="panel flex min-h-[86px] items-center gap-4 p-5 text-left hover:border-[#cbd3c2]"><span className="text-[#829472]">{item.icon}</span><span className="flex-1"><span className="block font-semibold">{item.title}</span><span className="mt-1 block text-xs text-[#858a80]">{item.sub}</span></span><ChevronRight size={18} className="text-[#a1a59b]" /></button>)}
      </div>
      <h2 className="mb-3 mt-8 text-sm font-semibold">다음 업데이트</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {planned.map((item) => <div key={item.title} className="flex min-h-16 items-center gap-3 rounded-2xl border border-dashed border-[#dcded5] px-4 text-sm text-[#858a80]"><span className="text-[#b3b8ab]">{item.icon}</span>{item.title}<span className="ml-auto text-[10px]">개발 예정</span></div>)}
      </div>
      <p className="mt-5 text-xs leading-5 text-[#969a90]">표시된 개발 예정 기능은 아직 동작하지 않습니다. 완료된 기능으로 오인되지 않도록 구분했습니다.</p>
    </div>
  );
}

function SettingsPage({ onSignOut }: { onSignOut: () => void }) {
  const { state, saveWeddingSettings } = useAuth();
  const notify = useToast();
  const project = state.status === "ready" || state.status === "demo" ? state.project : null;
  const [weddingDate, setWeddingDate] = useState(project?.wedding_date ?? "2027-09-05");
  const [groom, setGroom] = useState(project?.groom_name ?? "신랑");
  const [bride, setBride] = useState(project?.bride_name ?? "신부");
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!project) return;
    try {
      const recalculateDeadlines = weddingDate !== project.wedding_date
        && window.confirm("예식일을 변경해도 기존 체크리스트 마감일은 유지돼요. 기본 체크리스트 마감일도 새 날짜 기준으로 다시 계산할까요?");
      const updatedTasks = await saveWeddingSettings(
        { wedding_date: weddingDate, groom_name: groom.trim() || "신랑", bride_name: bride.trim() || "신부" },
        recalculateDeadlines
      );
      notify(recalculateDeadlines ? `설정과 기본 체크리스트 ${updatedTasks}개의 마감일을 저장했어요.` : "설정을 저장했어요.");
    } catch (saveError) { notify(saveError instanceof Error ? saveError.message : "설정을 저장하지 못했습니다.", "error"); }
  };
  return (
    <div className="page-enter">
      <PageTitle eyebrow="OUR SETTINGS" title="우리의 설정" description="예식 정보는 함께 쓰는 프로젝트에 저장돼요." />
      <form className="panel max-w-2xl space-y-5 p-5 md:p-7" onSubmit={(event) => void save(event)}>
        <label className="block text-sm font-medium">결혼 예정일<input className="field mt-2" type="date" value={weddingDate} onChange={(event) => setWeddingDate(event.target.value)} required /></label>
        <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium">신랑 표시 이름<input className="field mt-2" value={groom} onChange={(event) => setGroom(event.target.value)} maxLength={40} /></label><label className="block text-sm font-medium">신부 표시 이름<input className="field mt-2" value={bride} onChange={(event) => setBride(event.target.value)} maxLength={40} /></label></div>
        <p className="rounded-xl bg-[#f5f4ef] p-3 text-xs leading-5 text-[#858a80]">목표 예산은 예산 탭에서 변경할 수 있어요. 날짜를 바꾸어도 기존 일정과 할 일은 삭제되지 않습니다.</p>
        <button className="primary-button w-full sm:w-auto" type="submit">변경사항 저장</button>
      </form>
      <section className="panel mt-4 max-w-2xl p-5">
        <p className="font-medium">앱 정보</p><p className="mt-2 text-xs text-[#858a80]">버전 0.1.0 · 시간대 Asia/Seoul · 통화 KRW</p>
        <p className="mt-2 text-xs leading-5 text-[#858a80]">{isDemoMode ? "데모 모드 데이터는 이 브라우저에만 저장됩니다." : "프로젝트 데이터는 Supabase RLS 정책으로 보호됩니다."}</p>
        {state.status === "ready" && <button className="ghost-button danger-button mt-5" onClick={onSignOut}><LogOut size={16} />로그아웃</button>}
      </section>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return <div role="alert" className="mb-4 rounded-xl border border-[#f0d7d7] bg-[#fbefef] px-4 py-3 text-sm text-[#a74f4f]">데이터를 불러오지 못했습니다: {message}</div>;
}

export default function App() {
  return (
    <ToastProvider>
      <HashRouter>
        <AuthGate />
      </HashRouter>
    </ToastProvider>
  );
}
