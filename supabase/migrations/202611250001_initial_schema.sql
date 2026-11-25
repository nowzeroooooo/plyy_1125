create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.wedding_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Our Wedding',
  wedding_date date not null default date '2027-09-05',
  budget_target bigint not null default 0 check (budget_target >= 0),
  groom_name text not null default '신랑',
  bride_name text not null default '신부',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_members (
  project_id uuid not null references public.wedding_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('groom', 'bride')),
  display_name text not null default '',
  created_at timestamptz not null default now(),
  primary key (project_id, user_id),
  unique (project_id, role)
);

create table public.project_initializations (
  project_id uuid primary key references public.wedding_projects(id) on delete cascade,
  defaults_initialized_at timestamptz not null default now()
);

create or replace function public.is_project_member(target_project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.project_members pm
    where pm.project_id = target_project and pm.user_id = (select auth.uid())
  );
$$;

create or replace function public.current_project_role(target_project uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select pm.role from public.project_members pm
  where pm.project_id = target_project and pm.user_id = (select auth.uid())
  limit 1;
$$;

create or replace function public.initialize_wedding_defaults(target_project uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer;
  wedding date;
begin
  if not public.is_project_member(target_project) then
    raise exception '프로젝트 멤버만 기본 데이터를 초기화할 수 있습니다.' using errcode = '42501';
  end if;

  insert into public.project_initializations(project_id)
  values (target_project)
  on conflict (project_id) do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then
    return;
  end if;

  select wedding_date into wedding
  from public.wedding_projects
  where id = target_project;

  insert into public.budget_categories(project_id, name)
  select target_project, categories.category
  from unnest(array[
    '웨딩홀', '식대', '스튜디오', '드레스', '메이크업', '웨딩 플래너',
    '예복', '예물', '본식 스냅', '본식 영상', '청첩장', '혼주 의상',
    '혼주 메이크업', '신혼여행', '기타', '예비비'
  ]) as categories(category)
  on conflict (project_id, name) do nothing;

  insert into public.tasks(project_id, title, category, due_date, assignee, priority, template_key)
  select target_project, task.title, task.category,
    (wedding - make_interval(months => task.months_before))::date,
    '함께', '보통', task.template_key
  from (values
    ('date', '결혼식 날짜 결정', '기타', 12),
    ('budget', '전체 예산 설정', '기타', 12),
    ('venue-shortlist', '웨딩홀 후보 선정', '웨딩홀', 12),
    ('venue-tour', '웨딩홀 투어', '웨딩홀', 12),
    ('venue-contract', '웨딩홀 계약', '웨딩홀', 12),
    ('planner', '웨딩 플래너 선정', '웨딩 플래너', 10),
    ('studio-compare', '스튜디오 업체 비교', '스튜디오', 10),
    ('dress-shop', '드레스샵 선정', '드레스', 10),
    ('makeup-shop', '메이크업샵 선정', '메이크업', 10),
    ('s-d-m-contract', '스드메 계약', '스튜디오', 9),
    ('wedding-photo', '본식 스냅 계약', '본식 스냅', 9),
    ('wedding-video', '본식 영상 계약', '본식 영상', 9),
    ('honeymoon-shortlist', '신혼여행 후보지 선정', '신혼여행', 9),
    ('dress-tour', '드레스 투어', '드레스', 6),
    ('suit', '예복 준비', '예복', 6),
    ('jewelry', '예물 준비', '예물', 6),
    ('honeymoon-book', '신혼여행 예약', '신혼여행', 6),
    ('studio-shoot', '웨딩 촬영', '스튜디오', 4),
    ('photo-select', '촬영 사진 셀렉', '스튜디오', 4),
    ('invitation-design', '청첩장 디자인 선정', '청첩장', 4),
    ('guest-list', '하객 명단 정리', '기타', 3),
    ('invitation-print', '청첩장 제작', '청첩장', 3),
    ('mobile-invitation', '모바일 청첩장 제작', '청첩장', 3),
    ('invitation-send', '청첩장 전달', '청첩장', 2),
    ('wedding-dress', '본식 드레스 셀렉', '드레스', 2),
    ('ceremony-order', '식순 결정', '기타', 2),
    ('host-song', '사회자 및 축가 섭외', '기타', 2),
    ('guest-count-final', '최종 하객 인원 확인', '기타', 1),
    ('venue-final', '웨딩홀 최종 상담', '웨딩홀', 1),
    ('balance-check', '잔금 확인', '기타', 1),
    ('wedding-final-check', '본식 일정 최종 점검', '기타', 1)
  ) as task(template_key, title, category, months_before);
end;
$$;

create or replace function public.recalculate_task_deadlines(target_project uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_count integer;
begin
  if not public.is_project_member(target_project) then
    raise exception '프로젝트 멤버만 마감일을 다시 계산할 수 있습니다.' using errcode = '42501';
  end if;

  update public.tasks as current_task
  set due_date = (project.wedding_date - make_interval(months => defaults.months_before))::date
  from public.wedding_projects as project,
  (values
    ('date', 12), ('budget', 12), ('venue-shortlist', 12), ('venue-tour', 12), ('venue-contract', 12),
    ('planner', 10), ('studio-compare', 10), ('dress-shop', 10), ('makeup-shop', 10),
    ('s-d-m-contract', 9), ('wedding-photo', 9), ('wedding-video', 9), ('honeymoon-shortlist', 9),
    ('dress-tour', 6), ('suit', 6), ('jewelry', 6), ('honeymoon-book', 6),
    ('studio-shoot', 4), ('photo-select', 4), ('invitation-design', 4),
    ('guest-list', 3), ('invitation-print', 3), ('mobile-invitation', 3),
    ('invitation-send', 2), ('wedding-dress', 2), ('ceremony-order', 2), ('host-song', 2),
    ('guest-count-final', 1), ('venue-final', 1), ('balance-check', 1), ('wedding-final-check', 1)
  ) as defaults(template_key, months_before)
  where project.id = target_project
    and current_task.project_id = target_project
    and current_task.template_key = defaults.template_key;
  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

revoke all on function public.initialize_wedding_defaults(uuid) from public, anon;
revoke all on function public.recalculate_task_deadlines(uuid) from public, anon;
grant execute on function public.initialize_wedding_defaults(uuid) to authenticated;
grant execute on function public.recalculate_task_deadlines(uuid) to authenticated;

create or replace function public.save_wedding_settings(
  target_project uuid,
  target_wedding_date date,
  target_groom_name text,
  target_bride_name text,
  recalculate_deadlines boolean
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_count integer := 0;
begin
  if not public.is_project_member(target_project) then
    raise exception '프로젝트 멤버만 설정을 변경할 수 있습니다.' using errcode = '42501';
  end if;

  update public.wedding_projects
  set wedding_date = target_wedding_date,
      groom_name = left(trim(target_groom_name), 40),
      bride_name = left(trim(target_bride_name), 40)
  where id = target_project;

  if recalculate_deadlines then
    updated_count := public.recalculate_task_deadlines(target_project);
  end if;
  return updated_count;
end;
$$;

revoke all on function public.save_wedding_settings(uuid, date, text, text, boolean) from public, anon;
grant execute on function public.save_wedding_settings(uuid, date, text, text, boolean) to authenticated;

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.wedding_projects(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  category text not null default '기타',
  due_date date,
  assignee text not null default '함께' check (assignee in ('신랑', '신부', '함께')),
  priority text not null default '보통' check (priority in ('낮음', '보통', '높음')),
  notes text not null default '',
  is_completed boolean not null default false,
  template_key text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, id)
);
create unique index tasks_template_key_unique on public.tasks(project_id, template_key) where template_key is not null;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.wedding_projects(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  starts_at timestamptz not null,
  location text not null default '',
  category text not null default '기타',
  attendees text not null default '',
  assignee text not null default '함께',
  notes text not null default '',
  vendor_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, id)
);

create table public.budget_categories (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.wedding_projects(id) on delete cascade,
  name text not null,
  target_amount bigint not null default 0 check (target_amount >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, id),
  unique (project_id, name)
);

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.wedding_projects(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  category text not null default '기타',
  status text not null default '관심' check (status in ('관심', '상담 예정', '상담 완료', '비교 중', '계약 완료', '제외')),
  estimate_amount bigint not null default 0 check (estimate_amount >= 0),
  contracted_amount bigint not null default 0 check (contracted_amount >= 0),
  contact text not null default '',
  notes text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, id)
);
alter table public.events add constraint events_vendor_project_fk
  foreign key (project_id, vendor_id) references public.vendors(project_id, id) on delete set null (vendor_id);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.wedding_projects(id) on delete cascade,
  category text not null default '기타',
  title text not null check (length(trim(title)) > 0),
  estimate_amount bigint not null default 0 check (estimate_amount >= 0),
  contracted_amount bigint not null default 0 check (contracted_amount >= 0),
  paid_amount bigint not null default 0 check (paid_amount >= 0 and paid_amount <= contracted_amount),
  due_date date,
  paid_on date,
  payer text not null default '함께' check (payer in ('신랑', '신부', '함께')),
  vendor_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, id),
  foreign key (project_id, vendor_id) references public.vendors(project_id, id) on delete set null (vendor_id)
);

