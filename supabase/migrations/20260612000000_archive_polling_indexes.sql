create index if not exists idx_tabel_order_event_archive_poll
on public.tabel_order_event(created_at, id);

create index if not exists idx_tabel_chat_message_archive_poll
on public.tabel_chat_message(created_at, id);

create index if not exists idx_tabel_payment_event_archive_poll
on public.tabel_payment_event(verified_at, id)
where order_id is not null;

create or replace function public.log_order_created_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.tabel_order_event(order_id, actor_user_id, event_type, metadata)
    values (
        new.id,
        new.user_id,
        'ORDER_CREATED',
        jsonb_build_object(
            'status_order', new.status_order,
            'status_pembayaran', new.status_pembayaran,
            'admin_outlet_id', new.admin_outlet_id,
            'total_harga', new.total_harga
        )
    );

    return new;
end;
$$;

drop trigger if exists trg_order_created_event on public.tabel_order;
create trigger trg_order_created_event
after insert on public.tabel_order
for each row execute function public.log_order_created_event();
