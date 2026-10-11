# homebridge-restart-switch

A HomeKit switch that restarts Homebridge, with the accessory's info
fields doubling as a status readout — hostname, LAN IP, Homebridge/Node
versions, and an optional device ID you assign (shown as the Model field, so
it's visible at a glance in the Home app's Home Hubs & Bridges list).

## Install

This is a Homebridge platform plugin. On a Config UI X install where
plugins are scoped to a per-instance folder (check for
`UIX_CUSTOM_PLUGIN_PATH` in the Homebridge process environment —
`grep UIX_CUSTOM_PLUGIN_PATH /proc/<homebridge-pid>/environ`), install
into that folder rather than globally:

```bash
npm run build
npm pack
cd /var/lib/homebridge   # or wherever UIX_CUSTOM_PLUGIN_PATH points
npm install /path/to/homebridge-restart-switch-1.0.0.tgz --save
```

A plain global install (`npm install -g`) will build without error but
Homebridge won't discover the plugin under a strict-plugin-resolution
Config UI X setup — it has to land inside the instance's own
`node_modules`.

Restart Homebridge once manually afterwards to pick it up.

## Configure

In Homebridge UI → Plugins → On Cue HB → Settings, or add directly to
`config.json` under `platforms`:

```json
{
  "platforms": [
    {
      "platform": "HomebridgeRestartSwitch",
      "name": "On Cue HB",
      "deviceId": "site-0123",
      "restartMethod": "systemd",
      "useSudo": true,
      "serviceName": "homebridge",
      "confirmWindowSeconds": 15,
      "restartDelaySeconds": 2
    }
  ]
}
```

### `restartMethod` options

- `auto` (default) — detects hb-service or PM2 from environment variables,
  otherwise assumes systemd.
- `hb-service` — runs `hb-service restart` (Homebridge Config UI X).
- `systemd` — runs `systemctl restart <serviceName>` (default service
  name `homebridge`). This is the recommended option when Homebridge
  runs as a systemd service with `Restart=always` — the switch tells
  systemd to restart, systemd brings the process back.
- `pm2` — runs `pm2 restart <pm2ProcessName>`.
- `custom` — runs whatever you put in `customCommand`.
- `exit` — just calls `process.exit()` and relies entirely on whatever
  supervises the process to relaunch it. Note this plugin always runs
  as an isolated HomeKit child bridge (a separate forked subprocess),
  so `process.exit()` only kills that subprocess — it will NOT restart
  the main Homebridge process. Use `systemd`/`hb-service`/`pm2` instead
  unless you specifically want to recycle just this plugin's own
  process.

Every path ends by calling `process.exit()` a couple of seconds after the
exec'd command, as a fallback in case that command didn't already tear the
process down.

If your restart command needs elevated privileges, set `useSudo: true` and
make sure the user Homebridge runs as can run that specific command via
sudo without a password prompt — a narrow `visudo` NOPASSWD entry scoped
to just `systemctl restart homebridge`, not blanket sudo.

## Using it in Apple Home

The switch shows as **On** while Homebridge is running normally.
Turning it **off** triggers the restart; it flips back to on on its own
a moment later while the actual restart happens a couple of seconds
after that — treat it as a momentary control, not a persistent state.
Because it's a real HomeKit accessory (not a direct connection to the
Pi), it works the same over Wi-Fi or via remote access through your
Home Hub, with no need for your phone to reach the Pi directly.

Open the accessory's details page in Home (or the Eve app, which shows
more fields) to see:

- **Model** — the ID you assigned in `deviceId` (or the hostname if you
  left it blank), so you can tell several Pis apart at a glance in the
  Home Hubs & Bridges list. Configs that still use the old `oncueHomeId`
  name keep working.
- **Serial Number** — hostname, LAN IP, and Homebridge/Node versions,
  for deeper troubleshooting.

## Safety notes

- The switch re-arms itself after `confirmWindowSeconds` in case the
  restart didn't actually happen (e.g. no process-manager restart policy
  configured) — otherwise a failed restart would leave the switch
  permanently unresponsive.
- Test your chosen `restartMethod` manually on the Pi first
  (`systemctl restart homebridge`, `hb-service restart`, etc.) before
  wiring it up to the switch, so you know it actually comes back.
- This plugin is built on the Platform API (`DynamicPlatformPlugin`),
  not the legacy single-Accessory API — on at least one Homebridge
  v2.4.0/hb-service setup, a legacy-API build of this same plugin hit
  an indefinite "Setting Up" spinner when pairing in the Home app. That
  turned out to be unrelated (an iOS/tvOS 27 HomeKit bug, since fixed
  by Apple), but the Platform API is the well-trodden path every other
  plugin on a typical instance already uses, so it's kept that way.
