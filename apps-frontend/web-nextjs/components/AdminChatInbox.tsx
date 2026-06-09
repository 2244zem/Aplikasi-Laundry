'use client';

import { useEffect, useMemo, useState } from 'react';
import { InteractiveChatLaundry } from '@/components/InteractiveChatLaundry';
import { ListSkeleton } from '@/components/Skeleton';
import { canOperateOrders, operatorOutletId } from '@/lib/access';
import { supabase } from '@/lib/supabaseClient';
import type { ChatMessage, LaundryOrder, UserProfile } from '@/lib/types';

type Props = {
  profile: UserProfile;
};

type InboxFilter = 'ALL' | 'UNREAD' | 'ACTIVE';

const quickStatuses: LaundryOrder['status_order'][] = ['DITERIMA', 'DICUCI', 'DISETRIKA', 'SELESAI'];

function isActiveOrder(order: LaundryOrder) {
  return order.status_order !== 'SELESAI' && order.status_order !== 'DIBATALKAN';
}

function messagePreview(message: ChatMessage | undefined) {
  if (!message) {
    return 'Belum ada pesan.';
  }

  if (message.message?.trim()) {
    return message.message;
  }

  return message.attachment_url ? 'Foto lampiran' : 'Pesan kosong';
}

export function AdminChatInbox({ profile }: Props) {
  const [orders, setOrders] = useState<LaundryOrder[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [filter, setFilter] = useState<InboxFilter>('ALL');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const isActiveAdmin = canOperateOrders(profile);
  const outletId = operatorOutletId(profile);

  async function loadInbox() {
    setLoading(true);
    setMessage('');

    let orderRequest = supabase
      .from('tabel_order')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(80);

    if (profile.role !== 'SUPERADMIN') {
      orderRequest = orderRequest.eq('admin_outlet_id', outletId);
    }

    const { data: orderData, error: orderError } = await orderRequest;

    if (orderError) {
      setLoading(false);
      setMessage(orderError.message);
      return;
    }

    const nextOrders = (orderData ?? []) as LaundryOrder[];
    setOrders(nextOrders);

    if (nextOrders.length === 0) {
      setMessages([]);
      setLoading(false);
      return;
    }

    const { data: chatData, error: chatError } = await supabase
      .from('tabel_chat_message')
      .select('*')
      .in('order_id', nextOrders.map((order) => order.id))
      .order('created_at', { ascending: false })
      .limit(300);

    setLoading(false);

    if (chatError) {
      setMessage(chatError.message);
      return;
    }

    setMessages((chatData ?? []) as ChatMessage[]);
    setSelectedOrderId((current) => current || nextOrders[0]?.id || '');
  }

  useEffect(() => {
    if (!isActiveAdmin) {
      setLoading(false);
      return;
    }

    void loadInbox();
  }, [isActiveAdmin, outletId, profile.role]);

  useEffect(() => {
    if (!isActiveAdmin) {
      return;
    }

    const chatChannel = supabase
      .channel(`ungu-laundry:admin-chat-inbox:${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tabel_chat_message',
        },
        () => void loadInbox(),
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tabel_order',
        },
        () => void loadInbox(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(chatChannel);
    };
  }, [isActiveAdmin, profile.id]);

  const conversations = useMemo(() => {
    return orders
      .map((order) => {
        const orderMessages = messages
          .filter((chatMessage) => chatMessage.order_id === order.id)
          .sort((left, right) => right.created_at.localeCompare(left.created_at));
        const latestMessage = orderMessages[0];
        const unreadCount = orderMessages.filter(
          (chatMessage) => chatMessage.sender_user_id !== profile.id && !chatMessage.read_by_admin_at,
        ).length;

        return { latestMessage, order, orderMessages, unreadCount };
      })
      .filter((conversation) => {
        if (filter === 'UNREAD') {
          return conversation.unreadCount > 0;
        }

        if (filter === 'ACTIVE') {
          return isActiveOrder(conversation.order);
        }

        return true;
      })
      .sort((left, right) => {
        const leftDate = left.latestMessage?.created_at ?? left.order.updated_at;
        const rightDate = right.latestMessage?.created_at ?? right.order.updated_at;
        return rightDate.localeCompare(leftDate);
      });
  }, [filter, messages, orders, profile.id]);

  const selectedOrder = orders.find((order) => order.id === selectedOrderId) ?? conversations[0]?.order ?? null;
  const unreadTotal = conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0);

  async function updateStatus(status: LaundryOrder['status_order']) {
    if (!selectedOrder) {
      return;
    }

    const { error } = await supabase.from('tabel_order').update({ status_order: status }).eq('id', selectedOrder.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadInbox();
  }

  if (!isActiveAdmin) {
    return (
      <section className="panel">
        <p className="eyebrow">Chat admin</p>
        <h1>Langganan admin belum aktif</h1>
        <p className="muted">Aktifkan subscription admin untuk membuka inbox chat outlet.</p>
      </section>
    );
  }

  return (
    <div className="admin-chat-inbox">
      <section className="panel soft">
        <div className="page-header">
          <div>
            <p className="eyebrow">Inbox chat</p>
            <h1>Pesan customer masuk per order.</h1>
            <p className="muted">Filter unread, buka chat, dan update status tanpa keluar halaman.</p>
          </div>
          <span className="status pending">{unreadTotal} unread</span>
        </div>
      </section>

      <section className="admin-chat-layout">
        <aside className="chat-inbox-list app-card">
          <div className="segmented-control chat-filter" role="tablist" aria-label="Filter chat admin">
            {(['ALL', 'UNREAD', 'ACTIVE'] as InboxFilter[]).map((item) => (
              <button
                aria-selected={filter === item}
                className={filter === item ? 'active' : ''}
                key={item}
                onClick={() => setFilter(item)}
                type="button"
              >
                {item === 'ALL' ? 'Semua' : item === 'UNREAD' ? 'Unread' : 'Aktif'}
              </button>
            ))}
          </div>

          {message ? <div className="alert error">{message}</div> : null}
          {loading ? <ListSkeleton count={3} /> : null}

          <div className="chat-conversation-list">
            {!loading && conversations.length === 0 ? (
              <div className="empty-state compact">
                <i className="fi fi-rr-comment-alt" aria-hidden />
                <strong>Belum ada chat</strong>
                <span>Pesan customer akan muncul setelah order masuk.</span>
              </div>
            ) : null}

            {conversations.map((conversation) => (
              <button
                className={`conversation-card ${selectedOrder?.id === conversation.order.id ? 'active' : ''}`}
                key={conversation.order.id}
                onClick={() => setSelectedOrderId(conversation.order.id)}
                type="button"
              >
                <span className="conversation-avatar">
                  <i className="fi fi-rr-user" aria-hidden />
                </span>
                <span>
                  <strong>#{conversation.order.id.slice(0, 8)}</strong>
                  <small>{conversation.order.format_detail?.paket || 'Laundry'} - {messagePreview(conversation.latestMessage)}</small>
                </span>
                {conversation.unreadCount > 0 ? <em>{conversation.unreadCount}</em> : null}
              </button>
            ))}
          </div>
        </aside>

        <section className="chat-inbox-detail">
          {selectedOrder ? (
            <>
              <div className="app-card quick-status-panel">
                <div>
                  <p className="eyebrow">Quick reply status</p>
                  <h2>{selectedOrder.format_detail?.outlet_name || 'Outlet'} - #{selectedOrder.id.slice(0, 8)}</h2>
                </div>
                <div className="choice-grid status-choice-grid">
                  {quickStatuses.map((status) => (
                    <button
                      className={`choice-pill ${selectedOrder.status_order === status ? 'active' : ''}`}
                      key={status}
                      onClick={() => updateStatus(status)}
                      type="button"
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>

              <InteractiveChatLaundry orderId={selectedOrder.id} profile={profile} />
            </>
          ) : (
            <div className="empty-state">
              <i className="fi fi-rr-comment-alt" aria-hidden />
              <strong>Pilih percakapan</strong>
              <span>Chat customer akan tampil di sini.</span>
            </div>
          )}
        </section>
      </section>
    </div>
  );
}
