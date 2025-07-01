const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    server: 'windows-build-server'
  });
});

// MCP endpoint
app.post('/mcp', async (req, res) => {
  console.log('Received MCP request:', JSON.stringify(req.body, null, 2));
  
  const { method, params } = req.body;
  
  try {
    if (method === 'tools/list') {
      res.json({
        tools: [
          {
            name: 'build_dotnet',
            description: 'Build a .NET application',
            inputSchema: {
              type: 'object',
              properties: {
                projectPath: { type: 'string' },
                configuration: { type: 'string' }
              },
              required: ['projectPath']
            }
          },
          {
            name: 'run_powershell',
            description: 'Execute PowerShell commands',
            inputSchema: {
              type: 'object',
              properties: {
                command: { type: 'string' }
              },
              required: ['command']
            }
          }
        ]
      });
    } else if (method === 'tools/call') {
      const { name, arguments: args } = params;
      let result;
      
      switch (name) {
        case 'build_dotnet':
          result = await executeBuild('dotnet', ['build', args.projectPath, '-c', args.configuration || 'Debug']);
          break;
        case 'run_powershell':
          result = await executeBuild('powershell', ['-Command', args.command]);
          break;
        default:
          result = { content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
      }
      
      res.json(result);
    } else {
      res.json({ error: `Unknown method: ${method}` });
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

async function executeBuild(command, args) {
  return new Promise((resolve) => {
    const process = spawn(command, args, { shell: true });
    let output = '';
    let error = '';

    process.stdout.on('data', (data) => {
      output += data.toString();
    });

    process.stderr.on('data', (data) => {
      error += data.toString();
    });

    process.on('close', (code) => {
      resolve({
        content: [{
          type: 'text',
          text: `Exit code: ${code}\n\nOutput:\n${output}\n\nErrors:\n${error}`
        }]
      });
    });
  });
}

const PORT = 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`MCP server running on http://0.0.0.0:${PORT}`);
  console.log(`Health check: http://0.0.0.0:${PORT}/health`);
  console.log(`MCP endpoint: http://0.0.0.0:${PORT}/mcp`);
});