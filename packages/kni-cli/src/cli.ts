#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { parse, createRuntime } from 'kni-core';
import type { RuntimeEvent } from 'kni-core';

// ── Colors ──

const c = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

// ── Main ──

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log(`${c.bold}kNi Player${c.reset} — kNi DSL runtime`);
    console.log(`Usage: kni <file.kni>\n`);
    process.exit(0);
  }

  const filePath = path.resolve(args[0]);
  if (!fs.existsSync(filePath)) {
    console.error(`${c.red}File not found:${c.reset} ${filePath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, 'utf-8');

  let ast;
  try {
    ast = parse(content);
  } catch (e: any) {
    console.error(`${c.red}Parse error:${c.reset} ${e.message}`);
    process.exit(1);
  }

  const runtime = createRuntime(ast);
  const events = runtime.start();

  if (ast.config) {
    console.log(`\n${c.bold}${c.cyan}━━━ ${ast.config.title} ━━━${c.reset}`);
    console.log(`${c.dim}by ${ast.config.author} v${ast.config.version}${c.reset}\n`);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (prompt: string): Promise<string> =>
    new Promise(resolve => rl.question(prompt, resolve));

  await runEvents(events, runtime, ask, rl);

  rl.close();
}

async function runEvents(
  events: RuntimeEvent[],
  runtime: ReturnType<typeof createRuntime>,
  ask: (prompt: string) => Promise<string>,
  rl: readline.Interface
) {
  let i = 0;

  while (i < events.length) {
    const ev = events[i];

    switch (ev.kind) {
      case 'DIALOG': {
        const name = ev.charName || ev.char;
        const color = ev.color || '#ffffff';
        // Map hex to nearest ANSI
        const nameColor = hexToAnsi(color);
        const mods = ev.modifiers.map(m => m.type).join(', ');
        if (mods) {
          process.stdout.write(`${c.dim}(${mods})${c.reset} `);
        }
        console.log(`${c.bold}${nameColor}${name}${c.reset}: ${ev.text}`);
        await waitForInput(ask);
        i++;
        break;
      }

      case 'NARRATION': {
        const mods = ev.modifiers.map(m => m.type).join(', ');
        if (mods) {
          process.stdout.write(`${c.dim}(${mods})${c.reset} `);
        }
        console.log(`${c.dim}${ev.text}${c.reset}`);
        await waitForInput(ask);
        i++;
        break;
      }

      case 'CHOICE': {
        if (ev.prompt) {
          console.log(`\n${c.yellow}? ${ev.prompt}${c.reset}\n`);
        }
        ev.options.forEach((opt, idx) => {
          const num = c.bold + c.green + (idx + 1) + c.reset;
          const disabled = opt.enabled ? '' : ` ${c.dim}(locked)${c.reset}`;
          console.log(`  ${num}. ${opt.text}${disabled}`);
        });

        const enabled = ev.options
          .map((opt, idx) => ({ opt, idx }))
          .filter(({ opt }) => opt.enabled);

        let choice = -1;
        while (true) {
          const input = await ask(`\n${c.cyan}> ${c.reset}`);
          const num = parseInt(input, 10) - 1;
          if (num >= 0 && num < ev.options.length && ev.options[num].enabled) {
            choice = num;
            break;
          }
          console.log(`${c.red}Invalid choice.${c.reset}`);
        }

        const newEvents = runtime.selectOption(choice);
        events = newEvents;
        i = 0;
        break;
      }

      case 'JUMP':
        i++;
        break;

      case 'ACTION': {
        // Show action feedback
        const actionDesc = describeAction(ev);
        if (actionDesc) {
          console.log(`${c.gray}  [${actionDesc}]${c.reset}`);
        }
        i++;
        break;
      }

      case 'WAIT':
        await sleep(600);
        i++;
        break;

      case 'END':
        console.log(`\n${c.dim}━━━ End ━━━${c.reset}\n`);
        return;

      case 'ERROR':
        console.error(`${c.red}Error: ${ev.message}${c.reset}`);
        return;

      default:
        i++;
    }
  }
}

function waitForInput(ask: (p: string) => Promise<string>): Promise<void> {
  return new Promise(async (resolve) => {
    await ask(`${c.dim}▸ ${c.reset}`);
    resolve();
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function describeAction(ev: RuntimeEvent & { kind: 'ACTION' }): string | null {
  switch (ev.type) {
    case 'give': return `+ ${ev.target}`;
    case 'remove': return `- ${ev.target}`;
    case 'set': return `${ev.target} = ${ev.value}`;
    case 'add_flag': return `flag: ${ev.target}`;
    case 'del_flag': return `unflag: ${ev.target}`;
    case 'sfx': return `sfx: ${ev.target}`;
    case 'shake': return `shake ${ev.target}`;
    case 'bg': return `bg: ${ev.target}`;
    case 'music': return `music: ${ev.target}`;
    case 'call': return `call: ${ev.target}`;
    default: return null;
  }
}

function hexToAnsi(hex: string): string {
  // Simple hex to ANSI mapping
  const map: Record<string, string> = {
    '#a3cfff': '\x1b[96m',  // light cyan
    '#ff6b6b': '\x1b[91m',  // light red
    '#51cf66': '\x1b[92m',  // light green
    '#ffd43b': '\x1b[93m',  // light yellow
    '#82aaff': '\x1b[94m',  // light blue
    '#c792ea': '\x1b[95m',  // light magenta
    '#ffffff': '\x1b[97m',  // white
  };
  return map[hex.toLowerCase()] || '\x1b[97m';
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
