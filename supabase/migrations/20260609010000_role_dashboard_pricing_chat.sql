alter table public.tabel_user
    add column if not exists outlet_is_open boolean not null default true,
    add column if not exists outlet_pickup_eta_minutes integer not null default 30
        check (outlet_pickup_eta_minutes >= 5 and outlet_pickup_eta_minutes <= 240),
    add column if not exists outlet_rating decimal(3,2) not null default 4.80
        check (outlet_rating >= 0 and outlet_rating <= 5),
    add column if not exists outlet_radius_km decimal(5,2) not null default 8.00
        check (outlet_radius_km >= 1 and outlet_radius_km <= 100);

alter table public.tabel_chat_message
    add column if not exists read_by_admin_at timestamptz,
    add column if not exists read_by_user_at timestamptz;

create index if not exists idx_tabel_chat_message_order_created_at
on public.tabel_chat_message(order_id, created_at desc);

create table if not exists public.tabel_service_pricing (
    id uuid primary key default gen_random_uuid(),
    admin_id uuid not null references public.tabel_user(id) on delete cascade,
    nama_layanan varchar(120) not null,
    deskripsi text,
    satuan varchar(20) not null default 'kg'
        check (satuan in ('kg', 'pcs', 'item')),
    harga decimal(12,2) not null
        check (harga >= 0),
    estimasi_menit integer not null default 1440
        check (estimasi_menit >= 30 and estimasi_menit <= 10080),
    aktif boolean not null default true,
    urutan integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_tabel_service_pricing_admin_active
on public.tabel_service_pricing(admin_id, aktif, urutan);

drop trigger if exists trg_tabel_service_pricing_updated_at on public.tabel_service_pricing;
create trigger trg_tabel_service_pricing_updated_at
before update on public.tabel_service_pricing
for each row execute function public.set_updated_at();

alter table public.tabel_service_pricing enable row level security;

drop policy if exists "Users can read active outlet pricing" on public.tabel_service_pricing;
create policy "Users can read active outlet pricing"
on public.tabel_service_pricing
for select
to authenticated
using (
    aktif = true
    and exists (
        select 1
        from public.tabel_user u
        where u.id = tabel_service_pricing.admin_id
          and u.role in ('ADMIN', 'SUPERADMIN')
          and (
            u.role = 'SUPERADMIN'
            or (
                u.status_langganan = 'ACTIVE'
                and (u.tgl_kadaluwarsa_langganan is null or u.tgl_kadaluwarsa_langganan > now())
            )
          )
    )
);

drop policy if exists "Active admins can manage own pricing" on public.tabel_service_pricing;
create policy "Active admins can manage own pricing"
on public.tabel_service_pricing
for all
to authenticated
using (
    admin_id = public.current_app_user_id()
    and public.current_app_subscription_active()
)
with check (
    admin_id = public.current_app_user_id()
    and public.current_app_subscription_active()
);

drop policy if exists "Order participants can mark chat read" on public.tabel_chat_message;
create policy "Order participants can mark chat read"
on public.tabel_chat_message
for update
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
)
with check (
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

do $$
begin
    alter publication supabase_realtime add table public.tabel_service_pricing;
exception
    when undefined_object or duplicate_object then null;
end;
$$;
