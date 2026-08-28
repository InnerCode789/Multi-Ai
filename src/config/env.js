import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Explicitly locate and load .env from project root
const envPath = path.resolve(__dirname, '../../.env');
const envExamplePath = path.resolve(__dirname, '../../.env.example');

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else if (fs.existsSync(envExamplePath)) {
  dotenv.config({ path: envExamplePath });
} else {
  dotenv.config();
}

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.string().default('development'),
  
  // AI execution mode: 'local' (Ollama only), 'cloud' (Cloud only), 'hybrid' (Cloud with Ollama fallback)
  AI_MODE: z.enum(['local', 'cloud', 'hybrid']).default('local'),
  
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default('qwen/qwen3.8-27b'),
  
  GITHUB_MODELS_TOKEN: z.string().optional(),
  GITHUB_MODELS_MODEL: z.string().default('gpt-4o-mini'),
  GITHUB_MODELS_ENDPOINT: z.string().default('https://models.inference.ai.azure.com'),
  
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-3.5-flash'),
  
  OLLAMA_BASE_URL: z.string().default('http://localhost:11434'),
  OLLAMA_MODEL: z.string().default('deepseek-r1:7b'),
  
  AGENT_PLANNER_PROVIDER: z.string().default('ollama'),
  AGENT_PLANNER_MODEL: z.string().default('deepseek-r1:7b'),
  
  AGENT_ENGINEER_PROVIDER: z.string().default('ollama'),
  AGENT_ENGINEER_MODEL: z.string().default('deepseek-r1:7b'),
  
  AGENT_REVIEWER_PROVIDER: z.string().default('ollama'),
  AGENT_REVIEWER_MODEL: z.string().default('deepseek-r1:7b'),
  
  AGENT_QA_PROVIDER: z.string().default('ollama'),
  AGENT_QA_MODEL: z.string().default('deepseek-r1:7b'),
  
  MAX_ITERATIONS: z.coerce.number().default(10),
  MAX_TOOL_CALLS_PER_TURN: z.coerce.number().default(15),
  COMMAND_TIMEOUT_MS: z.coerce.number().default(30000),
  WORKSPACE_BASE_DIR: z.string().default('./workspaces')
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.format());
}

const env = parsed.data || envSchema.parse({});

const isLocalOnly = env.AI_MODE === 'local';

export const config = Object.freeze({
  server: {
    port: env.PORT,
    nodeEnv: env.NODE_ENV
  },
  aiMode: env.AI_MODE,
  groq: {
    apiKey: isLocalOnly ? undefined : env.GROQ_API_KEY,
    model: env.GROQ_MODEL
  },
  githubModels: {
    token: isLocalOnly ? undefined : env.GITHUB_MODELS_TOKEN,
    model: env.GITHUB_MODELS_MODEL,
    endpoint: env.GITHUB_MODELS_ENDPOINT
  },
  gemini: {
    apiKey: isLocalOnly ? undefined : env.GEMINI_API_KEY,
    model: env.GEMINI_MODEL
  },
  ollama: {
    baseUrl: env.OLLAMA_BASE_URL,
    model: env.OLLAMA_MODEL
  },
  agents: {
    planner: {
      provider: isLocalOnly ? 'ollama' : env.AGENT_PLANNER_PROVIDER,
      model: isLocalOnly ? env.OLLAMA_MODEL : env.AGENT_PLANNER_MODEL
    },
    engineer: {
      provider: isLocalOnly ? 'ollama' : env.AGENT_ENGINEER_PROVIDER,
      model: isLocalOnly ? env.OLLAMA_MODEL : env.AGENT_ENGINEER_MODEL
    },
    reviewer: {
      provider: isLocalOnly ? 'ollama' : env.AGENT_REVIEWER_PROVIDER,
      model: isLocalOnly ? env.OLLAMA_MODEL : env.AGENT_REVIEWER_MODEL
    },
    qa: {
      provider: isLocalOnly ? 'ollama' : env.AGENT_QA_PROVIDER,
      model: isLocalOnly ? env.OLLAMA_MODEL : env.AGENT_QA_MODEL
    }
  },
  system: {
    maxIterations: env.MAX_ITERATIONS,
    maxToolCallsPerTurn: env.MAX_TOOL_CALLS_PER_TURN,
    commandTimeoutMs: env.COMMAND_TIMEOUT_MS,
    workspaceBaseDir: env.WORKSPACE_BASE_DIR
  }
});

export default config;
