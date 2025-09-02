#!/usr/bin/env node

const path = require('path');
const { spawn } = require('child_process');

async function main() {
  const chalk = (await import('chalk')).default;
  const open = (await import('open')).default;

  // ASCII art banner
  console.log(chalk.cyan(`
   _____ _____ _______ ____  _____  
  / ____/ ____|__   __/ __ \\|  __ \\ 
 | |   | |       | | | |  | | |__) |
 | |   | |       | | | |  | |  ___/ 
 | |___| |____   | | | |__| | |     
  \\_____\\_____|  |_|  \\____/|_|     
`));
  console.log(chalk.gray('  CCTop - Claude Code Monitor\n'));
  
  // Use fixed port 8998
  const port = 8998;
  
  console.log(chalk.cyan('🚀 Starting cctop...'));
  console.log(chalk.gray(`   Port: ${port}`));
  
  // Set environment variables
  process.env.PORT = String(port);
  process.env.NODE_ENV = 'production';
  
  // Check if dist exists
  const fs = require('fs');
  const distPath = path.join(__dirname, 'dist');
  if (!fs.existsSync(distPath)) {
    console.log(chalk.yellow('⚠️  Production build not found. Building...'));
    const { execSync } = require('child_process');
    try {
      execSync('npm run build', { stdio: 'inherit' });
    } catch (error) {
      console.error(chalk.red('❌ Build failed. Please run "npm run build" manually.'));
      process.exit(1);
    }
  }
  
  // Start the server
  const serverProcess = spawn('node', ['dist/index.js'], {
    stdio: 'inherit',
    env: { ...process.env },
    cwd: __dirname
  });
  
  // Open browser after a short delay
  setTimeout(async () => {
    const url = `http://localhost:${port}`;
    console.log(chalk.green(`\n✨ Opening ${url} in your browser...`));
    await open(url);
  }, 2000);
  
  // Handle exit
  process.on('SIGINT', () => {
    console.log(chalk.yellow('\n👋 Shutting down cctop...'));
    serverProcess.kill();
    process.exit(0);
  });
  
  serverProcess.on('error', (error) => {
    console.error(chalk.red('❌ Failed to start server:'), error);
    process.exit(1);
  });
  
  serverProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(chalk.red(`❌ Server exited with code ${code}`));
      process.exit(code);
    }
  });
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});