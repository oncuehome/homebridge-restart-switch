import fs from 'fs';

export type RestartKind = 'switch' | 'start';

export interface RestartEntry {
  at: string;
  kind: RestartKind;
  /** Only on 'start': true when it followed a switch tap within a few minutes. */
  afterSwitch?: boolean;
}

const MAX_ENTRIES = 200;
const SWITCH_TO_START_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A small history of restarts, kept in Homebridge's storage folder so other
 * tools (and the next start) can read it: every tap of the switch, and every
 * time this plugin starts, which is every Homebridge start. A start that is not
 * close behind a switch tap is a restart from something else (a crash, an
 * update, a reboot).
 */
export class RestartLog {
  private entries: RestartEntry[] = [];

  constructor(private readonly file: string) {
    this.load();
  }

  private load(): void {
    try {
      const j = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (Array.isArray(j.entries)) {
        this.entries = j.entries.filter((e: RestartEntry) => e && typeof e.at === 'string' && (e.kind === 'switch' || e.kind === 'start'));
      }
    } catch {
      this.entries = [];
    }
  }

  private save(): void {
    try {
      fs.writeFileSync(this.file + '.tmp', JSON.stringify({ entries: this.entries }));
      fs.renameSync(this.file + '.tmp', this.file);
    } catch {
      // The log is a convenience; never stop Homebridge over it.
    }
  }

  record(kind: RestartKind, now: Date = new Date()): RestartEntry {
    const entry: RestartEntry = { at: now.toISOString(), kind };
    if (kind === 'start') {
      const lastSwitch = [...this.entries].reverse().find((e) => e.kind === 'switch');
      entry.afterSwitch = !!lastSwitch && now.getTime() - Date.parse(lastSwitch.at) < SWITCH_TO_START_MS;
    }
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(-MAX_ENTRIES);
    }
    this.save();
    return entry;
  }

  /** Homebridge starts in the last `days`, split by whether the switch caused them. */
  summary(days: number, now: Date = new Date()): { starts: number; fromSwitch: number; other: number } {
    const since = now.getTime() - days * DAY_MS;
    const starts = this.entries.filter((e) => e.kind === 'start' && Date.parse(e.at) >= since);
    const fromSwitch = starts.filter((e) => e.afterSwitch).length;
    return { starts: starts.length, fromSwitch, other: starts.length - fromSwitch };
  }
}
