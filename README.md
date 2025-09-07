# dLLM Chat - AI Powered Conversational Interface

**Experience the future of AI conversation with streaming and diffusing response modes**

A modern, production-ready chat application built with Next.js that showcases Inception Labs's dLLM models. Features real-time streaming responses and innovative diffusing mode where AI refines answers dynamically.

## Demo Video
https://github.com/user-attachments/assets/646b2b61-3ae7-42d8-91bd-28699df7b674

## Features

-   **Modern Tech Stack:** Built with Next.js App Router, React, and TypeScript.
-   **Streaming & Diffusing Modes:** Switch between progressive streaming (like ChatGPT) and dynamic diffusing (where the AI refines its answer in real-time).
-   **Secure API Key Management:** Uses server-side environment variables to keep API keys secure and hidden from client-side code.
-   **Responsive UI:** A clean, responsive interface that works on all screen sizes, built with **Shadcn UI** and **Tailwind CSS**.
-   **Light/Dark Mode:** Toggle between light and dark themes.
-   **State Management:** Uses **Zustand** for simple and powerful global state management.
-   **Error Handling:** Gracefully handles API errors and displays user-friendly notifications using **Sonner**.
-   **Stop Generation:** Cancel the AI's response generation at any time.
-   **Clear Chat History:** Easily start a new conversation.
-   **Production Ready:** Secure configuration suitable for production deployments on Vercel, Netlify, and other platforms.

## Tech Stack

-   **Framework:** [Next.js](https://nextjs.org/) (with App Router)
-   **Language:** [TypeScript](https://www.typescriptlang.org/)
-   **Styling:** [Tailwind CSS](https://tailwindcss.com/) & [Shadcn UI](https://ui.shadcn.com/)
-   **State Management:** [Zustand](https://zustand-demo.pmnd.rs/)
-   **UI Components:**
    -   `ChatInterface.tsx`: The main chat component.
    -   `ServerSetupInfo.tsx`: Displays server configuration information.
    -   `Messages.tsx`, `Message.tsx`, `ChatInput.tsx`: For the chat view and input.
-   **Backend:** A Next.js API route (`app/api/chat/route.ts`) that securely handles API requests using server-side environment variables.

## Getting Started

### Prerequisites

-   Node.js (v18 or later recommended)
-   An Inception Labs API key from [Inception Labs Dashboard](https://platform.inceptionlabs.ai/dashboard/api-keys)

### Installation

1.  **Clone the repository and navigate to this directory:**

    ```bash
    cd examples/nextjs-example
    ```

2.  **Install dependencies:**

    ```bash
    npm install
    # or
    yarn install
    # or
    pnpm install
    ```

3.  **Set up environment variables:**

    Create a `.env.local` file in the project root:

    ```bash
    # .env.local
    DLLM_API_KEY=your_inception_labs_api_key_here

    # Optional: Customize API endpoint (defaults to Inception Labs API)
    # DLLM_API_URL=https://api.inceptionlabs.ai/v1/chat/completions

    # Optional: Customize model (defaults to mercury)
    # DLLM_MODEL=mercury
    ```

    > **Security Note:** The `.env.local` file is automatically ignored by git to keep your API key secure.

4.  **Run the development server:**

    ```bash
    npm run dev
    # or
    yarn dev
    # or
    pnpm dev
    ```

5.  **Open the application:**
    Open [http://localhost:3000](http://localhost:3000) in your browser. The application will automatically use your configured API key and you can start chatting immediately!

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deployment

### Deploy on Vercel (Recommended)

The easiest way to deploy this app is using the [Vercel Platform](https://vercel.com/new) from the creators of Next.js.

1. **Connect your repository** to Vercel
2. **Set environment variables** in your Vercel project settings:
   - Go to your project dashboard on Vercel
   - Navigate to Settings → Environment Variables
   - Add: `DLLM_API_KEY` with your Inception Labs API key
   - Optionally add: `DLLM_API_URL` and `DLLM_MODEL` if customizing

3. **Deploy** - Vercel will automatically build and deploy your app

### Deploy on Other Platforms

For other deployment platforms (Netlify, Railway, Render, etc.):

1. **Set the environment variable** `DLLM_API_KEY` in your deployment platform's settings
2. **Build the application** using `npm run build`
3. **Start the application** using `npm run start`

### Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DLLM_API_KEY` | ✅ | - | Your Inception Labs API key |
| `DLLM_API_URL` | ❌ | `https://api.inceptionlabs.ai/v1/chat/completions` | API endpoint URL |
| `DLLM_MODEL` | ❌ | `mercury` | Model to use for chat completions |

### Security Best Practices

- ✅ **API keys are stored server-side** and never exposed to the client
- ✅ **Environment variables** are used for all sensitive configuration
- ✅ **`.env.local`** is gitignored to prevent accidental commits
- ✅ **Ready for production** deployment on any platform

Check out the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more deployment options.
