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
import { setupRestartAccessory } from './restartAccessory';

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

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

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
    const name = this.config.name || 'Homebridge';
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
