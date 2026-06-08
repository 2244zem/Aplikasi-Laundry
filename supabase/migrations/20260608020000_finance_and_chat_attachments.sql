create table if not exists public.tabel_pengeluaran (
    id uuid primary key default gen_random_uuid(),
    admin_id uuid not null references public.tabel_user(id) on delete cascade,
    kategori varchar(50) not null
        check (kategori in ('SABUN', 'PARFUM', 'LISTRIK', 'GAJI', 'SEWA', 'MAINTENANCE', 'LAINNYA')),
    nominal decimal(12,2) not null
        check (nominal >= 0),
    keterangan text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.tabel_neraca_bulanan (
    id uuid primary key default gen_random_uuid(),
    admin_id uuid not null references public.tabel_user(id) on delete cascade,
    bulan_tahun varchar(7) not null
        check (bulan_tahun ~ '^[0-9]{4}-[0-9]{2}$'),
    total_pendapatan_kotor decimal(12,2) not null default 0.00,
    total_pengeluaran decimal(12,2) not null default 0.00,
    pendapatan_bersih decimal(12,2) not null default 0.00,
    updated_at timestamptz not null default now(),
    unique (admin_id, bulan_tahun)
);

create index if not exists idx_tabel_pengeluaran_admin_created_at
on public.tabel_pengeluaran(admin_id, created_at);

create index if not exists idx_tabel_neraca_bulanan_admin_period
on public.tabel_neraca_bulanan(admin_id, bulan_tahun);

drop trigger if exists trg_tabel_pengeluaran_updated_at on public.tabel_pengeluaran;
create trigger trg_tabel_pengeluaran_updated_at
before update on public.tabel_pengeluaran
for each row execute function public.set_updated_at();

alter table public.tabel_chat_message
    alter column message drop not null,
    alter column message set default '';

alter table public.tabel_chat_message
    add column if not exists attachment_url text,
    add column if not exists attachment_path text,
    add column if not exists attachment_mime_type varchar(100);

create index if not exists idx_tabel_chat_message_sender_user_id
on public.tabel_chat_message(sender_user_id);

alter table public.tabel_pengeluaran enable row level security;
alter table public.tabel_neraca_bulanan enable row level security;

drop policy if exists "Active admins can read own expenses" on public.tabel_pengeluaran;
create policy "Active admins can read own expenses"
on public.tabel_pengeluaran
for select
to authenticated
using (
    admin_id = public.current_app_user_id()
    or public.current_app_role() = 'SUPERADMIN'
);

drop policy if exists "Active admins can create own expenses" on public.tabel_pengeluaran;
create policy "Active admins can create own expenses"
on public.tabel_pengeluaran
for insert
to authenticated
with check (
    admin_id = public.current_app_user_id()
    and public.current_app_subscription_active()
);

drop policy if exists "Active admins can update own expenses" on public.tabel_pengeluaran;
create policy "Active admins can update own expenses"
on public.tabel_pengeluaran
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

drop policy if exists "Active admins can delete own expenses" on public.tabel_pengeluaran;
create policy "Active admins can delete own expenses"
on public.tabel_pengeluaran
for delete
to authenticated
using (
    admin_id = public.current_app_user_id()
    and public.current_app_subscription_active()
);

drop policy if exists "Admins can read own monthly balance" on public.tabel_neraca_bulanan;
create policy "Admins can read own monthly balance"
on public.tabel_neraca_bulanan
for select
to authenticated
using (
    admin_id = public.current_app_user_id()
    or public.current_app_role() = 'SUPERADMIN'
);

create or replace function public.storage_object_order_id(object_name text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    order_id uuid;
begin
    order_id := split_part(object_name, '/', 1)::uuid;
    return order_id;
exception
    when others then
        return null;
end;
$$;

grant execute on function public.storage_object_order_id(text) to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'bukti-cucian',
    'bukti-cucian',
    true,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can read laundry proof images" on storage.objects;
create policy "Public can read laundry proof images"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'bukti-cucian');

drop policy if exists "Order participants can upload laundry proof images" on storage.objects;
create policy "Order participants can upload laundry proof images"
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'bukti-cucian'
    and exists (
        select 1
        from public.tabel_order o
        where o.id = public.storage_object_order_id(storage.objects.name)
          and (
            o.user_id = public.current_app_user_id()
            or o.admin_outlet_id = public.current_app_user_id()
            or public.current_app_role() = 'SUPERADMIN'
          )
    )
);

drop policy if exists "Order participants can update laundry proof images" on storage.objects;
create policy "Order participants can update laundry proof images"
on storage.objects
for update
to authenticated
using (
    bucket_id = 'bukti-cucian'
    and exists (
        select 1
        from public.tabel_order o
        where o.id = public.storage_object_order_id(storage.objects.name)
          and (
            o.user_id = public.current_app_user_id()
            or o.admin_outlet_id = public.current_app_user_id()
            or public.current_app_role() = 'SUPERADMIN'
          )
    )
)
with check (
    bucket_id = 'bukti-cucian'
    and exists (
        select 1
        from public.tabel_order o
        where o.id = public.storage_object_order_id(storage.objects.name)
          and (
            o.user_id = public.current_app_user_id()
            or o.admin_outlet_id = public.current_app_user_id()
            or public.current_app_role() = 'SUPERADMIN'
          )
    )
);

drop policy if exists "Order participants can delete laundry proof images" on storage.objects;
create policy "Order participants can delete laundry proof images"
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'bukti-cucian'
    and exists (
        select 1
        from public.tabel_order o
        where o.id = public.storage_object_order_id(storage.objects.name)
          and (
            o.user_id = public.current_app_user_id()
            or o.admin_outlet_id = public.current_app_user_id()
            or public.current_app_role() = 'SUPERADMIN'
          )
    )
);
