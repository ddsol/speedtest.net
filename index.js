/*

Speedtest.net client.

The MIT License (MIT)

Copyright (c) 2014 Han de Boer

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

*/

'use strict';

const util = require('util');
const path = require('path');
const mkdirp = require('mkdirp');
const sha256File = util.promisify(require('sha256-file'));
const fs = require('fs');
const childProcess = require('child_process');
const download = require('download');
const decompress = require('decompress');
const decompressTar = require('decompress-tar');
const decompressTarbz2 = require('decompress-tarbz2');
const decompressTargz = require('decompress-targz');
const decompressUnzip = require('decompress-unzip');
const decompressTarXz = require('decompress-tarxz');
const kill = require('tree-kill');

function fileExists(file) {
  return new Promise(resolve => fs.access(file, fs.F_OK, err => resolve(!err)));
}

function chMod(file, mode) {
  return new Promise((resolve, reject) => fs.chmod(file, mode, err => {
    if (err) reject(err);
    resolve();
  }));
}

const defaultBinaryVersion = '1.0.0';

const platforms = [
  {
    platform: 'darwin',
    arch: 'x64',
    pkg: 'macosx.tgz',
    bin: 'macosx',
    sha: '8d0af8a81e668fbf04b7676f173016976131877e9fbdcd0a396d4e6b70a5e8f4'
  },
  {
    platform: 'win32',
    arch: 'x64',
    pkg: 'win64.zip',
    bin: 'win-x64.exe',
    sha: '64054a021dd7d49e618799a35ddbc618dcfc7b3990e28e513a420741717ac1ad'
  },
  {
    platform: 'linux',
    arch: 'ia32',
    pkg: 'i386-linux.tgz',
    bin: 'linux-ia32',
    sha: '828362e559e53d80b3579df032fe756a0993cf33934416fa72e9d69c8025321b'
  },
  {
    platform: 'linux',
    arch: 'x64',
    pkg: 'x86_64-linux.tgz',
    bin: 'linux-x64',
    sha: '5fe2028f0d4427e4f4231d9f9cf70e6691bb890a70636d75232fe4d970633168'
  },
  {
    platform: 'linux',
    arch: 'arm',
    pkg: 'arm-linux.tgz',
    bin: 'linux-arm',
    sha: '0fa7b3237d0fe4fa15bc1e7cb27ccac63b02a2679b71c2879d59dd75d3c9235d'
  },
  {
    platform: 'linux',
    arch: 'armhf', // Not sure how to detect this.
    pkg: 'armhf-linux.tgz',
    bin: 'linux-armhf',
    sha: '04b54991cfb9492ea8b2a3500340e7eeb78065a00ad25a032be7763f1415decb'
  },
  {
    platform: 'linux',
    arch: 'arm64',
    pkg: 'aarch64-linux.tgz',
    bin: 'linux-arm64',
    sha: '073684dc3490508ca01b04c5855e04cfd797fed33f6ea6a6edc26dfbc6f6aa9e'
  },
  {
    platform: 'freebsd',
    arch: 'x64',
    pkg: 'freebsd.pkg',
    bin: 'freebsd-x64',
    sha: 'f95647ed1ff251b5a39eda80ea447c9b2367f7cfb4155454c23a2f02b94dd844'
  }
];

const progressPhases = {
  ping: 2,
  download: 15,
  upload: 6
};
const totalTime = Object.keys(progressPhases).reduce((total, key) => total + progressPhases[key], 0);
Object.keys(progressPhases).forEach(key => progressPhases[key] /= totalTime);

const setCancelHandler = Symbol();

function appendFileName(fileName, trailer) {
  const ext = path.extname(fileName);
  const name = fileName.slice(0, -ext.length);
  return `${name}${trailer}${ext}`;
}

async function ensureBinary({ platform = process.platform, arch = process.arch, binaryVersion = defaultBinaryVersion } = {}) {
  const binaryLocation = 'https://install.speedtest.net/app/cli/ookla-speedtest-$v-$p';
  const found = platforms.find(p => p.platform === platform && p.arch === arch);
  if (!found) throw new Error(`${platform} on ${arch} not supported`);
  const binDir = path.join(__dirname, 'binaries');
  await mkdirp(binDir);
  const binFileName = appendFileName(found.bin, `-${binaryVersion}`);
  const binPath = path.join(binDir, binFileName);
  if (!(await fileExists(binPath))) {
    const pkgDir = path.join(__dirname, 'pkg');
    await mkdirp(pkgDir);
    const pkgFileName = appendFileName(found.pkg, `-${binaryVersion}`);
    const pkgPath = path.join(pkgDir, pkgFileName);
    if (!(await fileExists(pkgPath))) {
      const url = binaryLocation.replace('$v', binaryVersion).replace('$p', found.pkg);
      try {
        await download(url, pkgDir, { filename: pkgFileName });
      } catch (err) {
        throw new Error(`Error downloading speedtest CLI executable from ${url}: ${err.message}`);
      }
    }
    const fileSha = await sha256File(pkgPath);
    if (binaryVersion === defaultBinaryVersion && fileSha !== found.sha) {
      throw new Error(`SHA mismatch ${pkgFileName}, found "${fileSha}", expected "${found.sha}"`);
    }
    // noinspection JSUnusedGlobalSymbols
    await decompress(pkgPath, binDir, {
      plugins: [
        decompressTar(),
        decompressTarbz2(),
        decompressTargz(),
        decompressUnzip(),
        decompressTarXz()
      ],
      filter: file => {
        return /(^|\/)speedtest(.exe)?$/.test(file.path);
      },
      map: file => {
        file.path = binFileName;
        return file;
      }
    });
    if (!(await fileExists(binPath))) {
      throw new Error(`Error decompressing package "${pkgPath}"`);
    }
    await chMod(binPath, 0o755);
  }
  return binPath;
}

