#!/usr/bin/env node
'use strict';
require('draftlog').into(console).addLineListener(process.stdin);
const chalk = require('chalk');
const speedTest = require('../');

let header;
let speeds;
let step = 'Ping';
const statuses = {
  Ping: true,
  Download: false,
  Upload: false,
};

const width = 24;
function updateLines() {
  const spinner = makeSpinner();
  const headerTxt = renderHeader(statuses, step);
  const speedsTxt = renderStatus(statuses, step, spinner);

  header('│' + headerTxt + '│');
  speeds('│' + speedsTxt + '│');
}

function renderHeader(statuses) {
  let txt = '';

  for (const k of Object.keys(statuses)) {
    const status = statuses[k];

    let col = centerText(k, width);
    if (status === false) {
      col = chalk.dim(col);
    } else {
      col = chalk.white.bold(col);
    }
    txt += col;
  }

  return txt;
}

function renderStatus(statuses, step, spinner) {
  let txt = '';
  for (const k of Object.keys(statuses)) {
    let status = statuses[k];
    status = String(status === Boolean(status) ? '' : status);

    if (!status) {
      status = spinner + ' ';
    }

    status = centerText(status, width);
    status = status.replace(/([KMGT]bps|ms)/gi, chalk.dim('$1'));
    if (step === k) {
      status = chalk.yellow(status);
    } else {
      status = chalk.blue(status);
    }

    txt += status;
  }
  return txt;
}

function centerText(text, n, length) {
  // Account for text length first
  n -= length || text.length;

  // Pad to be even
  if (n % 2 === 1) {
    text = ' ' + text;
  }

  // Round n to lowest number
  n = Math.floor(n / 2);

  // Make spacer
  const spacer = ' '.repeat(n);

  // Fill in text
  return spacer + text + spacer;
}

function speedText(speed) {
  let bits = speed * 8;
  const units = ['', 'K', 'M', 'G', 'T'];
  const places = [0, 1, 2, 3, 3];
  let unit = 0;
  while (bits >= 2000 && unit < 4) {
    unit++;
    bits /= 1000;
  }
  return `${bits.toFixed(places[unit])} ${units[unit]}bps`;
}

const frames = [
  '+---',
  '-+--',
  '--+-',
  '---+',
  '--+-',
  '-+--',
];
let lastChange = 0;
function makeSpinner() {
  if (Date.now() > lastChange + 30) {
    frames.unshift(frames.pop());
    lastChange = Date.now();
  }
  return frames[0];
}

const empty = () => console.log('│' + ' '.repeat(width * 3) + '│');
console.log();
console.log('┌' + '─'.repeat(width * 3) + '┐');
empty();
console.draft('│' + ' '.repeat(width * 3) + '│');
empty();
header = console.draft();
speeds = console.draft();
empty();
empty();
console.log('└' + '─'.repeat(width * 3) + '┘');
console.log();
console.log();

updateLines();

const options = {};

let paramError = null;
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  const next = process.argv[i + 1];
  if (i >= 2) {
    if (arg === '--help' || arg === '-h') {
      console.log(`Usage: ${process.argv[1]} [-h|--help] [--accept-license] [--accept-gdpr] [--server-id <id>] [--source-ip <ip>]`);
      console.log('-h  --help            Help');
      console.log('    --accept-license  Accept the Ookla EULA, TOS and Privacy policy. ');
      console.log('    --accept-gdpr     Accepts the Ookla GDPR terms. ');
      console.log('                      The terms only need to be accepted once.');
      console.log('    --server-id <id>  Test using a specific server by Ookla server ID');
      console.log('    --source-ip <ip>  Test a specific network interface identified by local IP');
      process.exit(0);
    } else if (arg === '--accept-license') {
      options.acceptLicense = true;
    } else if (arg === '--accept-gdpr') {
      options.acceptGdpr = true;
    } else if (arg === '--server-id') {
      if (next !== undefined) {
        i++;
        options.serverId = next;
      } else {
        paramError = 'Error: bad parameters';
      }
    } else if (arg === '--source-ip') {
      if (next !== undefined) {
        i++;
        options.sourceIp = next;
      } else {
        paramError = 'Error: bad parameters';
      }
    }
  }
}
if (paramError) {
  console.error();
  console.error(chalk.red(paramError));
  console.error();
  process.exit(1);
}

(async () => {
  try {
    setInterval(updateLines, 100);
    await speedTest({
      ...options,
      progress: event => {
        const content = event[event.type] || {};
        switch (event.type) {
          case 'ping':
            step = 'Ping';
            statuses.Ping = content.latency.toFixed(1) + ' ms';
            break;
          case 'download':
            statuses.Download = speedText(content.bandwidth);
            step = 'Download';
            break;
          case 'upload':
            statuses.Upload = speedText(content.bandwidth);
            step = 'Upload';
            break;
        }
      }
    });
    step = 'Finished';
    updateLines();
  } catch (err) {
    if (err.message.test(/acceptLicense/)) {
      console.error(chalk.red(err.message.replace('acceptLicense: true', '--accept-license')));
    } else {
      console.error(chalk.red(err.message.replace('acceptGdpr: true', '--accept-gdpr')));
    }
    process.exit(1);
  } finally {
    process.exit(0);
  }
})();
