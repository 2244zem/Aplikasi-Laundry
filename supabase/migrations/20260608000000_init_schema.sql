create extension if not exists pgcrypto;

create table if not exists public.tabel_user (
    id uuid primary key default gen_random_uuid(),
    auth_user_id uuid unique references auth.users(id) on delete set null,
    nama varchar(100) not null,
    email varchar(100) unique not null,
    role varchar(20) not null default 'USER'
        check (role in ('USER', 'ADMIN', 'SUPERADMIN')),
    status_langganan varchar(20) not null default 'INACTIVE'
        check (status_langganan in ('ACTIVE', 'INACTIVE')),
    tgl_kadaluwarsa_langganan timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.tabel_order (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.tabel_user(id) on delete cascade,
    admin_outlet_id uuid references public.tabel_user(id) on delete set null,
    format_detail jsonb not null default '{}'::jsonb,
    berat_kg decimal(5,2) not null default 0.00,
    total_harga decimal(12,2) not null default 0.00,
    status_order varchar(30) not null default 'PENDING_CONFIRMATION'
        check (status_order in ('PENDING_CONFIRMATION', 'DITERIMA', 'DICUCI', 'DISETRIKA', 'SELESAI', 'DIBATALKAN')),
    status_pembayaran varchar(20) not null default 'UNPAID'
        check (status_pembayaran in ('UNPAID', 'PENDING', 'PAID', 'FAILED', 'REFUNDED')),
    midtrans_order_id varchar(100) unique,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.tabel_subscription (
    id uuid primary key default gen_random_uuid(),
    admin_user_id uuid not null references public.tabel_user(id) on delete cascade,
    midtrans_subscription_id varchar(150) unique,
    status varchar(20) not null default 'INACTIVE'
        check (status in ('ACTIVE', 'INACTIVE', 'PENDING', 'CANCELED', 'EXPIRED')),
    amount decimal(12,2) not null default 500000.00,
    current_period_start timestamptz,
    current_period_end timestamptz,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.tabel_payment_event (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references public.tabel_user(id) on delete set null,
    order_id uuid references public.tabel_order(id) on delete set null,
    midtrans_order_id varchar(100),
    midtrans_transaction_id varchar(150),
    transaction_status varchar(50),
    payment_type varchar(50),
    gross_amount decimal(12,2),
    payload jsonb not null,
    verified_at timestamptz not null default now()
);

create table if not exists public.tabel_chat_message (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references public.tabel_order(id) on delete cascade,
    sender_user_id uuid not null references public.tabel_user(id) on delete cascade,
    receiver_user_id uuid references public.tabel_user(id) on delete set null,
    message text not null,
    created_at timestamptz not null default now()
);

create index if not exists idx_tabel_order_user_id on public.tabel_order(user_id);
create index if not exists idx_tabel_order_admin_outlet_id on public.tabel_order(admin_outlet_id);
create index if not exists idx_tabel_order_status_order on public.tabel_order(status_order);
create index if not exists idx_tabel_chat_message_order_id on public.tabel_chat_message(order_id);
create index if not exists idx_tabel_payment_event_midtrans_order_id on public.tabel_payment_event(midtrans_order_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_tabel_user_updated_at on public.tabel_user;
create trigger trg_tabel_user_updated_at
before update on public.tabel_user
for each row execute function public.set_updated_at();

drop trigger if exists trg_tabel_order_updated_at on public.tabel_order;
create trigger trg_tabel_order_updated_at
before update on public.tabel_order
for each row execute function public.set_updated_at();

drop trigger if exists trg_tabel_subscription_updated_at on public.tabel_subscription;
create trigger trg_tabel_subscription_updated_at
before update on public.tabel_subscription
for each row execute function public.set_updated_at();

create or replace function public.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
    select id from public.tabel_user where auth_user_id = auth.uid() limit 1;
$$;

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
    select role from public.tabel_user where auth_user_id = auth.uid() limit 1;
$$;

create or replace function public.current_app_subscription_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(
        exists (
            select 1
            from public.tabel_user
            where auth_user_id = auth.uid()
              and role in ('ADMIN', 'SUPERADMIN')
              and (
                role = 'SUPERADMIN'
                or (
                    status_langganan = 'ACTIVE'
                    and (tgl_kadaluwarsa_langganan is null or tgl_kadaluwarsa_langganan > now())
                )
              )
        ),
        false
    );
$$;

grant execute on function public.current_app_user_id() to anon, authenticated;
grant execute on function public.current_app_role() to anon, authenticated;
grant execute on function public.current_app_subscription_active() to anon, authenticated;

alter table public.tabel_user enable row level security;
alter table public.tabel_order enable row level security;
alter table public.tabel_subscription enable row level security;
alter table public.tabel_payment_event enable row level security;
alter table public.tabel_chat_message enable row level security;

drop policy if exists "Users can read relevant profiles" on public.tabel_user;
create policy "Users can read relevant profiles"
on public.tabel_user
for select
to authenticated
using (
    auth.uid() = auth_user_id
    or public.current_app_role() in ('ADMIN', 'SUPERADMIN')
);

drop policy if exists "Users can create own profile" on public.tabel_user;
create policy "Users can create own profile"
on public.tabel_user
for insert
to authenticated
with check (auth.uid() = auth_user_id);

drop policy if exists "Users and admins can read relevant orders" on public.tabel_order;
create policy "Users and admins can read relevant orders"
on public.tabel_order
for select
to authenticated
using (
    user_id = public.current_app_user_id()
    or admin_outlet_id = public.current_app_user_id()
    or public.current_app_role() = 'SUPERADMIN'
);

drop policy if exists "Users can create own orders" on public.tabel_order;
create policy "Users can create own orders"
on public.tabel_order
for insert
to authenticated
with check (user_id = public.current_app_user_id());

drop policy if exists "Active admins can update assigned orders" on public.tabel_order;
create policy "Active admins can update assigned orders"
on public.tabel_order
for update
to authenticated
using (
    admin_outlet_id = public.current_app_user_id()
    and public.current_app_subscription_active()
)
with check (
    admin_outlet_id = public.current_app_user_id()
    and public.current_app_subscription_active()
);

drop policy if exists "Users can read own subscription" on public.tabel_subscription;
create policy "Users can read own subscription"
on public.tabel_subscription
for select
to authenticated
using (
    admin_user_id = public.current_app_user_id()
    or public.current_app_role() = 'SUPERADMIN'
);

drop policy if exists "Order participants can read chat" on public.tabel_chat_message;
create policy "Order participants can read chat"
on public.tabel_chat_message
for select
to authenticated
using (
    exists (
        select 1
        from public.tabel_order o
        where o.id = tabel_chat_message.order_id
          and (
            o.user_id = public.current_app_user_id()
            or o.admin_outlet_id = public.current_app_user_id()
            or public.current_app_role() = 'SUPERADMIN'
          )
    )
);

drop policy if exists "Order participants can send chat" on public.tabel_chat_message;
create policy "Order participants can send chat"
on public.tabel_chat_message
for insert
to authenticated
with check (
    sender_user_id = public.current_app_user_id()
    and exists (
        select 1
        from public.tabel_order o
        where o.id = tabel_chat_message.order_id
          and (
            o.user_id = public.current_app_user_id()
            or o.admin_outlet_id = public.current_app_user_id()
          )
    )
);

do $$
begin
    alter publication supabase_realtime add table public.tabel_order;
exception
    when undefined_object or duplicate_object then null;
end;
$$;

do $$
begin
    alter publication supabase_realtime add table public.tabel_chat_message;
exception
    when undefined_object or duplicate_object then null;
end;
$$;