create table public.vendor_quotes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.wedding_projects(id) on delete cascade,
  vendor_id uuid not null,
  amount bigint not null default 0 check (amount >= 0),
  details jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, vendor_id) references public.vendors(project_id, id) on delete cascade
);

create table public.vendor_rating_criteria (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.wedding_projects(id) on delete cascade,
  category text not null,
  name text not null,
  weight numeric not null default 1 check (weight > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, id),
  unique (project_id, category, name)
);

create table public.vendor_ratings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.wedding_projects(id) on delete cascade,
  vendor_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  criterion_id uuid not null references public.vendor_rating_criteria(id) on delete cascade,
  score smallint not null check (score between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendor_id, user_id, criterion_id),
  foreign key (project_id, vendor_id) references public.vendors(project_id, id) on delete cascade,
  foreign key (project_id, criterion_id) references public.vendor_rating_criteria(project_id, id) on delete cascade
);

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.wedding_projects(id) on delete cascade,
  vendor_id uuid not null,
  title text not null,
  signed_on date,
  amount bigint not null default 0 check (amount >= 0),
  terms text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, id),
  foreign key (project_id, vendor_id) references public.vendors(project_id, id) on delete cascade
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.wedding_projects(id) on delete cascade,
  contract_id uuid not null,
  title text not null,
  amount bigint not null default 0 check (amount >= 0),
  due_date date,
  paid_on date,
  payer text not null default '함께',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, contract_id) references public.contracts(project_id, id) on delete cascade
);

