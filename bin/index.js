#!/usr/bin/env node
var DraftLog = require('draftlog').into(console).addLineListener(process.stdin);
var chalk = require('chalk');
var SpeedTestNet = require('../');

/*
 * Keep track of current UI State
 */
var header, speeds, location
var step = 'Ping';
var statuses = {
  Ping: true,
  Download: false,
  Upload: false,
}

/*
 * Renders the header and Speeds (one below the other)
 */
var halfwidth = 12;
function updateLines() {
  var headerTxt = '';
  var speedsTxt = '';
  var spinner = Spinner();

  // Build Header
  for (var k in statuses) {
    var status = statuses[k];

    // Create header
    var spacing = ' '.repeat(halfwidth - k.length / 2);
    var col = spacing + k + spacing;

    // Set header status color
    if (status === false) {
      col = chalk.dim(col);
    } else {
      col = chalk.white(col);
    }

    headerTxt += col;
  }

  // Build Status
  for (var k in statuses) {
    var status = statuses[k];
    status = status === false ? '' : status;
    status = status === true  ? '' : status;
    status = status + '';

    // Pad to be even
    status = (status.length % 2 == 0 ? '' : ' ') + status;

    // Put spinner if no info
    if (!status) {
      status = spinner + ' ';
    }

    // Create status text
    var spacing = ' '.repeat(halfwidth - status.length / 2);

    // If it's the current step, show as yellow
    if (step == k) {
      var txt = spacing + chalk.yellow(status) + spacing;
    } else {
      var txt = spacing + chalk.blue(status) + spacing;
    }

    speedsTxt += txt;
  }

  header('│' + headerTxt + '│');
  speeds('│' + speedsTxt + '│');
}

/*
 * Function that return state of Spinner, and change its state with time
 */
var frames = ['⠁', '⠂', '⠄', '⡀', '⢀', '⠠', '⠐', '⠈' ];
var lastChange = 0;
function Spinner(){
  if (Date.now() > lastChange + 0) {
    frames.unshift(frames.pop());
    lastChange = Date.now();
  }
  return frames[0];
}

/*
 * Shows CLI UI
 */
console.log();
console.log('┌' + '─'.repeat(halfwidth * 6) + '┐');
console.log('│' + ' '.repeat(halfwidth * 6) + '│');
location = console.draft('│' + ' '.repeat(halfwidth * 6) + '│');
console.log('│' + ' '.repeat(halfwidth * 6) + '│');

header = console.draft();
speeds = console.draft();

updateLines();

console.log('│' + ' '.repeat(halfwidth * 6) + '│');
console.log('│' + ' '.repeat(halfwidth * 6) + '│');
console.log('└' + '─'.repeat(halfwidth * 6) + '┘');
console.log();
console.log();

/*
 * Start speed test
 */
var test = SpeedTestNet({maxTime: 10000});
var interval = setInterval(updateLines, 60);
var completedUpload = false;
var completedDownload = false;

test.on('downloadspeedprogress', function (speed){
  if (!completedDownload) {
    statuses.Download = speedText(speed, true);
  }
})

test.on('uploadspeedprogress', function (speed){
  if (!completedUpload) {
    statuses.Upload = speedText(speed, true);
  }
})

test.once('testserver', function (info){
  // Round to 1 decimal place
  var title = info.sponsor + ', ' + info.country + ' - ' + info.name;
  title = title + (title.length % 2 == 0 ? '' : ' ');

  var fill = ' '.repeat(halfwidth * 3 - title.length / 2);
  location('│' + fill + chalk.yellow(title) + fill + '│');
  
  var ping = Math.round(info.bestPing * 10) / 10;
  statuses.Ping = ping + ' ms';
  step = 'Download';
})

test.once('downloadspeed', function (speed){
  completedDownload = true;
  step = 'Upload';
  statuses.Download = speedText(speed);
})

test.once('uploadspeed', function (speed){
  completedUpload = true;
  step = 'Finished';
  statuses.Upload = speedText(speed);
})

function speedText(speed, notFinished) {
  var str = speed.toFixed(1);
  return str + ' Mbps';
}

test.on('done', function () {
  process.exit();
})

test.on('error', err => {
  console.log();
  console.error(chalk.red(err));
  console.log();
  process.exit();
});
