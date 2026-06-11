-- Production readiness hardening:
-- align staff RLS with outlet-scoped chat read receipts, proof uploads, and pricing management.

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
            or (
                o.admin_outlet_id = public.current_operator_outlet_id()
                and public.current_operator_active()
            )
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
            or (
                o.admin_outlet_id = public.current_operator_outlet_id()
                and public.current_operator_active()
            )
            or public.current_app_role() = 'SUPERADMIN'
          )
    )
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
            or (
                o.admin_outlet_id = public.current_operator_outlet_id()
                and public.current_operator_active()
            )
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
            or (
                o.admin_outlet_id = public.current_operator_outlet_id()
                and public.current_operator_active()
            )
            or public.current_app_role() = 'SUPERADMIN'
          )
    )
);

drop policy if exists "Active admins can manage own pricing" on public.tabel_service_pricing;
create policy "Active admins can manage own pricing"
on public.tabel_service_pricing
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

drop policy if exists "Active admins can assign outlet staff" on public.tabel_user;
create policy "Active admins can assign outlet staff"
on public.tabel_user
for update
to authenticated
using (
    (
        role = 'USER'
        and (
            staff_outlet_id is null
            or staff_outlet_id = public.current_operator_outlet_id()
        )
        and public.current_operator_active()
        and coalesce(public.current_staff_role(), 'OWNER') = 'OWNER'
    )
    or public.current_app_role() = 'SUPERADMIN'
)
with check (
    auth.uid() = auth_user_id
    or public.current_app_role() = 'SUPERADMIN'
    or (
        role = 'USER'
        and (
            (
                staff_outlet_id = public.current_operator_outlet_id()
                and staff_role in ('OWNER', 'KASIR', 'TUKANG_CUCI')
            )
            or (
                staff_outlet_id is null
                and staff_role is null
            )
        )
        and public.current_operator_active()
        and coalesce(public.current_staff_role(), 'OWNER') = 'OWNER'
    )
);

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
            or (
                o.admin_outlet_id = public.current_operator_outlet_id()
                and public.current_operator_active()
            )
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
            or (
                o.admin_outlet_id = public.current_operator_outlet_id()
                and public.current_operator_active()
            )
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
            or (
                o.admin_outlet_id = public.current_operator_outlet_id()
                and public.current_operator_active()
            )
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
            or (
                o.admin_outlet_id = public.current_operator_outlet_id()
                and public.current_operator_active()
            )
            or public.current_app_role() = 'SUPERADMIN'
          )
    )
);
