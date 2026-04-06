require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

// ─── PRISMA V7 DATABASE CONNECTION ───────────────────────────────
const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
// ─────────────────────────────────────────────────────────────────

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
})

// ─── WebSocket Connection Handler ────────────────────────────────
io.on('connection', (socket) => {
  console.log(`⚡ Client connected [${socket.id}]`);
  socket.on('disconnect', () => console.log(`⚡ Client disconnected [${socket.id}]`));
});

app.use(cors());
app.use(express.json());

// ─── HELPER: Seed Database ───────────────────────────────────────
async function seedDatabase() {
  const project = await prisma.project.upsert({
    where: { repository: 'ChavanAtharv/dev-app' },
    update: {},
    create: { name: 'dev-app', repository: 'ChavanAtharv/dev-app' }
  });

  const seedData = [
    { projectId: project.id, status: 'success', commitMsg: 'feat: implement real-time WebSocket dashboard', duration: 142 },
    { projectId: project.id, status: 'success', commitMsg: 'feat: add PostgreSQL database integration', duration: 98 },
    { projectId: project.id, status: 'failed',  commitMsg: 'fix: resolve CORS policy on webhook endpoint', duration: 45 },
    { projectId: project.id, status: 'success', commitMsg: 'chore: update CI pipeline with Prisma generate', duration: 67 },
    { projectId: project.id, status: 'success', commitMsg: 'feat: add deployment trigger API endpoint', duration: 112 },
    { projectId: project.id, status: 'pending', commitMsg: 'refactor: migrate from SQLite to PostgreSQL', duration: null },
  ];

  for (const data of seedData) {
    await prisma.deployment.create({ data });
    // Stagger createdAt slightly so ordering looks natural
    await new Promise(r => setTimeout(r, 50));
  }

  return project;
}

// ─── API: Health & Stats ─────────────────────────────────────────
app.get('/api/status', async (req, res) => {
  try {
    const totalDeployments = await prisma.deployment.count();
    const successCount = await prisma.deployment.count({ where: { status: 'success' } });
    const avgDuration = await prisma.deployment.aggregate({
      _avg: { duration: true },
      where: { duration: { not: null } }
    });
    const latestDeployment = await prisma.deployment.findFirst({
      orderBy: { createdAt: 'desc' },
      include: { project: true }
    });

    res.json({
      project: "dev-app",
      status: "healthy",
      version: "3.0.0",
      lastDeploy: latestDeployment?.createdAt || new Date().toISOString(),
      stats: {
        totalDeployments,
        successRate: totalDeployments > 0 ? Math.round((successCount / totalDeployments) * 100) : 0,
        avgBuildTime: Math.round(avgDuration._avg.duration || 0),
        latestCommit: latestDeployment?.commitMsg || 'No deployments yet'
      }
    });
  } catch (error) {
    console.error("Status endpoint error:", error);
    res.status(500).json({ error: "Failed to fetch status" });
  }
});

// ─── API: Fetch Deployments ──────────────────────────────────────
app.get('/api/deployments', async (req, res) => {
  try {
    let deployments = await prisma.deployment.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { project: true }
    });

    // Auto-seed if the database is empty
    if (deployments.length === 0) {
      await seedDatabase();
      deployments = await prisma.deployment.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { project: true }
      });
    }

    res.json(deployments);
  } catch (error) {
    console.error("Database query error:", error);
    res.status(500).json({ error: "Failed to fetch deployments" });
  }
});

// ─── API: GitHub Webhook ─────────────────────────────────────────
app.post('/api/webhooks/github', async (req, res) => {
  try {
    const payload = req.body;

    if (payload.action === 'completed' && payload.workflow_run) {
      const repoFullName = payload.repository.full_name || payload.repository.name;
      const repoName = payload.repository.name;
      const status = payload.workflow_run.conclusion === 'success' ? 'success' : 'failed';
      const commitMsg = payload.workflow_run.head_commit?.message || 'Workflow triggered';
      const durationMs = new Date(payload.workflow_run.updated_at) - new Date(payload.workflow_run.created_at);
      const duration = Math.max(1, Math.round(durationMs / 1000));

      const project = await prisma.project.upsert({
        where: { repository: repoFullName },
        update: {},
        create: { name: repoName, repository: repoFullName }
      });

      const deployment = await prisma.deployment.create({
        data: { projectId: project.id, status, commitMsg, duration },
        include: { project: true }
      });

      // Broadcast the full deployment object to all connected clients
      io.emit('new_deployment', deployment);

      return res.status(200).json({ message: "Webhook processed and saved to database" });
    }

    res.status(200).json({ message: "Event ignored, not a completed workflow_run" });
  } catch (error) {
    console.error("Webhook Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── API: Manual Trigger (Demo / Testing) ────────────────────────
const DEMO_COMMITS = [
  'feat: add user authentication flow',
  'fix: resolve memory leak in WebSocket handler',
  'chore: upgrade dependencies to latest versions',
  'feat: implement dark mode toggle',
  'refactor: optimize database queries for deployment list',
  'docs: update API documentation',
  'feat: add deployment rollback functionality',
  'fix: correct timezone handling in timestamps',
  'test: add integration tests for webhook endpoint',
  'feat: implement rate limiting on API endpoints',
];

app.post('/api/deployments/trigger', async (req, res) => {
  try {
    const project = await prisma.project.upsert({
      where: { repository: 'ChavanAtharv/dev-app' },
      update: {},
      create: { name: 'dev-app', repository: 'ChavanAtharv/dev-app' }
    });

    const randomCommit = DEMO_COMMITS[Math.floor(Math.random() * DEMO_COMMITS.length)];
    const randomDuration = Math.floor(Math.random() * 180) + 20;
    const randomStatus = Math.random() > 0.2 ? 'success' : 'failed';

    const deployment = await prisma.deployment.create({
      data: {
        projectId: project.id,
        status: randomStatus,
        commitMsg: randomCommit,
        duration: randomDuration
      },
      include: { project: true }
    });

    // Broadcast live to all connected dashboards
    io.emit('new_deployment', deployment);

    res.status(201).json(deployment);
  } catch (error) {
    console.error("Trigger Error:", error);
    res.status(500).json({ error: "Failed to trigger deployment" });
  }
});

// ─── Serve Static Frontend (Production) ──────────────────────────
app.use(express.static(path.join(__dirname, '../frontend/dist')));

app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

// ─── Error Handling Middleware ────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// ─── Start Server ────────────────────────────────────────────────
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`🚀 Nexus CI/CD Server running on port ${PORT}`);
  console.log(`📡 WebSocket server ready`);
  console.log(`🗄️  Database: PostgreSQL via Prisma`);
});

// ─── Graceful Shutdown ───────────────────────────────────────────
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  await prisma.$disconnect();
  server.close(() => process.exit(0));
});

process.on('SIGINT', async () => {
  console.log('SIGINT received. Shutting down...');
  await prisma.$disconnect();
  server.close(() => process.exit(0));
});