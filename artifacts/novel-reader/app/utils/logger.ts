import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

// Get external Downloads directory (where browser downloads go)
const getLogDirectory = async (): Promise<string> => {
  if (Platform.OS === 'android') {
    // Try external storage first (Downloads folder)
    const externalDir = FileSystem.cacheDirectory?.split('/cache')[0] + '/Download/NovelDR/';
    const externalPath = externalDir || `${FileSystem.documentDirectory}logs/`;
    
    try {
      const dirInfo = await FileSystem.getInfoAsync(externalPath);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(externalPath, { intermediates: true });
      }
      return externalPath;
    } catch (err) {
      // Fallback to app's private storage
      const fallbackPath = `${FileSystem.documentDirectory}logs/`;
      await FileSystem.makeDirectoryAsync(fallbackPath, { intermediates: true });
      return fallbackPath;
    }
  }
  // iOS fallback
  const iosPath = `${FileSystem.documentDirectory}logs/`;
  await FileSystem.makeDirectoryAsync(iosPath, { intermediates: true });
  return iosPath;
};

class AppLogger {
  private logFilePath: string | null = null;
  private sessionId: string;
  private logBuffer: string[] = [];
  private flushInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.sessionId = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  async init() {
    try {
      const logDir = await getLogDirectory();
      const date = new Date();
      const fileName = `noveldr_log_${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}_${date.getHours()}-${date.getMinutes()}-${date.getSeconds()}.txt`;
      this.logFilePath = `${logDir}${fileName}`;
      
      // Write header
      const header = [
        '='.repeat(60),
        `NovelDR Log - Session: ${this.sessionId}`,
        `Timestamp: ${new Date().toISOString()}`,
        `Platform: ${Platform.OS} ${Platform.Version}`,
        '='.repeat(60),
        '',
      ].join('\n');
      
      await FileSystem.writeAsStringAsync(this.logFilePath, header);
      console.log(`[Logger] Log file created at: ${this.logFilePath}`);
      
      // Auto-flush every 5 seconds
      this.flushInterval = setInterval(() => this.flush(), 5000);
    } catch (err) {
      console.error('[Logger] Failed to init:', err);
    }
  }

  private async flush() {
    if (this.logBuffer.length === 0 || !this.logFilePath) return;
    
    const lines = this.logBuffer.join('\n');
    this.logBuffer = [];
    
    try {
      await FileSystem.appendAsStringAsync(this.logFilePath, lines + '\n');
    } catch (err) {
      console.error('[Logger] Flush failed:', err);
    }
  }

  log(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', message: string, data?: any) {
    const timestamp = new Date().toISOString();
    const dataStr = data ? ` | ${JSON.stringify(data)}` : '';
    const logLine = `[${timestamp}] [${level}] ${message}${dataStr}`;
    
    // Also print to console
    console.log(logLine);
    
    // Add to buffer
    this.logBuffer.push(logLine);
    
    // Immediate flush for errors
    if (level === 'ERROR') {
      this.flush();
    }
  }

  async close() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    await this.flush();
    this.log(`INFO`, `Session ended - log saved to: ${this.logFilePath}`);
  }

  getLogPath(): string | null {
    return this.logFilePath;
  }
}

export const appLogger = new AppLogger();
