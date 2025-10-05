import express from 'express';
import https from 'https';
import path from 'path';
import { spawn } from 'child_process';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Store running processes and logs
let currentProcess = null;
let logs = [];
let lastResult = null;
let lastRun = null;

// Middleware
app.use(express.json());
app.use(express.static('.'));

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// API Routes
app.get('/api/setup-status', (req, res) => {
    const hasTokens = fs.existsSync('.tokens.json');
    res.json({
        hasTokens: hasTokens,
        setupComplete: hasTokens
    });
});

app.get('/api/status', (req, res) => {
    res.json({
        running: currentProcess !== null,
        lastRun: lastRun,
        lastResult: lastResult,
        logs: logs.slice(-50) // Last 50 log entries
    });
});

app.post('/api/blend', (req, res) => {
    if (currentProcess) {
        return res.status(400).json({ error: 'Blend already running' });
    }

    // Clear previous logs
    logs = [];
    lastRun = new Date().toISOString();

    // Start the blend process
    currentProcess = spawn('node', ['quick-blend.js'], {
        cwd: __dirname,
        stdio: ['pipe', 'pipe', 'pipe']
    });

    // Capture output
    let output = '';

    currentProcess.stdout.on('data', (data) => {
        const message = data.toString();
        output += message;
        logs.push({
            timestamp: new Date().toISOString(),
            type: 'info',
            message: message.trim()
        });
    });

    currentProcess.stderr.on('data', (data) => {
        const message = data.toString();
        output += message;
        logs.push({
            timestamp: new Date().toISOString(),
            type: 'error',
            message: message.trim()
        });
    });

    currentProcess.on('close', (code) => {
        lastResult = {
            success: code === 0,
            timestamp: new Date().toISOString(),
            output: output
        };
        currentProcess = null;
    });

    res.json({ message: 'Blend started successfully' });
});

// HTTPS Configuration using YunoHost certificates
const httpsOptions = {
    key: fs.readFileSync('/etc/yunohost/certs/hapfel.org/key.pem'),
    cert: fs.readFileSync('/etc/yunohost/certs/hapfel.org/crt.pem')
};

// Create HTTPS server
const server = https.createServer(httpsOptions, app);

server.listen(PORT, () => {
    console.log(`Spotify Blend Generator running on port ${PORT}`);
    console.log(`Access at: https://hapfel.org:${PORT}`);
    console.log(`HTTPS enabled with YunoHost certificates`);
});