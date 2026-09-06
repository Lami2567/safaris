import { localStore } from '../../config/database';
import { v4 as uuidv4 } from 'uuid';
import { emitToUser } from '../../realtime/socket_server';

export interface SendMessageRequest {
  senderId: string;
  recipientId: string;
  tripId?: string;
  content: string;
}

export class MessagingService {
  public static sendMessage(data: SendMessageRequest) {
    const messageId = `msg_${uuidv4().substring(0, 8)}`;
    const message = {
      id: messageId,
      sender_id: data.senderId,
      recipient_id: data.recipientId,
      trip_id: data.tripId || null,
      content: data.content,
      is_read: false,
      created_at: new Date().toISOString(),
    };

    localStore.messages.set(messageId, message);

    // Live Socket dispatch
    emitToUser(data.recipientId, 'chat:new_message', message);

    return message;
  }

  public static getTripMessages(tripId: string) {
    return Array.from(localStore.messages.values())
      .filter((m: any) => m.trip_id === tripId)
      .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }

  public static getConversation(user1: string, user2: string) {
    return Array.from(localStore.messages.values())
      .filter((m: any) => 
        (m.sender_id === user1 && m.recipient_id === user2) ||
        (m.sender_id === user2 && m.recipient_id === user1)
      )
      .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }
}
