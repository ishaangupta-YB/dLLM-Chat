import { NextRequest, NextResponse } from 'next/server';
import { ChatMode } from '@/lib/types';

// CORS validation function
function validateOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  
  const allowedOrigins = [
    'https://dllmchat.vercel.app', 
  ];

  // Check origin header
  if (origin && !allowedOrigins.includes(origin)) {
    return false;
  }

  // Additional referer validation for extra security
  if (referer) {
    const isValidReferer = allowedOrigins.some(allowedOrigin => 
      referer.startsWith(allowedOrigin)
    );
    if (!isValidReferer) {
      return false;
    }
  }

  return true;
}

// Handle preflight OPTIONS requests
export async function OPTIONS(request: NextRequest) {
  if (!validateOrigin(request)) {
    return new NextResponse(null, { status: 403 });
  }

  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': request.headers.get('origin') || 'https://dllmchat.vercel.app',
      'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '86400'
    }
  });
}

export async function POST(request: NextRequest) {
  try {
    // Validate origin for security
    if (!validateOrigin(request)) {
      return NextResponse.json(
        { error: 'Forbidden: Invalid origin' },
        { status: 403 }
      );
    }

    // Read API key from environment variables - secure for production
    const apiKey = process.env.DLLM_API_KEY;
    
    if (!apiKey) {
      console.error('DLLM_API_KEY environment variable is not set');
      return NextResponse.json(
        { error: 'Server configuration error: API key not configured' },
        { 
          status: 500,
          headers: {
            'Access-Control-Allow-Origin': request.headers.get('origin') || 'https://dllmchat.vercel.app',
            'Access-Control-Allow-Credentials': 'true',
          }
        }
      );
    }

    const { message, mode }: {
      message: string;
      mode: ChatMode;
    } = await request.json();

    const apiUrl = process.env.DLLM_API_URL || 'https://api.inceptionlabs.ai/v1/chat/completions';
    const model = process.env.DLLM_MODEL || 'mercury';
    
    // Only send the current message to reduce token usage
    const conversationMessages = [
      { role: 'user' as const, content: message }
    ];

    const requestBody: any = {
      model,
      messages: conversationMessages,
      max_tokens: 4000,
      stream: true,
    };

    if (mode === 'diffusing') {
      requestBody.diffusing = true;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API error:', response.status, errorText);
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }

    // Create a proper SSE stream handler
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        
        try {
          while (true) {
            const { done, value } = await reader?.read() || { done: true, value: undefined };
            if (done) {
              // Process any remaining buffer
              if (buffer.trim()) {
                const lines = buffer.split('\n');
                for (const line of lines) {
                  if (line.trim()) {
                    controller.enqueue(new TextEncoder().encode(line + '\n'));
                  }
                }
              }
              controller.close();
              break;
            }
            
            // Decode the chunk and add to buffer
            buffer += decoder.decode(value, { stream: true });
            
            // Process complete lines
            const lines = buffer.split('\n');
            // Keep the last potentially incomplete line in the buffer
            buffer = lines.pop() || '';
            
            for (const line of lines) {
              const trimmed = line.trim();
              
              // Pass through SSE lines as-is
              if (trimmed.startsWith('data: ')) {
                // Ensure each SSE message is sent as a complete line
                controller.enqueue(new TextEncoder().encode(trimmed + '\n'));
              }
            }
          }
        } catch (error) {
          console.error('Stream processing error:', error);
          controller.error(error);
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': request.headers.get('origin') || 'https://dllmchat.vercel.app',
        'Access-Control-Allow-Credentials': 'true',
      },
    });

  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Failed to process chat request', details: error instanceof Error ? error.message : 'Unknown error' },
      { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': request.headers.get('origin') || 'https://dllmchat.vercel.app',
          'Access-Control-Allow-Credentials': 'true',
        }
      }
    );
  }
} 