create table public.moodboard_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.wedding_projects(id) on delete cascade,
  title text not null default '',
  description text not null default '',
  category text not null default '기타',
  storage_path text,
  source_url text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, id)
);

create table public.moodboard_likes (
  project_id uuid not null references public.wedding_projects(id) on delete cascade,
  item_id uuid not null references public.moodboard_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, user_id),
  foreign key (project_id, item_id) references public.moodboard_items(project_id, id) on delete cascade
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.wedding_projects(id) on delete cascade,
  item_type text not null,
  item_id uuid not null,
  body text not null check (length(trim(body)) > 0),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.guests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.wedding_projects(id) on delete cascade,
  name text not null,
  side text not null check (side in ('신랑측', '신부측')),
  relation text not null default '',
  attendance text not null default '미정' check (attendance in ('참석', '불참', '미정')),
  companions integer not null default 0 check (companions >= 0),
  invitation_sent boolean not null default false,
  notes text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.honeymoon_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.wedding_projects(id) on delete cascade,
  title text not null,
  item_type text not null default '일정',
  starts_on date,
  amount bigint not null default 0 check (amount >= 0),
  status text not null default '검토 중',
  notes text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shared_notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.wedding_projects(id) on delete cascade,
  title text not null,
  body text not null default '',
  category text not null default '메모',
  is_pinned boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.wedding_projects(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.wedding_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.wedding_projects(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('추가', '수정', '삭제')),
  entity_type text not null,
  entity_id uuid not null,
  summary text not null,
  created_at timestamptz not null default now()
);

create index tasks_project_due_idx on public.tasks(project_id, due_date);
create index events_project_start_idx on public.events(project_id, starts_at);
create index expenses_project_due_idx on public.expenses(project_id, due_date);
create index vendors_project_category_idx on public.vendors(project_id, category);
create index activity_logs_project_created_idx on public.activity_logs(project_id, created_at desc);
create index notifications_user_read_idx on public.notifications(user_id, read_at);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.stamp_created_by()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by = (select auth.uid());
  else
    new.created_by = old.created_by;
  end if;
  return new;
end;
$$;

create or replace function public.log_project_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  project uuid;
  row_id uuid;
  action_name text;
  row_title text;
  row_data jsonb;
begin
  if tg_op = 'DELETE' then
    row_data := to_jsonb(old);
  else
    row_data := to_jsonb(new);
  end if;
  project := (row_data->>'project_id')::uuid;
  row_id := (row_data->>'id')::uuid;
  action_name := case when tg_op = 'INSERT' then '추가' when tg_op = 'DELETE' then '삭제' else '수정' end;
  row_title := coalesce(row_data->>'title', tg_table_name);
  insert into public.activity_logs(project_id, actor_id, action, entity_type, entity_id, summary)
  values (project, (select auth.uid()), action_name, tg_table_name, row_id, row_title);
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger wedding_projects_updated_at before update on public.wedding_projects for each row execute function public.set_updated_at();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'tasks', 'events', 'budget_categories', 'expenses', 'vendors',
    'vendor_quotes', 'vendor_rating_criteria', 'contracts', 'payments',
    'moodboard_items', 'comments', 'guests', 'honeymoon_items',
    'shared_notes', 'attachments'
  ] loop
    execute format('create trigger %I_created_by before insert or update on public.%I for each row execute function public.stamp_created_by()', table_name, table_name);
  end loop;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'wedding_projects', 'project_members', 'project_initializations', 'tasks', 'events',
    'budget_categories', 'expenses', 'vendors', 'vendor_quotes',
    'vendor_rating_criteria', 'vendor_ratings', 'contracts', 'payments',
    'moodboard_items', 'moodboard_likes', 'comments', 'guests',
    'honeymoon_items', 'shared_notes', 'attachments', 'notifications',
    'activity_logs'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;

  foreach table_name in array array[
    'tasks', 'events', 'budget_categories', 'expenses', 'vendors',
    'vendor_quotes', 'vendor_rating_criteria', 'contracts',
    'payments', 'moodboard_items', 'comments', 'guests',
    'honeymoon_items', 'shared_notes', 'attachments'
  ] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_project_member(project_id))',
      table_name || '_member_select', table_name
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.is_project_member(project_id))',
      table_name || '_member_insert', table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.is_project_member(project_id)) with check (public.is_project_member(project_id))',
      table_name || '_member_update', table_name
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.is_project_member(project_id))',
      table_name || '_member_delete', table_name
    );
  end loop;
