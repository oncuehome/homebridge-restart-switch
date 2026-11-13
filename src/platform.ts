import {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
} from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import path from 'path';
import { setupRestartAccessory } from './restartAccessory';
import { RestartLog } from './restartLog';

/**
 * Platform version of the restart-switch plugin. Every other plugin on
 * this Homebridge instance uses the modern Platform API rather than the
 * legacy single-Accessory API, and this follows the same well-trodden
 * path (registerPlatformAccessories / configureAccessory) rather than
 * the legacy publishExternalAccessories path a plain AccessoryPlugin
 * takes — the two are handled differently internally, and the platform
 * path is the one every other installed plugin already relies on.
 */
export class RestartSwitchPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  public readonly accessories: PlatformAccessory[] = [];
  public readonly restartLog: RestartLog;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    // Keep a short history of restarts beside Homebridge's own files.
    this.restartLog = new RestartLog(path.join(api.user.storagePath(), 'restart-switch-log.json'));
    this.restartLog.record('start');
    const week = this.restartLog.summary(7);
    this.log.info(
      `Homebridge started. Last 7 days: ${week.starts} start${week.starts === 1 ? '' : 's'} ` +
      `(${week.fromSwitch} from the switch, ${week.other} other).`,
    );

    this.api.on('didFinishLaunching', () => {
      this.discoverDevices();
    });
  }

  /**
   * Called by Homebridge for every cached accessory this platform
   * previously registered, before didFinishLaunching fires.
   */
  configureAccessory(accessory: PlatformAccessory): void {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.push(accessory);
  }

  private discoverDevices(): void {
    const name = this.config.name || 'Restart Homebridge';
    const uuid = this.api.hap.uuid.generate(PLUGIN_NAME + '-restart-switch');

    const existing = this.accessories.find((a) => a.UUID === uuid);

    if (existing) {
      this.log.info('Restoring existing accessory:', existing.displayName);
      setupRestartAccessory(this, existing, this.config);
    } else {
      this.log.info('Adding new accessory:', name);
      const accessory = new this.api.platformAccessory(name, uuid);
      setupRestartAccessory(this, accessory, this.config);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }
}
