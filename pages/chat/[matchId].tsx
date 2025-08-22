import { useRouter } from 'next/router';
import { useEffect, useState, useRef } from 'react';
import { getDatabase, ref, onValue, push, serverTimestamp, set } from 'firebase/database';
import useAuth from '../../hooks/useAuth';

interface Message {
  id: string;
  text: string;
  senderId: string;
  timestamp: number;
}

const ChatPage = () => {
  const router = useRouter();
  const { matchId } = router.query;
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<null | HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!matchId || typeof matchId !== 'string') return;

    console.log(`Setting up chat listener for matchId: ${matchId}`);
    const db = getDatabase();
    const messagesRef = ref(db, `chats/${matchId}/messages`);

    const unsubscribe = onValue(messagesRef, (snapshot) => {
      const messagesData: Message[] = [];
      snapshot.forEach(childSnapshot => {
        messagesData.push({ id: childSnapshot.key!, ...childSnapshot.val() });
      });
      setMessages(messagesData);
      console.log(`Loaded ${messagesData.length} messages.`);
    });

    return () => {
      console.log(`Cleaning up chat listener for matchId: ${matchId}`);
      unsubscribe();
    };
  }, [matchId]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newMessage.trim() || typeof matchId !== 'string') return;

    console.log(`Sending message from ${user.uid} to chat ${matchId}`);
    const db = getDatabase();
    const messagesRef = ref(db, `chats/${matchId}/messages`);

    try {
      await push(messagesRef, {
        text: newMessage,
        senderId: user.uid,
        timestamp: serverTimestamp(),
      });
      setNewMessage('');
      console.log('Message sent successfully.');
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white font-sans">
      <header className="bg-gray-800 p-4 shadow-md">
        <h1 className="text-xl font-bold text-center">Chat</h1>
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex ${msg.senderId === user?.uid ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                msg.senderId === user?.uid
                  ? 'bg-indigo-600'
                  : 'bg-gray-700'
              }`}
            >
              <p>{msg.text}</p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </main>

      <footer className="p-4 bg-gray-800">
        <form onSubmit={handleSendMessage} className="flex gap-4">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            disabled={!newMessage.trim()}
            className="px-6 py-2 font-semibold text-white bg-indigo-600 rounded-full hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </form>
      </footer>
    </div>
  );
};

export default ChatPage;