function lineify(stream, onLine) {
  let rest = '';
  stream.setEncoding('utf8');
  stream.on('data', data => {
    rest += data;
    let match;
    // eslint-disable-next-line no-cond-assign
    while (match = /(^.*?)(\r)?\n/.exec(rest)) {
      onLine(match[1]);
      rest = rest.slice(match[0].length);
    }
  });
  stream.on('end', () => {
    if (rest) onLine(rest);
  });
}

function pendingPromise() {
  let resolve = undefined;
  let reject = undefined;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function exec(options = {}) {
  const {
    acceptLicense = false,
    acceptGdpr = false,
    progress = () => {},
    serverId,
    sourceIp,
    host,
    cancel = () => false,
    binaryVersion,
    verbosity = 0
  } = options;
  const binary = options.binary || await ensureBinary({ binaryVersion });
  const args = ['-f', 'json', '-P', '8'];
  for (let i = 0; i < verbosity; i++) {
    args.push('-v');
  }
  if (options.progress) args.push('-p');
  if (acceptLicense) {
    args.push('--accept-license');
  }
  if (acceptGdpr) {
    args.push('--accept-gdpr');
  }
  if (serverId) {
    args.push('-s', serverId);
  }
  if (sourceIp) {
    args.push('-i', sourceIp);
  }
  if (host) {
    args.push('-o', host);
  }
  const cliProcess = childProcess.spawn(binary, args, {
    windowsHide: true
  });
  const { promise, resolve, reject: rejectPromise } = pendingPromise();
  let aborted = false;
  const reject = err => {
    aborted = true;
    rejectPromise(err);
  };
  if (cancel(setCancelHandler, () => {
    aborted = true;
    process.nextTick(() => reject(new Error('Test aborted')));
  })) {
    throw new Error('Test aborted');
  }
  const errorLines = [];
  let priorProgress = 0;
  let lastProgress = 0;
  let currentPhase;
  let result = undefined;
  lineify(cliProcess.stderr, handleLine.bind(null, true));
  lineify(cliProcess.stdout, handleLine.bind(null, false));
  cliProcess.on('exit', resolve);
  cliProcess.on('error', origError => {
    reject(new Error(errorLines.concat(origError.message).join('\n')));
  });
  try {
    await promise;
  } finally {
    const pid = cliProcess.pid;
    cliProcess.kill();
    kill(pid);
  }
  if (errorLines.length) {
    const licenseAcceptedMessage = /License acceptance recorded. Continuing./;
    const acceptLicenseMessage = /To accept the message please run speedtest interactively or use the following:[\s\S]*speedtest --accept-license/;
    const acceptGdprMessage = /To accept the message please run speedtest interactively or use the following:[\s\S]*speedtest --accept-gdpr/;

    let error = errorLines.join('\n');

    if (licenseAcceptedMessage.test(error)) {
      error = '';
    } else if (acceptLicenseMessage.test(error)) {
      error = error.replace(acceptLicenseMessage, 'To accept the message, pass the acceptLicense: true option');
    } else if (acceptGdprMessage.test(error)) {
      error = error.replace(acceptGdprMessage, 'To accept the message, pass the acceptGdpr: true option');
    } else {
      error = error.replace(/===*[\s\S]*about\/privacy\n?/, '');
    }
    error = error.trim();
    if (error) throw new Error(error);
  }
  aborted = true;
  return result;

  function handleLine(isError, line) {
    if (aborted) return;
    if (/^{/.test(line)) {
      let data;
      try {
        data = JSON.parse(line);
      } catch (err) {
        // Ignore
      }
      if (data) {
        if (data.timestamp) {
          data.timestamp = new Date(data.timestamp);
        }
        if (data.type) {
          const content = data[data.type];
          if (content) {
            if (currentPhase !== data.type && progressPhases[data.type]) {
              priorProgress += progressPhases[currentPhase] || 0;
              currentPhase = data.type;
            }
            if (typeof content.progress === 'number' && progressPhases[data.type]) {
              data.progress = priorProgress + progressPhases[data.type] * content.progress;
            }
          }
        } else {
          if (data.suite || data.app || data.servers) {
            data.type = 'config';
          }
        }
        if (data.progress === undefined) {
          data.progress = priorProgress;
        }
        lastProgress = data.progress = Math.max(data.progress, lastProgress);
        if (data.error) {
          return reject(new Error(data.error));
        }
        if (data.type === 'log' && data.level === 'error') {
          return reject(new Error(data.message));
        }
        if (data.type === 'result') {
          delete data.progress;
          delete data.type;
          result = data;
          return;
        }
        if (progress) {
          progress(data);
        }
        return;
      }
    }
    if (!line.trim()) return;
    if (isError) {
      if (!/] \[(info|warning)]/.test(line)) {
        errorLines.push(line);
      }
    }
  }
}

function makeCancel() {
  let doCancel = null;
  let isCanceled = false;
  return (setHandler, newHandler) => {
    if (setHandler === setCancelHandler) {
      doCancel = newHandler;
      return isCanceled;
    }
    if (isCanceled) return;
    isCanceled = true;
    if (doCancel) {
      doCancel();
    }
  };
}

module.exports = exec;
exec.defaultBinaryVersion = defaultBinaryVersion;
exec.makeCancel = makeCancel;
