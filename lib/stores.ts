import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Message, ChatMode } from '@/lib/types';

interface ChatModeStore {
  mode: ChatMode;
  setMode: (mode: ChatMode) => void;
}

export const useChatModeStore = create<ChatModeStore>()(
  persist(
    (set) => ({
      mode: 'streaming',
      setMode: (mode) => set({ mode }),
    }),
    {
      name: 'chat-mode-storage',
    }
  )
);

interface ChatStore {
  messages: Message[];
  isLoading: boolean;
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => string;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  clearMessages: () => void;
  setLoading: (loading: boolean) => void;
}

export const useChatStore = create<ChatStore>((set, get) => {
  let messageIdCounter = 0;
  
  return {
    messages: [],
    isLoading: false,
    addMessage: (message) => {
      const id = `msg_${Date.now()}_${++messageIdCounter}`;
      const newMessage: Message = {
        ...message,
        id,
        timestamp: new Date(),
      };
      set((state) => ({
        messages: [...state.messages, newMessage]
      }));
      return id;
    },
    updateMessage: (id, updates) => {
      set((state) => ({
        messages: state.messages.map(msg => 
          msg.id === id ? { ...msg, ...updates } : msg
        )
      }));
    },
    clearMessages: () => set({ messages: [] }),
    setLoading: (loading) => set({ isLoading: loading }),
  };
});     