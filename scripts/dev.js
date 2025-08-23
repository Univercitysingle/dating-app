const { spawn } = require('child_process');

const backend = spawn('npm', ['run', 'dev:backend'], { stdio: 'inherit', shell: true });
const frontend = spawn('npm', ['run', 'dev:frontend'], { stdio: 'inherit', shell: true });

function exit() {
  backend.kill();
  frontend.kill();
  process.exit();
}

process.on('SIGINT', exit);
process.on('SIGTERM', exit);
process.on('exit', exit);
