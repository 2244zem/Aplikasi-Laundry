alter table public.tabel_user
    add column if not exists staff_role varchar(30)
        check (staff_role in ('OWNER', 'KASIR', 'TUKANG_CUCI')),
    add column if not exists staff_outlet_id uuid references public.tabel_user(id) on delete set null;

alter table public.tabel_order
    add column if not exists qr_token uuid not null default gen_random_uuid(),
    add column if not exists qr_label_printed_at timestamptz;

create unique index if not exists idx_tabel_order_qr_token
on public.tabel_order(qr_token);

create index if not exists idx_tabel_user_staff_outlet
on public.tabel_user(staff_outlet_id, staff_role);

create or replace function public.prevent_self_privilege_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if auth.uid() = old.auth_user_id
       and (
          old.role is distinct from new.role
          or old.status_langganan is distinct from new.status_langganan
          or old.tgl_kadaluwarsa_langganan is distinct from new.tgl_kadaluwarsa_langganan
          or old.staff_role is distinct from new.staff_role
          or old.staff_outlet_id is distinct from new.staff_outlet_id
       )
       and public.current_app_role() <> 'SUPERADMIN' then
        raise exception 'Privilege fields cannot be changed by the same user.';
    end if;

    return new;
end;
$$;

drop trigger if exists trg_prevent_self_privilege_update on public.tabel_user;
create trigger trg_prevent_self_privilege_update
before update on public.tabel_user
for each row execute function public.prevent_self_privilege_update();

create or replace function public.current_staff_outlet_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
    select staff_outlet_id
    from public.tabel_user
    where auth_user_id = auth.uid()
      and staff_outlet_id is not null
    limit 1;
$$;

create or replace function public.current_staff_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
    select staff_role
    from public.tabel_user
    where auth_user_id = auth.uid()
      and staff_outlet_id is not null
    limit 1;
$$;

create or replace function public.current_operator_outlet_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(
        case
            when u.role in ('ADMIN', 'SUPERADMIN') then u.id
            else u.staff_outlet_id
        end,
        u.id
    )
    from public.tabel_user u
    where u.auth_user_id = auth.uid()
    limit 1;
$$;

create or replace function public.current_operator_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(
        public.current_app_subscription_active()
        or exists (
            select 1
            from public.tabel_user staff
            join public.tabel_user owner on owner.id = staff.staff_outlet_id
            where staff.auth_user_id = auth.uid()
              and staff.staff_role in ('OWNER', 'KASIR', 'TUKANG_CUCI')
              and owner.role in ('ADMIN', 'SUPERADMIN')
              and (
                owner.role = 'SUPERADMIN'
                or (
                    owner.status_langganan = 'ACTIVE'
                    and (owner.tgl_kadaluwarsa_langganan is null or owner.tgl_kadaluwarsa_langganan > now())
                )
              )
        ),
        false
    );
$$;

grant execute on function public.current_staff_outlet_id() to anon, authenticated;
grant execute on function public.current_staff_role() to anon, authenticated;
grant execute on function public.current_operator_outlet_id() to anon, authenticated;
grant execute on function public.current_operator_active() to anon, authenticated;

drop policy if exists "Users and admins can read relevant orders" on public.tabel_order;
create policy "Users and admins can read relevant orders"
on public.tabel_order
for select
to authenticated
using (
    user_id = public.current_app_user_id()
    or admin_outlet_id = public.current_app_user_id()
    or (
        admin_outlet_id = public.current_staff_outlet_id()
        and public.current_operator_active()
    )
    or (
        admin_outlet_id is null
        and public.current_app_subscription_active()
    )
    or public.current_app_role() = 'SUPERADMIN'
);

drop policy if exists "Active admins can update assigned orders" on public.tabel_order;
create policy "Active admins can update assigned orders"
on public.tabel_order
for update
to authenticated
using (
    (
        admin_outlet_id = public.current_app_user_id()
        and public.current_app_subscription_active()
    )
    or (
        admin_outlet_id = public.current_staff_outlet_id()
        and public.current_operator_active()
    )
    or public.current_app_role() = 'SUPERADMIN'
)
with check (
    (
        admin_outlet_id = public.current_app_user_id()
        and public.current_app_subscription_active()
    )
    or (
        admin_outlet_id = public.current_staff_outlet_id()
        and public.current_operator_active()
    )
    or public.current_app_role() = 'SUPERADMIN'
);

