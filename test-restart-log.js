'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { RestartLog } = require('./dist/restartLog');
const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rl-')), 'log.json');
const t = (s) => new Date(`2026-11-13T${s}Z`);
const a = new RestartLog(f);
a.record('start', t('08:00:00'));                  // first start, no switch before it
a.record('switch', t('14:36:00'));
assert.strictEqual(a.record('start', t('14:36:10')).afterSwitch, true);   // follows a tap
a.record('start', t('18:00:00'));                  // later, not from the switch
assert.deepStrictEqual(a.summary(7, t('19:00:00')), { starts: 3, fromSwitch: 1, other: 2 });
const b = new RestartLog(f);                        // survives a restart
assert.strictEqual(b.summary(7, t('19:00:00')).starts, 3);
assert.strictEqual(b.summary(0.01, t('19:00:00')).starts, 0, 'old entries fall out of the window');
fs.writeFileSync(f, 'not json'); assert.strictEqual(new RestartLog(f).summary(7).starts, 0);
const c = new RestartLog(f); for (let i = 0; i < 250; i++) c.record('start', t('08:00:00')); assert(JSON.parse(fs.readFileSync(f, 'utf8')).entries.length <= 200);
console.log('restart log checks passed');
