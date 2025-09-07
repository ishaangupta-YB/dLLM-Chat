'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Server, Shield, Code } from 'lucide-react';

export default function ServerSetupInfo() {
  return (
    <Card className="w-full max-w-lg mx-auto">
      <CardHeader className="text-center">
        <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
          <Server className="w-6 h-6 text-primary" />
        </div>
        <CardTitle className="text-2xl">Server Configuration</CardTitle>
        <CardDescription>
          This application uses server-side API key management for enhanced security
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
            <Shield className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Secure Configuration</p>
              <p className="text-xs text-muted-foreground">
                API keys are stored securely on the server and never exposed to the client-side.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
            <Code className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="space-y-2">
              <p className="text-sm font-medium">Environment Setup</p>
              <p className="text-xs text-muted-foreground">
                To configure this application, set the following environment variable:
              </p>
              <div className="bg-background rounded p-2 text-xs font-mono border">
                DLLM_API_KEY=your_api_key_here
              </div>
            </div>
          </div>

          <div className="text-xs text-muted-foreground space-y-2">
            <p>
              <strong>For Development:</strong> Create a <code className="text-xs bg-muted px-1 rounded">.env.local</code> file 
              in your project root with your API key.
            </p>
            <p>
              <strong>For Production:</strong> Set environment variables in your deployment platform 
              (Vercel, Netlify, etc.).
            </p>
            <p>
              Get your API key from{' '}
              <a 
                href="https://platform.inceptionlabs.ai/dashboard/api-keys" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Inception Labs Dashboard
              </a>
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
} 