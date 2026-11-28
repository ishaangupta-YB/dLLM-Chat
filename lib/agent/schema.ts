import 'server-only';
import { z } from 'zod';

/** Validates the client's ToolRequestConfig (lib/types.ts). */
export const ToolConfigSchema = z
  .object({
    preset: z.string().regex(/^[a-z0-9-]{1,30}$/).optional(),
    /** Optional conversation id: keeps per-chat demo state (clinic preset) on a warm instance. */
    sessionId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
    webSearch: z.boolean().optional(),
    utilities: z.boolean().optional(),
    mcp: z.array(z.string().regex(/^[a-z0-9-]{1,40}$/)).max(20).optional(),
    customMcp: z
      .array(
        z.object({
          id: z.string().min(1).max(40),
          name: z.string().min(1).max(60),
          url: z.string().url().max(500),
          authHeader: z.string().max(2000).optional(),
        }),
      )
      .max(10)
      .optional(),
    keys: z.object({ tavily: z.string().max(400).optional() }).optional(),
  })
  .optional();