drop policy if exists "Active admins can assign outlet staff" on public.tabel_user;
create policy "Active admins can assign outlet staff"
on public.tabel_user
for update
to authenticated
using (
    public.current_app_subscription_active()
    or public.current_app_role() = 'SUPERADMIN'
)
with check (
    auth.uid() = auth_user_id
    or public.current_app_role() = 'SUPERADMIN'
    or (
        role = 'USER'
        and staff_outlet_id = public.current_app_user_id()
        and staff_role in ('OWNER', 'KASIR', 'TUKANG_CUCI')
    )
);

drop policy if exists "Active admins can read own inventory" on public.tabel_inventory_item;
create policy "Active admins can read own inventory"
on public.tabel_inventory_item
for select
to authenticated
using (
    admin_id = public.current_operator_outlet_id()
    and public.current_operator_active()
);

drop policy if exists "Active admins can create own inventory" on public.tabel_inventory_item;
create policy "Active admins can create own inventory"
on public.tabel_inventory_item
for insert
to authenticated
with check (
    admin_id = public.current_operator_outlet_id()
    and public.current_operator_active()
    and coalesce(public.current_staff_role(), 'OWNER') in ('OWNER', 'KASIR')
);

drop policy if exists "Active admins can update own inventory" on public.tabel_inventory_item;
create policy "Active admins can update own inventory"
on public.tabel_inventory_item
for update
to authenticated
using (
    admin_id = public.current_operator_outlet_id()
    and public.current_operator_active()
    and coalesce(public.current_staff_role(), 'OWNER') in ('OWNER', 'KASIR')
)
with check (
    admin_id = public.current_operator_outlet_id()
    and public.current_operator_active()
    and coalesce(public.current_staff_role(), 'OWNER') in ('OWNER', 'KASIR')
);

drop policy if exists "Active admins can delete own inventory" on public.tabel_inventory_item;
create policy "Active admins can delete own inventory"
on public.tabel_inventory_item
for delete
to authenticated
using (
    admin_id = public.current_operator_outlet_id()
    and public.current_operator_active()
    and coalesce(public.current_staff_role(), 'OWNER') in ('OWNER', 'KASIR')
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
            or o.admin_outlet_id = public.current_staff_outlet_id()
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
            or o.admin_outlet_id = public.current_staff_outlet_id()
          )
    )
);

