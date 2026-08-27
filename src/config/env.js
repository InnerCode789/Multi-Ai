import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.string().default('development'),
  DEFAULT_MODE: z.string().default('cloud'),
  FAILOVER_ENABLED: z.coerce.boolean().default(true),
  
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default('deepseek-r1-distill-llama-70b'),
  
  GITHUB_MODELS_TOKEN: z.string().optional(),
  GITHUB_MODELS_MODEL: z.string().default('gpt-4o-mini'),
  GITHUB_MODELS_ENDPOINT: z.string().default('https://models.inference.ai.azure.com'),
  
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  
  OLLAMA_BASE_URL: z.string().default('http://localhost:11434'),
  OLLAMA_MODEL_AGENT1: z.string().default('deepseek-r1:7b'),
  OLLAMA_MODEL_AGENT2: z.string().default('llama3.2:3b'),
  OLLAMA_MODEL_AGENT3: z.string().default('llama3.2:3b'),
  
  SCRAPER_TIMEOUT_MS: z.coerce.number().default(20000),
  SCRAPER_USER_DATA_DIR: z.string().default('./playwright-data'),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables:', parsedEnv.error.format());
  process.exit(1);
}

const env = parsedEnv.data;

const config = Object.freeze({
  server: {
    port: env.PORT,
    nodeEnv: env.NODE_ENV,
  },
  mode: env.DEFAULT_MODE,
  failover: env.FAILOVER_ENABLED,
  groq: {
    apiKey: env.GROQ_API_KEY,
    model: env.GROQ_MODEL,
  },
  githubModels: {
    token: env.GITHUB_MODELS_TOKEN,
    model: env.GITHUB_MODELS_MODEL,
    endpoint: env.GITHUB_MODELS_ENDPOINT,
  },
  gemini: {
    apiKey: env.GEMINI_API_KEY,
    model: env.GEMINI_MODEL,
  },
  ollama: {
    baseUrl: env.OLLAMA_BASE_URL,
    models: {
      agent1: env.OLLAMA_MODEL_AGENT1,
      agent2: env.OLLAMA_MODEL_AGENT2,
      agent3: env.OLLAMA_MODEL_AGENT3,
    },
  },
  scraper: {
    timeoutMs: env.SCRAPER_TIMEOUT_MS,
    userDataDir: env.SCRAPER_USER_DATA_DIR,
  },
});

export default config;
