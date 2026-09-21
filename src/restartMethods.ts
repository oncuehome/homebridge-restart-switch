import { exec } from 'child_process';
import { Logger } from 'homebridge';

export type RestartMethod = 'auto' | 'hb-service' | 'systemd' | 'pm2' | 'custom' | 'exit';

export interface RestartConfig {
  restartMethod?: RestartMethod;
  serviceName?: string;
  pm2ProcessName?: string;
  customCommand?: string;
  useSudo?: boolean;
}

function run(command: string, log: Logger): Promise<void> {
  return new Promise((resolve, reject) => {
    log.info(`Running restart command: ${command}`);
    exec(command, (error, stdout, stderr) => {
      if (stdout?.trim()) {
        log.debug(stdout.trim());
      }
      if (stderr?.trim()) {
        log.debug(stderr.trim());
      }
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

/**
 * Detects which process manager Homebridge is most likely running under,
 * purely from environment clues — used only when restartMethod is "auto".
 */
function detectMethod(): Exclude<RestartMethod, 'auto'> {
  // hb-service (Homebridge Config UI X) sets this on the child process it spawns.
  if (process.env.UIX_BASE_PATH || process.env.UIX_STORAGE_PATH || process.env.UIX_SERVICE_MODE) {
    return 'hb-service';
  }
  // PM2 sets these on managed processes.
  if (process.env.PM2_HOME || process.env.pm_id !== undefined) {
    return 'pm2';
  }
  // Fall back to systemd if the unit looks present; otherwise just exit
  // and let whatever supervises the process (systemd Restart=, Docker
  // restart policy, PM2 autorestart) bring it back.
  return 'systemd';
}

/**
 * Attempts to restart Homebridge using the configured (or auto-detected)
 * method. Every path other than a bare "exit" ends by calling
 * process.exit(1) as a fallback/last step, since most process managers
 * (systemd Restart=on-failure, hb-service, PM2 autorestart) are what
 * actually relaunches the process — the exec'd command either asks that
 * manager to do it directly or is a no-op safety net.
 */
export async function performRestart(config: RestartConfig, log: Logger): Promise<void> {
  const method = config.restartMethod && config.restartMethod !== 'auto'
    ? config.restartMethod
    : detectMethod();

  const sudo = config.useSudo ? 'sudo ' : '';

  try {
    switch (method) {
      case 'hb-service':
        // hb-service restart handles both the systemd unit and the
        // Docker/standalone cases it manages.
        await run(`${sudo}hb-service restart`, log);
        // hb-service restart already replaces the process; if we're
        // still alive after a short wait, fall through to exit.
        break;
      case 'systemd':
        await run(`${sudo}systemctl restart ${config.serviceName || 'homebridge'}`, log);
        break;
      case 'pm2':
        await run(`pm2 restart ${config.pm2ProcessName || 'homebridge'}`, log);
        break;
      case 'custom':
        if (!config.customCommand) {
          log.warn('No custom restart command configured — falling back to process.exit().');
        } else {
          await run(config.customCommand, log);
        }
        break;
      case 'exit':
        // Nothing to exec — just exit below.
        break;
      default:
        break;
    }
  } catch (err) {
    log.warn(`Restart command failed (${(err as Error).message}). Falling back to process.exit().`);
  }

  // Give the exec'd command a moment to take effect (e.g. hb-service
  // restart may tear the process down itself) before force-exiting.
  setTimeout(() => {
    log.info('Exiting Homebridge process now.');
    process.exit(1);
  }, 1500);
}
