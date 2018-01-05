#!/usr/bin/env node
require('draftlog').into(console).addLineListener(process.stdin);
var chalk = require('chalk');
var SpeedTestNet = require('../');

/*
 * Keep track of current UI State
 */
var header, speeds, locate;
var step = 'Ping';
var statuses = {
  Ping: true,
  Download: false,
  Upload: false,
};

/*
 * Renders the header and Speeds (one below the other)
 */
var width = 24;
function updateLines() {
  var spinner = Spinner();
  var headerTxt = renderHeader(statuses, step);
  var speedsTxt = renderStatus(statuses, step, spinner);

  header('│' + headerTxt + '│');
  speeds('│' + speedsTxt + '│');
}

/*
 * Renders the Header (Showing PING DOWNLOAD UPLOAD) with it's colors and spacings
 */
function renderHeader(statuses) {
  var txt = '';

  // Build Header
  for (var k in statuses) {
    var status = statuses[k];

    // Create header
    var col = centerText(k, width);

    // Set header status color
    if (status === false) {
      col = chalk.dim(col);
    } else {
      col = chalk.white(col);
    }

    txt += col;
  }

  return txt;
}

/*
 * Renders the Status line (Showing Ping/Download/Upload results) with it's colors and spacings
 */
function renderStatus(statuses, step, spinner){
  var txt = '';

   // Build Status
  for (var k in statuses) {
    var status = statuses[k];
    
    // Account for status where it's false/true
    // (indicating not started and not received value yet)
    status = status === false ? '' : status;
    status = status === true  ? '' : status;
    status = status + '';

    // Put spinner if no info
    if (!status) {
      status = spinner + ' ';
    }

    // Create status text
    status = centerText(status, width);

    // Dim unitis
    status = status.replace(/(Mbps|ms)/gi, chalk.dim('$1'));

    // If it's the current step, show as yellow
    if (step == k) {
      status = chalk.yellow(status);
    } else {
      status = chalk.blue(status);
    }

    txt += status;
  }

  return txt;
}

/*
 * Pad Left/Right with same amount of spaces n times. compensate for odd numbers
 */
function centerText(text, n, length) {
  // Account for text length first
  n -= length || text.length;

  // Pad to be even
  if (n % 2 == 1) {
    text = ' ' + text;
  }

  // Round n to lowest number
  n = Math.floor(n / 2);

  // Make spacer
  var spacer = ' '.repeat(n);

  // Fill in text
  return spacer + text + spacer;
}

/*
 * Converts a number to speed (in Mbps)
 */
function speedText(speed) {
  // Depending on the speed, show more places
  var places = ( speed < 2 ? 3 : 1);

  // Make it fixed
  var str = speed.toFixed(places);
  
  // Concat with unit
  return str + ' Mbps';
}

/*
 * Function that return state of Spinner, and change its state with time
 */
var frames = [
  '+---',
  '-+--',
  '--+-',
  '---+',
  '--+-',
  '-+--',
];
var lastChange = 0;
function Spinner(){
  if (Date.now() > lastChange + 30) {
    frames.unshift(frames.pop());
    lastChange = Date.now();
  }
  return frames[0];
}

/*
 * Shows CLI UI
 */
console.log();
console.log('┌' + '─'.repeat(width * 3) + '┐');
console.log('│' + ' '.repeat(width * 3) + '│');
locate = console.draft('│' + ' '.repeat(width * 3) + '│');
console.log('│' + ' '.repeat(width * 3) + '│');
header = console.draft();
speeds = console.draft();
console.log('│' + ' '.repeat(width * 3) + '│');
console.log('│' + ' '.repeat(width * 3) + '│');
console.log('└' + '─'.repeat(width * 3) + '┘');
console.log();
console.log();

updateLines();

/*
 * Start speed test
 */
 
var options = {
  maxTime: 10000,
  proxy : null,
}

/*
 * get parameters
 */
var errorParameter = null;
process.argv.forEach(function (val, index, array) {
  if (index >= 2) {
    if (val.startsWith("--proxy")) {
      if (array[index + 1] != undefined) {
        options.proxy = array[index + 1];
      } else {
        errorParameter = "Error: bad parameters";
      }
    }
  }
});

/*
 * interrupt if error (parameters)
 */
if (errorParameter) {
  console.log();
  console.error(chalk.red(errorParameter));
  console.log();
  process.exit(1);
}

var test = SpeedTestNet(options);
var interval = setInterval(updateLines, 100);
var completedUpload = false;
var completedDownload = false;

test.on('downloadspeedprogress', function (speed){
  if (!completedDownload) {
    statuses.Download = speedText(speed);
  }
});

test.on('uploadspeedprogress', function (speed){
  if (!completedUpload) {
    statuses.Upload = speedText(speed);
  }
});

test.once('testserver', function (info){
  // Round to 1 decimal place
  var title = info.sponsor + ', ' + info.country + ' - ' + info.name;
  title = centerText(title, width * 3);

  locate('│' + chalk.yellow(title) + '│');
  
  var ping = Math.round(info.bestPing * 10) / 10;
  statuses.Ping = ping + ' ms';
  step = 'Download';
});

test.once('downloadspeed', function (speed){
  completedDownload = true;
  step = 'Upload';
  statuses.Download = speedText(speed);
});

test.once('uploadspeed', function (speed){
  completedUpload = true;
  step = 'Finished';
  statuses.Upload = speedText(speed);
});

test.on('done', function () {
  process.exit(0);
});

test.on('error', err => {
  console.log();
  console.error(chalk.red(err));
  console.log();
  process.exit(1);
});