create table if not exists public.tabel_inventory_usage_rule (
    id uuid primary key default gen_random_uuid(),
    admin_id uuid not null references public.tabel_user(id) on delete cascade,
    inventory_item_id uuid not null references public.tabel_inventory_item(id) on delete cascade,
    service_id uuid references public.tabel_service_pricing(id) on delete set null,
    konsumsi_per_kg decimal(12,3) not null default 0
        check (konsumsi_per_kg >= 0),
    konsumsi_per_order decimal(12,3) not null default 0
        check (konsumsi_per_order >= 0),
    aktif boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.tabel_inventory_movement (
    id uuid primary key default gen_random_uuid(),
    admin_id uuid not null references public.tabel_user(id) on delete cascade,
    inventory_item_id uuid not null references public.tabel_inventory_item(id) on delete cascade,
    order_id uuid references public.tabel_order(id) on delete set null,
    movement_type varchar(40) not null default 'MANUAL'
        check (movement_type in ('MANUAL', 'AUTO_DEDUCTION', 'ADJUSTMENT')),
    qty_delta decimal(12,3) not null,
    stok_setelah decimal(12,3),
    catatan text,
    created_at timestamptz not null default now()
);

create index if not exists idx_inventory_usage_rule_admin
on public.tabel_inventory_usage_rule(admin_id, aktif);

create index if not exists idx_inventory_movement_admin_created
on public.tabel_inventory_movement(admin_id, created_at desc);

create unique index if not exists idx_inventory_movement_auto_order_item
on public.tabel_inventory_movement(order_id, inventory_item_id)
where movement_type = 'AUTO_DEDUCTION';

drop trigger if exists trg_tabel_inventory_usage_rule_updated_at on public.tabel_inventory_usage_rule;
create trigger trg_tabel_inventory_usage_rule_updated_at
before update on public.tabel_inventory_usage_rule
for each row execute function public.set_updated_at();

alter table public.tabel_inventory_usage_rule enable row level security;
alter table public.tabel_inventory_movement enable row level security;

drop policy if exists "Active admins can manage own inventory rules" on public.tabel_inventory_usage_rule;
create policy "Active admins can manage own inventory rules"
on public.tabel_inventory_usage_rule
for all
to authenticated
using (
    admin_id = public.current_operator_outlet_id()
    and public.current_operator_active()
    and coalesce(public.current_staff_role(), 'OWNER') in ('OWNER', 'KASIR')
)
with check (
    admin_id = public.current_operator_outlet_id()
    and public.current_operator_active()
    and coalesce(public.current_staff_role(), 'OWNER') in ('OWNER', 'KASIR')
);

drop policy if exists "Outlet operators can read own inventory movements" on public.tabel_inventory_movement;
create policy "Outlet operators can read own inventory movements"
on public.tabel_inventory_movement
for select
to authenticated
using (
    admin_id = public.current_operator_outlet_id()
    and public.current_operator_active()
);

drop policy if exists "Active admins can create own inventory movements" on public.tabel_inventory_movement;
create policy "Active admins can create own inventory movements"
on public.tabel_inventory_movement
for insert
to authenticated
with check (
    admin_id = public.current_operator_outlet_id()
    and public.current_operator_active()
    and coalesce(public.current_staff_role(), 'OWNER') in ('OWNER', 'KASIR')
);

create table if not exists public.tabel_order_event (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references public.tabel_order(id) on delete cascade,
    actor_user_id uuid references public.tabel_user(id) on delete set null,
    event_type varchar(60) not null,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists idx_order_event_order_created
on public.tabel_order_event(order_id, created_at desc);

alter table public.tabel_order_event enable row level security;

drop policy if exists "Order participants can read events" on public.tabel_order_event;
create policy "Order participants can read events"
on public.tabel_order_event
for select
to authenticated
using (
    exists (
        select 1
        from public.tabel_order o
        where o.id = tabel_order_event.order_id
          and (
            o.user_id = public.current_app_user_id()
            or o.admin_outlet_id = public.current_operator_outlet_id()
            or public.current_app_role() = 'SUPERADMIN'
          )
    )
);

create or replace function public.log_order_status_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if old.status_order is distinct from new.status_order then
        insert into public.tabel_order_event(order_id, actor_user_id, event_type, metadata)
        values (
            new.id,
            public.current_app_user_id(),
            'STATUS_CHANGED',
            jsonb_build_object('from', old.status_order, 'to', new.status_order)
        );
    end if;

    return new;
end;
$$;

drop trigger if exists trg_order_status_event on public.tabel_order;
create trigger trg_order_status_event
after update of status_order on public.tabel_order
for each row execute function public.log_order_status_event();

create or replace function public.apply_inventory_deduction_on_done()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    rule_row record;
    usage_qty decimal(12,3);
    next_stock decimal(12,3);
    movement_id uuid;
    detail_service_id uuid;
begin
    if new.status_order <> 'SELESAI' or old.status_order = 'SELESAI' or new.admin_outlet_id is null then
        return new;
    end if;

    begin
        detail_service_id := nullif(new.format_detail ->> 'service_id', '')::uuid;
    exception
        when others then
            detail_service_id := null;
    end;

    for rule_row in
        select r.*, i.stok
        from public.tabel_inventory_usage_rule r
        join public.tabel_inventory_item i on i.id = r.inventory_item_id
        where r.admin_id = new.admin_outlet_id
          and r.aktif = true
          and (r.service_id is null or r.service_id = detail_service_id)
    loop
        usage_qty := coalesce(rule_row.konsumsi_per_order, 0) + coalesce(rule_row.konsumsi_per_kg, 0) * greatest(coalesce(new.berat_kg, 0), 0);

        if usage_qty > 0 then
            insert into public.tabel_inventory_movement(
                admin_id,
                inventory_item_id,
                order_id,
                movement_type,
                qty_delta,
                catatan
            )
            values (
                new.admin_outlet_id,
                rule_row.inventory_item_id,
                new.id,
                'AUTO_DEDUCTION',
                usage_qty * -1,
                'Auto deduct ketika order selesai'
            )
            on conflict do nothing
            returning id into movement_id;

            if movement_id is not null then
                update public.tabel_inventory_item
                set stok = greatest(stok - usage_qty, 0)
                where id = rule_row.inventory_item_id
                returning stok into next_stock;

                update public.tabel_inventory_movement
                set stok_setelah = next_stock
                where id = movement_id;
            end if;
        end if;
    end loop;

    return new;
end;
$$;

drop trigger if exists trg_inventory_deduction_on_done on public.tabel_order;
create trigger trg_inventory_deduction_on_done
after update of status_order on public.tabel_order
for each row execute function public.apply_inventory_deduction_on_done();

create table if not exists public.tabel_courier_location (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references public.tabel_order(id) on delete cascade,
    courier_user_id uuid references public.tabel_user(id) on delete set null,
    latitude decimal(10,7) not null,
    longitude decimal(10,7) not null,
    heading decimal(6,2),
    speed_kmh decimal(8,2),
    updated_at timestamptz not null default now(),
    unique(order_id)
);

create index if not exists idx_courier_location_order
on public.tabel_courier_location(order_id, updated_at desc);

drop trigger if exists trg_tabel_courier_location_updated_at on public.tabel_courier_location;
create trigger trg_tabel_courier_location_updated_at
before update on public.tabel_courier_location
for each row execute function public.set_updated_at();

alter table public.tabel_courier_location enable row level security;

drop policy if exists "Order participants can read courier location" on public.tabel_courier_location;
create policy "Order participants can read courier location"
on public.tabel_courier_location
for select
to authenticated
using (
    exists (
        select 1
        from public.tabel_order o
        where o.id = tabel_courier_location.order_id
          and (
            o.user_id = public.current_app_user_id()
            or o.admin_outlet_id = public.current_operator_outlet_id()
            or public.current_app_role() = 'SUPERADMIN'
          )
    )
);

drop policy if exists "Outlet operators can upsert courier location" on public.tabel_courier_location;
create policy "Outlet operators can upsert courier location"
on public.tabel_courier_location
for all
to authenticated
using (
    exists (
        select 1
        from public.tabel_order o
        where o.id = tabel_courier_location.order_id
          and o.admin_outlet_id = public.current_operator_outlet_id()
          and public.current_operator_active()
          and coalesce(public.current_staff_role(), 'OWNER') in ('OWNER', 'KASIR')
    )
)
with check (
    exists (
        select 1
        from public.tabel_order o
        where o.id = tabel_courier_location.order_id
          and o.admin_outlet_id = public.current_operator_outlet_id()
          and public.current_operator_active()
          and coalesce(public.current_staff_role(), 'OWNER') in ('OWNER', 'KASIR')
    )
);

create table if not exists public.tabel_customer_retention_queue (
    id uuid primary key default gen_random_uuid(),
    admin_id uuid not null references public.tabel_user(id) on delete cascade,
    user_id uuid not null references public.tabel_user(id) on delete cascade,
    last_order_at timestamptz,
    suggested_message text not null,
    status varchar(20) not null default 'PENDING'
        check (status in ('PENDING', 'SENT', 'SKIPPED', 'FAILED')),
    sent_at timestamptz,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_retention_queue_admin_status
on public.tabel_customer_retention_queue(admin_id, status, created_at desc);

create unique index if not exists idx_retention_queue_pending_unique
on public.tabel_customer_retention_queue(admin_id, user_id, status)
where status = 'PENDING';

drop trigger if exists trg_customer_retention_queue_updated_at on public.tabel_customer_retention_queue;
create trigger trg_customer_retention_queue_updated_at
before update on public.tabel_customer_retention_queue
for each row execute function public.set_updated_at();

alter table public.tabel_customer_retention_queue enable row level security;

drop policy if exists "Active admins can manage retention queue" on public.tabel_customer_retention_queue;
create policy "Active admins can manage retention queue"
on public.tabel_customer_retention_queue
for all
to authenticated
using (
    admin_id = public.current_operator_outlet_id()
    and public.current_operator_active()
    and coalesce(public.current_staff_role(), 'OWNER') = 'OWNER'
)
with check (
    admin_id = public.current_operator_outlet_id()
    and public.current_operator_active()
    and coalesce(public.current_staff_role(), 'OWNER') = 'OWNER'
);

do $$
begin
    alter publication supabase_realtime add table public.tabel_inventory_movement;
exception
    when undefined_object or duplicate_object then null;
end;
$$;

do $$
begin
    alter publication supabase_realtime add table public.tabel_order_event;
exception
    when undefined_object or duplicate_object then null;
end;
$$;

do $$
begin
    alter publication supabase_realtime add table public.tabel_courier_location;
exception
    when undefined_object or duplicate_object then null;
end;
$$;

do $$
begin
    alter publication supabase_realtime add table public.tabel_customer_retention_queue;
exception
    when undefined_object or duplicate_object then null;
end;
$$;
