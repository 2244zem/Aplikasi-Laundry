drop policy if exists "Users and admins can read relevant orders" on public.tabel_order;
create policy "Users and admins can read relevant orders"
on public.tabel_order
for select
to authenticated
using (
    user_id = public.current_app_user_id()
    or admin_outlet_id = public.current_app_user_id()
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
    admin_outlet_id = public.current_app_user_id()
    and public.current_app_subscription_active()
)
with check (
    admin_outlet_id = public.current_app_user_id()
    and public.current_app_subscription_active()
);

drop policy if exists "Active admins can claim unassigned orders" on public.tabel_order;
create policy "Active admins can claim unassigned orders"
on public.tabel_order
for update
to authenticated
using (
    admin_outlet_id is null
    and public.current_app_subscription_active()
)
with check (
    admin_outlet_id = public.current_app_user_id()
    and public.current_app_subscription_active()
);