end;
$$;

create policy projects_member_select on public.wedding_projects for select to authenticated using (public.is_project_member(id));
create policy projects_member_update on public.wedding_projects for update to authenticated using (public.is_project_member(id)) with check (public.is_project_member(id));
create policy members_project_select on public.project_members for select to authenticated using (public.is_project_member(project_id));
create policy initialization_member_select on public.project_initializations for select to authenticated using (public.is_project_member(project_id));
create policy profiles_project_select on public.profiles for select to authenticated using (
  exists (select 1 from public.project_members pm where pm.user_id = profiles.id and public.is_project_member(pm.project_id))
);
create policy profiles_self_insert on public.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy profiles_self_update on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy ratings_self_select on public.vendor_ratings for select to authenticated using (user_id = (select auth.uid()) and public.is_project_member(project_id));
create policy ratings_member_select on public.vendor_ratings for select to authenticated using (public.is_project_member(project_id));
create policy ratings_self_insert on public.vendor_ratings for insert to authenticated with check (user_id = (select auth.uid()) and public.is_project_member(project_id));
create policy ratings_self_update on public.vendor_ratings for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and public.is_project_member(project_id));
create policy ratings_self_delete on public.vendor_ratings for delete to authenticated using (user_id = (select auth.uid()));
create policy likes_self_insert on public.moodboard_likes for insert to authenticated with check (
  user_id = (select auth.uid()) and public.is_project_member(project_id)
);
create policy likes_member_select on public.moodboard_likes for select to authenticated using (public.is_project_member(project_id));
create policy likes_self_delete on public.moodboard_likes for delete to authenticated using (user_id = (select auth.uid()));
create policy notifications_self_select on public.notifications for select to authenticated using (
  user_id = (select auth.uid()) and public.is_project_member(project_id)
);
create policy notifications_self_update on public.notifications for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy logs_member_select on public.activity_logs for select to authenticated using (public.is_project_member(project_id));

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'tasks', 'events', 'budget_categories', 'expenses', 'vendors',
    'vendor_quotes', 'vendor_rating_criteria', 'contracts',
    'vendor_ratings', 'payments', 'moodboard_items', 'comments', 'guests', 'honeymoon_items',
    'shared_notes', 'attachments'
  ] loop
    execute format('create trigger %I_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name, table_name);
    execute format('create trigger %I_activity after insert or update or delete on public.%I for each row execute function public.log_project_change()', table_name, table_name);
  end loop;
end;
$$;

create or replace function public.bootstrap_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger auth_user_profile after insert on auth.users for each row execute function public.bootstrap_profile();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wedding-private', 'wedding-private', false, 10485760, array['image/jpeg', 'image/webp', 'application/pdf'])
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg', 'image/webp', 'application/pdf'];

create policy wedding_storage_member_read on storage.objects for select to authenticated using (
  bucket_id = 'wedding-private'
  and public.is_project_member((storage.foldername(name))[1]::uuid)
);
create policy wedding_storage_member_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'wedding-private'
  and (storage.foldername(name))[1]::uuid in (
    select pm.project_id from public.project_members pm where pm.user_id = (select auth.uid())
  )
);
create policy wedding_storage_member_update on storage.objects for update to authenticated using (
  bucket_id = 'wedding-private'
  and public.is_project_member((storage.foldername(name))[1]::uuid)
) with check (
  bucket_id = 'wedding-private'
  and public.is_project_member((storage.foldername(name))[1]::uuid)
);
create policy wedding_storage_member_delete on storage.objects for delete to authenticated using (
  bucket_id = 'wedding-private'
  and public.is_project_member((storage.foldername(name))[1]::uuid)
);

alter publication supabase_realtime add table public.tasks, public.events, public.expenses, public.vendors, public.activity_logs;
