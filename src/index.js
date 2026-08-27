import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config/env.js';
import logger from './utils/logger.js';
import { handleGoalStream } from './controllers/goalController.js';
import { getSystemStatus, listGoals, getGoalDetails } from './controllers/statusController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Autonomous Multi-AI Endpoints
app.post('/api/goal/stream', handleGoalStream);
app.get('/api/status', getSystemStatus);
app.get('/api/goals', listGoals);
app.get('/api/goals/:id', getGoalDetails);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    system: 'Multi-AI Autonomous Engineering System',
    timestamp: new Date().toISOString()
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = app.listen(config.server.port, () => {
  logger.info(`
   __  __       _ _   _              _    ___ 
  |  \\/  |_   _| | |_(_)            / \\  |_ _|
  | |\\/| | | | | | __| |  _____    / _ \\  | | 
  | |  | | |_| | | |_| | |_____|  / ___ \\ | | 
  |_|  |_|\\__,_|_|\\__|_|         /_/   \\_\\___|
                                              
  Autonomous Multi-Model Engineering Engine
  Port: ${config.server.port}
  Environment: ${config.server.nodeEnv}
  Workspace Base: ${config.system.workspaceBaseDir}
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

export default app;
