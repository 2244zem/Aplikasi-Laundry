create table if not exists public.tabel_inventory_item (
    id uuid primary key default gen_random_uuid(),
    admin_id uuid not null references public.tabel_user(id) on delete cascade,
    nama_barang varchar(120) not null,
    kategori varchar(60) not null default 'OPERASIONAL',
    stok decimal(12,2) not null default 0
        check (stok >= 0),
    satuan varchar(30) not null default 'unit',
    stok_minimum decimal(12,2) not null default 0
        check (stok_minimum >= 0),
    catatan text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_tabel_inventory_item_admin_updated_at
on public.tabel_inventory_item(admin_id, updated_at desc);

drop trigger if exists trg_tabel_inventory_item_updated_at on public.tabel_inventory_item;
create trigger trg_tabel_inventory_item_updated_at
before update on public.tabel_inventory_item
for each row execute function public.set_updated_at();

alter table public.tabel_inventory_item enable row level security;

drop policy if exists "Active admins can read own inventory" on public.tabel_inventory_item;
create policy "Active admins can read own inventory"
on public.tabel_inventory_item
for select
to authenticated
using (
    admin_id = public.current_app_user_id()
    or public.current_app_role() = 'SUPERADMIN'
);

drop policy if exists "Active admins can create own inventory" on public.tabel_inventory_item;
create policy "Active admins can create own inventory"
on public.tabel_inventory_item
for insert
to authenticated
with check (
    admin_id = public.current_app_user_id()
    and public.current_app_subscription_active()
);

drop policy if exists "Active admins can update own inventory" on public.tabel_inventory_item;
create policy "Active admins can update own inventory"
on public.tabel_inventory_item
for update
to authenticated
using (
    admin_id = public.current_app_user_id()
    and public.current_app_subscription_active()
)
with check (
    admin_id = public.current_app_user_id()
    and public.current_app_subscription_active()
);

drop policy if exists "Active admins can delete own inventory" on public.tabel_inventory_item;
create policy "Active admins can delete own inventory"
on public.tabel_inventory_item
for delete
to authenticated
using (
    admin_id = public.current_app_user_id()
    and public.current_app_subscription_active()
);

do $$
begin
    alter publication supabase_realtime add table public.tabel_inventory_item;
exception
    when undefined_object or duplicate_object then null;
end;
$$;
