import os from 'os';
import {
  CharacteristicEventTypes,
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue,
  PlatformAccessory,
  PlatformConfig,
} from 'homebridge';
import { performRestart, RestartConfig } from './restartMethods';
import { RestartSwitchPlatform } from './platform';

interface RestartPlatformConfig extends PlatformConfig, RestartConfig {
  oncueHomeId?: string;
  confirmWindowSeconds?: number;
  restartDelaySeconds?: number;
}

/**
 * Wires up the AccessoryInformation + Switch services on a
 * PlatformAccessory, and the restart-on-tap behaviour. Called once for
 * a freshly created accessory and once for one restored from cache —
 * either way it (re)attaches fresh characteristic handlers, since those
 * don't survive a Homebridge restart.
 */
export function setupRestartAccessory(
  platform: RestartSwitchPlatform,
  accessory: PlatformAccessory,
  rawConfig: PlatformConfig,
): void {
  const config = rawConfig as RestartPlatformConfig;
  const { Service: S, Characteristic: C } = platform;
  const log = platform.log;

  // --- Accessory info doubles as a client-info readout ---
  const hostname = os.hostname();
  const lanIp = getLanIp();
  const homebridgeVersion = platform.api.serverVersion || 'unknown';
  const nodeVersion = process.version;
  const oncueHomeId = config.oncueHomeId?.trim();

  // Model is what the Home app shows at a glance in the Home Hubs &
  // Bridges list, so the assigned On Cue Home ID goes there — Serial
  // Number carries the fuller hostname/IP detail for when you tap in.
  const modelId = oncueHomeId || hostname;
  const serial = `${hostname} (${lanIp}) · Homebridge ${homebridgeVersion} / Node ${nodeVersion}`;

  const infoService = accessory.getService(S.AccessoryInformation) || accessory.addService(S.AccessoryInformation);
  infoService
    .setCharacteristic(C.Manufacturer, 'On Cue Home')
    .setCharacteristic(C.Model, modelId)
    .setCharacteristic(C.SerialNumber, serial)
    .setCharacteristic(C.FirmwareRevision, homebridgeVersion);

  // --- Restart control ---
  // Shown as ON while Homebridge is running normally; turning it OFF is
  // the trigger to restart, and it flips back to ON a moment later.
  const switchName = (config.name as string) || 'On Cue HB';
  const switchService = accessory.getService(S.Switch) || accessory.addService(S.Switch, switchName);

  let armed = true;
  let restarting = false;

  const resetSwitch = () => {
    setTimeout(() => {
      switchService.updateCharacteristic(C.On, true);
    }, 400);
  };

  switchService
    .getCharacteristic(C.On)
    .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
      callback(null, true);
    })
    .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
      if (value !== false) {
        // Ignore the "on" call HomeKit sends right after the switch
        // auto-resets back to on — it's handled below.
        callback(null);
        return;
      }

      if (restarting) {
        log.warn('Restart already in progress — ignoring extra tap.');
        callback(null);
        return;
      }

      if (!armed) {
        log.warn('Restart switch is re-arming — ignoring tap.');
        resetSwitch();
        callback(null);
        return;
      }

      armed = false;
      restarting = true;
      callback(null);

      const delaySeconds = config.restartDelaySeconds ?? 2;
      const confirmWindow = (config.confirmWindowSeconds ?? 15) * 1000;

      log.warn(`Restart switch triggered. Restarting Homebridge in ${delaySeconds}s...`);
      resetSwitch();

      setTimeout(() => {
        performRestart(config, log).catch((err) => {
          log.error(`Restart failed: ${(err as Error).message}`);
          restarting = false;
        });
      }, delaySeconds * 1000);

      // Re-arm in case the process manager doesn't actually bring
      // Homebridge back and this same instance keeps running.
      setTimeout(() => {
        armed = true;
        restarting = false;
      }, confirmWindow);
    });

  log.info(
    `Homebridge Restart Switch ready (${serial}, Homebridge ${homebridgeVersion}, Node ${nodeVersion}).`,
  );
}

function getLanIp(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'unknown IP';
}
