export interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    isStreaming?: boolean;
    isError?: boolean;
}

export type ChatMode = 'streaming' | 'diffusing';

export interface ChatConfig {
    mode: ChatMode;
}