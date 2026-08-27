import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config/env.js';
import logger from './utils/logger.js';
import { handleArenaStream } from './controllers/arenaController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/arena/stream', handleArenaStream);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    mode: config.mode,
    failover: config.failover,
    timestamp: new Date().toISOString()
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = app.listen(config.server.port, () => {
  logger.info(`
   ___         _   _ _        _    ___                
  / _ \\       | | (_) |      | |  / _ \\               
 / /_\\ \\_ __ ___| |__ _| |_ ___  | |_| |__ _ __ ___ _ __   __ _ 
 |  _  | '__/ __| '_ \\ | __/ _ \\ |  _  | '__/ _ \\ '_ \\ / _\` |
 | | | | | | (__| | | | | ||  __/ | | | | | |  __/ | | | (_| |
 \\_| |_/_|  \\___|_| |_|_|\\__\\___| \\_| |_/_|  \\___|_| |_|\\__,_|
                                                              
  Hybrid Multi-Agent Arena Started
  Port: ${config.server.port}
  Mode: ${config.mode}
  Failover: ${config.failover}
  Environment: ${config.server.nodeEnv}
  `);
});

const gracefulShutdown = (signal) => {
  logger.warn(`Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    logger.info('Closed out remaining connections.');
    process.exit(0);
  });
  
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
