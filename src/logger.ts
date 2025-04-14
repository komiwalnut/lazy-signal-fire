import fs from 'fs';
import path from 'path';

const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  try {
    fs.mkdirSync(logDir, { recursive: true });
  } catch (error) {
    console.error('Failed to create log directory:', error);
  }
}

function getTimestamp(): string {
  return new Date().toISOString();
}

function getLogFilePath(): string {
  const date = new Date().toISOString().split('T')[0];
  return path.join(logDir, `${date}.log`);
}

function writeToFile(message: string): void {
  try {
    fs.appendFileSync(getLogFilePath(), message + '\n');
  } catch (error) {
    console.error('Failed to write to log file:', error);
  }
}

function log(level: string, message: string, ...args: any[]): void {
  const formattedMessage = `[${getTimestamp()}] [${level}] ${message}`;
  
  if (level === 'ERROR') {
    console.error(formattedMessage, ...args);
  } else if (level === 'WARN') {
    console.warn(formattedMessage, ...args);
  } else {
    console.log(formattedMessage, ...args);
  }

  writeToFile(formattedMessage + (args.length ? ' ' + JSON.stringify(args) : ''));
}

export const logger = {
  info: (message: string, ...args: any[]) => log('INFO', message, ...args),
  warn: (message: string, ...args: any[]) => log('WARN', message, ...args),
  error: (message: string | Error, ...args: any[]) => {
    const errorMessage = message instanceof Error 
      ? `${message.message}\n${message.stack}`
      : message;
    log('ERROR', errorMessage, ...args);
  }
};