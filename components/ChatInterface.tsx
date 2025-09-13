'use client';

import Link from 'next/link';
import { useCallback, useState, useEffect } from 'react';
import { Github, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ModeToggle } from './mode-toggle';
import { useChatModeStore, useChatStore } from '@/lib/stores';
import Messages from './Messages';
import ChatInput from './ChatInput';
import { ChatSkeleton, LoadingSpinner } from './ui/loading';
import { toast } from 'sonner';

export default function ChatInterface() {
  const { mode } = useChatModeStore();
  const { messages, isLoading, addMessage, updateMessage, setLoading, clearMessages } = useChatStore();
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [mounted, setMounted] = useState(false);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    setMounted(true);
    const timer = setTimeout(() => {
      setInitializing(false);
    }, 500);  
    
    return () => clearTimeout(timer);
  }, []);

  const handleStop = useCallback(() => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
      setLoading(false);
      toast.info('Response generation stopped');
    }
  }, [abortController, setLoading]);

  const sendMessage = useCallback(async (content: string) => {
    if (isLoading) return;

    setLoading(true);
    
    addMessage({ role: 'user', content });

    const assistantMessageId = addMessage({
      role: 'assistant', 
      content: '', 
      isStreaming: true 
    });

    const controller = new AbortController();
    setAbortController(controller);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: content,
          mode,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = 'An error occurred while processing your request.';
        
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.message || errorMessage;
        } catch {
          // Use default error message if parsing fails
        }

        if (response.status === 401) {
          errorMessage = 'Invalid API key. Please check your credentials.';
          toast.error('Authentication failed - Please check your API key');
        } else if (response.status === 429) {
          errorMessage = 'Rate limit exceeded. Please try again later.';
          toast.error('Rate limit exceeded - Please wait before sending another message');
        } else if (response.status >= 500) {
          errorMessage = 'Server error occurred. Please try again.';
          toast.error('Server error - Please try again');
        } else {
          toast.error(`Request failed: ${errorMessage}`);
        }

        updateMessage(assistantMessageId, {
          content: `**Error:** ${errorMessage}`,
          isStreaming: false,
          isError: true
        });
        return;
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;
            if (trimmed === 'data: [DONE]') continue;
            const jsonStr = trimmed.substring(6);
            if (!jsonStr.startsWith('{')) continue;
            try {
              const data = JSON.parse(jsonStr);
              
              for (const choice of data.choices || []) {
                if (choice.delta && choice.delta.content !== null && choice.delta.content !== undefined) {
                  if (mode === 'streaming') {
                    fullContent += choice.delta.content;
                  } else {
                    // diffusing mode
                    fullContent = choice.delta.content || '';
                  }
                  
                  updateMessage(assistantMessageId, {
                    content: fullContent,
                    isStreaming: true
                  });
                }
              }
            } catch (error) {
              console.error('Parsing error:', error);
            }
          }
        }
      }

      updateMessage(assistantMessageId, { isStreaming: false });
      toast.success('Response completed');

    } catch (error: any) {
      let errorMessage = 'An unexpected error occurred.';
      
      if (error.name === 'AbortError') {
        updateMessage(assistantMessageId, {
          content: '**Response cancelled by user.**',
          isStreaming: false
        });
        return;
      } else if (error.message) {
        errorMessage = error.message;
      }

      console.error('Chat error:', error);
      toast.error(`Chat error: ${errorMessage}`);
      
      updateMessage(assistantMessageId, {
        content: `**Error:** ${errorMessage}`,
        isStreaming: false,
        isError: true
      });
    } finally {
      setLoading(false);
      setAbortController(null);
    }
  }, [isLoading, messages, mode, addMessage, updateMessage, setLoading]);

  if (!mounted || initializing) {
    return (
      <div className="flex flex-col h-screen bg-background">
        <header className="border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold">
                dLLM <span className="text-primary">Chat</span>
              </h1>
              <LoadingSpinner size="sm" />
            </div>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center p-4">
          <div className="max-w-4xl w-full">
            <ChatSkeleton />
          </div>
        </main>
      </div>
    );
  }


  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">
              dLLM  <span className="text-primary">Chat</span>
            </h1>
            
            <div className="flex items-center gap-4">
              {messages.length > 0 && (
                <Button
                  onClick={() => {
                    clearMessages();
                    toast.success('Chat cleared');
                  }}
                  variant="ghost"
                  size="sm"
                  className="flex items-center gap-2 h-9 px-3 text-sm text-muted-foreground hover:text-foreground"
                >
                  <Trash2 className="w-4 h-4" />
                  Clear Chat
                </Button>
              )}


              <ModeToggle />
              <Link href="https://github.com/ishaangupta-YB" target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="icon">
                  <Github className="h-[1.2rem] w-[1.2rem]" />
                  <span className="sr-only">GitHub</span>
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 relative">
        <div className="flex flex-col w-full max-w-4xl pt-12 pb-44 mx-auto px-6">
          <Messages messages={messages} isLoading={isLoading} />
        </div>
        
        <ChatInput onSendMessage={sendMessage} onStop={handleStop} disabled={isLoading} />
      </main>
    </div>
  );
} 