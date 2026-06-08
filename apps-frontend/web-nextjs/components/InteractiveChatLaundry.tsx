'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { supabase } from '@/lib/supabaseClient';
import type { ChatMessage, LaundryOrder, UserProfile } from '@/lib/types';

const CHAT_BUCKET = 'bukti-cucian';
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const orderSteps: LaundryOrder['status_order'][] = ['PENDING_CONFIRMATION', 'DITERIMA', 'DICUCI', 'DISETRIKA', 'SELESAI'];

type Props = {
  orderId: string;
  profile: UserProfile;
};

function fileExtension(fileName: string) {
  const extension = fileName.split('.').pop()?.toLowerCase();
  return extension && extension.length <= 8 ? extension : 'jpg';
}

function messageTime(createdAt: string) {
  return new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(createdAt));
}

function orderStatusLabel(status: LaundryOrder['status_order']) {
  return status === 'PENDING_CONFIRMATION' ? 'PENDING' : status;
}

export function InteractiveChatLaundry({ orderId, profile }: Props) {
  const [order, setOrder] = useState<LaundryOrder | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [textInput, setTextInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    async function fetchOrder() {
      const { data, error } = await supabase.from('tabel_order').select('*').eq('id', orderId).maybeSingle();

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      setOrder((data as LaundryOrder | null) ?? null);
    }

    async function fetchChatHistory() {
      const { data, error } = await supabase
        .from('tabel_chat_message')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      setMessages((data ?? []) as ChatMessage[]);
    }

    void fetchOrder();
    void fetchChatHistory();

    const chatRoom = supabase
      .channel(`scale-wash:order-chat:${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'tabel_chat_message',
          filter: `order_id=eq.${orderId}`,
        },
        (payload) => {
          setMessages((currentMessages) => {
            const nextMessage = payload.new as ChatMessage;
            if (currentMessages.some((message) => message.id === nextMessage.id)) {
              return currentMessages;
            }

            return [...currentMessages, nextMessage];
          });
        },
      )
      .subscribe();

    const orderRoom = supabase
      .channel(`scale-wash:order-status:${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tabel_order',
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          setOrder(payload.new as LaundryOrder);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(chatRoom);
      void supabase.removeChannel(orderRoom);
    };
  }, [orderId]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setErrorMessage('');

    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Lampiran harus berupa file gambar.');
      event.target.value = '';
      return;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      setErrorMessage('Ukuran gambar maksimal 5 MB.');
      event.target.value = '';
      return;
    }

    setSelectedFile(file);
  }

  async function uploadSelectedFile() {
    if (!selectedFile) {
      return { attachmentUrl: null, attachmentPath: null, attachmentMimeType: null };
    }

    const path = `${orderId}/${profile.id}-${crypto.randomUUID()}.${fileExtension(selectedFile.name)}`;
    const { error: uploadError } = await supabase.storage
      .from(CHAT_BUCKET)
      .upload(path, selectedFile, {
        cacheControl: '3600',
        contentType: selectedFile.type,
        upsert: false,
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data } = supabase.storage.from(CHAT_BUCKET).getPublicUrl(path);

    return {
      attachmentUrl: data.publicUrl,
      attachmentPath: path,
      attachmentMimeType: selectedFile.type,
    };
  }

  async function handleSendPayload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!textInput.trim() && !selectedFile) {
      return;
    }

    setUploading(true);
    setErrorMessage('');

    try {
      const { attachmentUrl, attachmentPath, attachmentMimeType } = await uploadSelectedFile();
      const { error } = await supabase.from('tabel_chat_message').insert({
        order_id: orderId,
        sender_user_id: profile.id,
        message: textInput.trim(),
        attachment_url: attachmentUrl,
        attachment_path: attachmentPath,
        attachment_mime_type: attachmentMimeType,
      });

      if (error) {
        throw error;
      }

      setTextInput('');
      setSelectedFile(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Gagal mengirim pesan chat.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="chat-screen">
      <div className="chat-status-card">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Order status</p>
            <h1>#{orderId.slice(0, 8)}</h1>
            <p className="muted">
              {order?.format_detail?.outlet_name || 'Outlet'} · {order?.format_detail?.paket || 'Laundry'}
            </p>
          </div>
          <span className={`status ${order?.status_order === 'SELESAI' ? 'done' : 'pending'}`}>
            {order ? orderStatusLabel(order.status_order) : 'LOADING'}
          </span>
        </div>

        <div className="status-rail large" aria-label="Progress order customer">
          {orderSteps.map((status) => {
            const currentIndex = order ? orderSteps.indexOf(order.status_order) : -1;
            const stepIndex = orderSteps.indexOf(status);

            return (
              <span className={stepIndex <= currentIndex ? 'active' : ''} key={status}>
                {orderStatusLabel(status)}
              </span>
            );
          })}
        </div>
      </div>

      <div className="chat-shell">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Live chat</p>
            <h2>Bukti fisik & kondisi pakaian</h2>
          </div>
          <span className="status active">{messages.length} pesan</span>
        </div>

        <div className="chat-log" ref={logRef}>
          {messages.length === 0 ? (
            <div className="empty-state compact">
              <i className="fi fi-rr-comment-alt" aria-hidden />
              <strong>Belum ada chat</strong>
              <span>Kirim pesan atau foto kondisi pakaian di sini.</span>
            </div>
          ) : null}

          {messages.map((message) => {
            const isMine = message.sender_user_id === profile.id;

            return (
              <article className={`chat-message ${isMine ? 'mine' : ''}`} key={message.id}>
                <div className={`chat-bubble ${isMine ? 'mine' : ''}`}>
                  {message.message ? <p>{message.message}</p> : null}
                  {message.attachment_url ? (
                    <a href={message.attachment_url} rel="noreferrer" target="_blank">
                      <Image
                        alt="Lampiran bukti cucian"
                        className="chat-image"
                        height={180}
                        src={message.attachment_url}
                        unoptimized
                        width={260}
                      />
                    </a>
                  ) : null}
                  <time>{messageTime(message.created_at)}</time>
                </div>
              </article>
            );
          })}
        </div>

        <form className="chat-compose" onSubmit={handleSendPayload}>
          {selectedFile ? (
            <div className="file-chip">
              <i className="fi fi-rr-picture" aria-hidden />
              <span>{selectedFile.name}</span>
              <button aria-label="Hapus lampiran" onClick={() => setSelectedFile(null)} type="button">
                <i className="fi fi-rr-cross-small" aria-hidden />
              </button>
            </div>
          ) : null}

          <div className="chat-input-row">
            <label className="button secondary" htmlFor={`chat-file-${orderId}`}>
              <i className="fi fi-rr-picture" aria-hidden />
              Foto
            </label>
            <input
              accept="image/*"
              id={`chat-file-${orderId}`}
              onChange={handleFileChange}
              style={{ display: 'none' }}
              type="file"
            />
            <input
              className="input"
              onChange={(event) => setTextInput(event.target.value)}
              placeholder="Ketik pesan konfirmasi kondisi kain"
              value={textInput}
            />
            <button className="button primary" disabled={uploading} type="submit">
              <i className="fi fi-rr-paper-plane" aria-hidden />
              {uploading ? 'Mengirim' : 'Kirim'}
            </button>
          </div>
        </form>
      </div>

      {errorMessage ? <div className="alert error">{errorMessage}</div> : null}
    </section>
  );
}
