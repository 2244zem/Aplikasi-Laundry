import { OrderChatClient } from './OrderChatClient';

type Props = {
  params: Promise<{
    orderId: string;
  }>;
};

export default async function OrderChatPage({ params }: Props) {
  const { orderId } = await params;

  return <OrderChatClient orderId={orderId} />;
}
