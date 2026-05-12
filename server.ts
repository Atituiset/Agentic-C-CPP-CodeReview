import express from 'express';
import { createServer as createViteServer } from 'vite';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NUM_SLOTS = 3;
// Keep track of active SSE response objects per slot
const slotClients: express.Response[][] = Array.from({ length: NUM_SLOTS }, () => []);

// We will store current slot status so new connections get the latest state
const slotStates = Array.from({ length: NUM_SLOTS }, () => ({
  taskId: null as string | null,
  filePath: null as string | null,
  status: 'waiting' as 'waiting' | 'running' | 'done' | 'failed'
}));

function pushToSlot(slotId: number, data: any) {
  slotClients[slotId].forEach(res => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  });
}

function updateSlotState(slotId: number, event: 'acquire' | 'status' | 'release', payload: any) {
  if (event === 'acquire') {
    slotStates[slotId].taskId = payload.task_id;
    slotStates[slotId].filePath = payload.file_path;
    slotStates[slotId].status = 'running';
  } else if (event === 'status') {
    slotStates[slotId].status = payload.status;
  } else if (event === 'release') {
    slotStates[slotId].taskId = null;
    slotStates[slotId].filePath = null;
    slotStates[slotId].status = 'waiting';
  }
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;
  
  app.use(express.json());

  // =============================================================================
  // SSE Endpoints for Browser
  // =============================================================================
  app.get('/api/sse/:slot_id', (req, res) => {
    const slotId = parseInt(req.params.slot_id, 10);
    if (isNaN(slotId) || slotId < 0 || slotId >= NUM_SLOTS) {
      res.status(400).send('Invalid slot');
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // Add client
    slotClients[slotId].push(res);
    
    // Hydrate client with current state
    const state = slotStates[slotId];
    if (state.taskId) {
      res.write(`data: ${JSON.stringify({ type: 'meta', event: 'acquire', task_id: state.taskId, file_path: state.filePath, slot: slotId })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'meta', event: 'status', status: state.status, slot: slotId })}\n\n`);
    }

    req.on('close', () => {
      const index = slotClients[slotId].indexOf(res);
      if (index !== -1) slotClients[slotId].splice(index, 1);
    });
  });

  // =============================================================================
  // Internal API Endpoints (Simulating what Orchestrator calls)
  // =============================================================================
  app.post('/api/slot/:slot_id/acquire', (req, res) => {
    const slotId = parseInt(req.params.slot_id, 10);
    const msg = { type: 'meta', event: 'acquire', task_id: req.body.task_id, file_path: req.body.file_path, slot: slotId };
    updateSlotState(slotId, 'acquire', req.body);
    pushToSlot(slotId, msg);
    res.json({ ok: true });
  });

  app.post('/api/slot/:slot_id/push', (req, res) => {
    const slotId = parseInt(req.params.slot_id, 10);
    const msg = { type: req.body.log_type || 'stdout', content: req.body.content, slot: slotId };
    pushToSlot(slotId, msg);
    res.json({ ok: true });
  });

  app.post('/api/slot/:slot_id/status', (req, res) => {
    const slotId = parseInt(req.params.slot_id, 10);
    const msg = { type: 'meta', event: 'status', status: req.body.status, duration: req.body.duration, slot: slotId };
    updateSlotState(slotId, 'status', req.body);
    pushToSlot(slotId, msg);
    res.json({ ok: true });
  });

  app.post('/api/slot/:slot_id/release', (req, res) => {
    const slotId = parseInt(req.params.slot_id, 10);
    const msg = { type: 'meta', event: 'release', slot: slotId };
    updateSlotState(slotId, 'release', {});
    pushToSlot(slotId, msg);
    res.json({ ok: true });
  });

  // Simulator hook to trigger a mock scan from the frontend
  let isScanning = false;
  app.post('/api/start_scan', async (req, res) => {
    if (isScanning) return res.status(400).json({ error: 'Already scanning' });
    isScanning = true;
    res.json({ message: 'Scan simulated' });

    const files = [
       "src/wireless/timer_manager.c",
       "src/memory_pool.cpp",
       "src/mac/scheduler.c",
       "src/rrc/asn1_decoder.cpp",
       "src/network/socket_manager.cpp",
       "src/crypto/key_derivation.c"
    ];

    let fileIndex = 0;
    const processSlot = async (slotId: number) => {
      while (fileIndex < files.length) {
        const file = files[fileIndex++];
        if (!file) break;
        const taskId = `task-${fileIndex.toString().padStart(3, '0')}`;
        
        // Acquire
        const acquireBody = { task_id: taskId, file_path: file };
        updateSlotState(slotId, 'acquire', acquireBody);
        pushToSlot(slotId, { type: 'meta', event: 'acquire', ...acquireBody, slot: slotId });
        
        await new Promise(r => setTimeout(r, 200));

        // Start SAST Pipeline
        pushToSlot(slotId, { type: 'stdout', content: `[Pipeline] Initiating hybrid scan for ${file}...\n` });
        await new Promise(r => setTimeout(r, 300));
        
        // Simulating Local SAST
        pushToSlot(slotId, { type: 'stdout', content: `[Semgrep] Executing local ruleset (30 rules)...\n` });
        await new Promise(r => setTimeout(r, 400));
        
        pushToSlot(slotId, { type: 'stdout', content: `[Clang] Extracting AST and Call Graph indexing...\n` });
        await new Promise(r => setTimeout(r, 500));

        // Transition to LLM if needed or finish
        if (file.includes('memory_pool.cpp')) {
           pushToSlot(slotId, { type: 'stdout', content: `[Aggegator] SAST found potential critical issue. Forwarding to NGA (LLM) for semantic validation...\n` });
           await new Promise(r => setTimeout(r, 600));
           pushToSlot(slotId, { type: 'stderr', content: `\x1b[31m[CRITICAL] RULE-008: Memory Leak detected\x1b[0m\n` });
           pushToSlot(slotId, { type: 'stdout', content: `NGA Semantic validation: \`malloc\` is called in \`allocate()\` but \`deallocate()\` is a stub. Context confirms leak.\n` });
           updateSlotState(slotId, 'status', { status: 'failed' });
           pushToSlot(slotId, { type: 'meta', event: 'status', status: 'failed', duration: 2.1 });
        } else if (file.includes('timer_manager.c')) {
           pushToSlot(slotId, { type: 'stdout', content: `[Aggegator] SAST flagged unclosed timer. Forwarding to NGA...\n` });
           await new Promise(r => setTimeout(r, 800));
           pushToSlot(slotId, { type: 'stderr', content: `\x1b[33m[HIGH] RULE-011: Timer Leak\x1b[0m\n` });
           pushToSlot(slotId, { type: 'stdout', content: `NGA Analysis: \`start_timer\` called on line 42, but error path on line 55 returns without \`stop_timer\`.\n` });
           updateSlotState(slotId, 'status', { status: 'failed' });
           pushToSlot(slotId, { type: 'meta', event: 'status', status: 'failed', duration: 1.8 });
        } else if (file.includes('crypto')) {
           pushToSlot(slotId, { type: 'stderr', content: `\x1b[33m[HIGH] RULE-023: Cryptographic Misuse\x1b[0m\n` });
           pushToSlot(slotId, { type: 'stdout', content: `[Semgrep] Local engine matched: \`rand()\` used for key generation instead of secure PRNG.\n` });
           pushToSlot(slotId, { type: 'stdout', content: `[Aggegator] High confidence SAST finding. Bypassing NGA payload to save cost.\n` });
           updateSlotState(slotId, 'status', { status: 'done' });
           pushToSlot(slotId, { type: 'meta', event: 'status', status: 'done', duration: 0.9 });
        } else {
           pushToSlot(slotId, { type: 'stdout', content: `[Aggegator] Local SAST engines passed completely. Target verified.\n` });
           pushToSlot(slotId, { type: 'stdout', content: `\x1b[32m✔ No issues found.\x1b[0m\n` });
           updateSlotState(slotId, 'status', { status: 'done' });
           pushToSlot(slotId, { type: 'meta', event: 'status', status: 'done', duration: 0.7 });
        }

        await new Promise(r => setTimeout(r, 800));
        
        // Release
        updateSlotState(slotId, 'release', {});
        pushToSlot(slotId, { type: 'meta', event: 'release', slot: slotId });
        await new Promise(r => setTimeout(r, 200));
      }
    };

    await Promise.all([processSlot(0), processSlot(1), processSlot(2)]);
    isScanning = false;
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Ensure parsing numbers for port
  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
