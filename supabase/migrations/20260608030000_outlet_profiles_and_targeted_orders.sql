alter table public.tabel_user
    add column if not exists nama_toko varchar(120),
    add column if not exists alamat_toko text,
    add column if not exists outlet_latitude decimal(10,7),
    add column if not exists outlet_longitude decimal(10,7),
    add column if not exists flyer_title varchar(120),
    add column if not exists flyer_body text,
    add column if not exists flyer_accent varchar(20) default '#20bdd6',
    add column if not exists flyer_discount_label varchar(60);

drop policy if exists "Users can read active outlet profiles" on public.tabel_user;
create policy "Users can read active outlet profiles"
on public.tabel_user
for select
to authenticated
using (
    role in ('ADMIN', 'SUPERADMIN')
    and (
        role = 'SUPERADMIN'
        or (
            status_langganan = 'ACTIVE'
            and (tgl_kadaluwarsa_langganan is null or tgl_kadaluwarsa_langganan > now())
        )
    )
);

drop policy if exists "Users can update own profile" on public.tabel_user;
create policy "Users can update own profile"
on public.tabel_user
for update
to authenticated
using (auth.uid() = auth_user_id)
with check (auth.uid() = auth_user_id);
