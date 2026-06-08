'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ImagePlus, Send, X } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import type { ChatMessage, UserProfile } from '@/lib/types';

const CHAT_BUCKET = 'bukti-cucian';
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

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

export function InteractiveChatLaundry({ orderId, profile }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [textInput, setTextInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
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

    return () => {
      void supabase.removeChannel(chatRoom);
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
    <section className="chat-shell">
      <div className="page-header" style={{ marginBottom: 12 }}>
        <div>
          <p className="eyebrow">Live chat</p>
          <h2>Bukti fisik & kondisi pakaian</h2>
        </div>
        <span className="status active">{messages.length} pesan</span>
      </div>

      <div className="chat-log" ref={logRef}>
        {messages.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Belum ada percakapan untuk order ini.
          </p>
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
            <ImagePlus aria-hidden size={16} />
            <span>{selectedFile.name}</span>
            <button aria-label="Hapus lampiran" onClick={() => setSelectedFile(null)} type="button">
              <X aria-hidden size={15} />
            </button>
          </div>
        ) : null}

        <div className="chat-input-row">
          <label className="button secondary" htmlFor={`chat-file-${orderId}`}>
            <ImagePlus aria-hidden size={18} />
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
            <Send aria-hidden size={18} />
            {uploading ? 'Mengirim' : 'Kirim'}
          </button>
        </div>
      </form>

      {errorMessage ? <div className="alert error">{errorMessage}</div> : null}
    </section>
  );
}
