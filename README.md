# speedtest.net API / CLI tool

![SpeedTest Cli](media/speedtestcli.gif)

## Installation

```bash
npm install --save speedtest-net
```

## Command-Line Tool
```bash
$ npm install --global speedtest-net
$ speedtest-net
```

## Usage

The whole speed test runs automatically, but a lot of events are available
to get more info than you need.

The test comes in two versions. The main one is for use by code, and then
there's another one for use by command line utils, as it displays a
progress bar and optional information output as well.


Code use example:
```js
var speedTest = require('speedtest-net');
var test = speedTest({maxTime: 5000});

test.on('data', data => {
  console.dir(data);
});

test.on('error', err => {
  console.error(err);
});
  
```

Visual use example:
```js
var speedTest = require('speedtest-net');

speedTest.visual({maxTime: 5000}, (err, data) => {
  console.dir(data);
});
```

## Options

You can pass an optional `options` object.

The options include:
* `proxy` The proxy for upload or download, support http and https (example : "http://proxy:3128")
* `maxTime` The maximum length of a single test run (upload or download)
* `pingCount` The number of close servers to ping to find the fastest one
* `maxServers` The number of servers to run a download test on. The fastest is used for the upload test and the fastest result is reported at the end.
* `headers` Headers to send to speedtest.net
* `log` (Visual only) Pass a truthy value to allow the run to output results to the console in addition to showing progress, or a function to be used instead of `console.log`.
* `serverId` ID of the server to restrict the tests against.
* `serversUrl` URL to obtain the list of servers available for speed test. (default: http://www.speedtest.net/speedtest-servers-static.php)

## Proxy by env

### You can set proxy with env var

Code use example for cli:
```bash
$ npm install --global speedtest-net
$ set HTTP_PROXY=http://proxy:3128
$ speedtest-net
```

Code use example for node:
```js
process.env["HTTP_PROXY"] =  process.env["http_proxy"] = "http://proxy:3128";
//process.env["HTTPS_PROXY"] = process.env["https_proxy"] = "https://proxy:3128";

var speedTest = require('speedtest-net');
var test = speedTest({maxTime: 5000});

test.on('data', data => {
  console.dir(data);
});

test.on('error', err => {
  console.error(err);
});
  
```

### You can set proxy by options

Code use example for cli:
```bash
$ npm install --global speedtest-net
$ speedtest-net --proxy "http://proxy:3128"
```

Code use example for node:
```js
var speedTest = require('speedtest-net');
var test = speedTest({maxTime: 5000, proxy : "http://proxy:3128"});

test.on('data', data => {
  console.dir(data);
});

test.on('error', err => {
  console.error(err);
});
  
```
### Proxy priority
 * `proxy by options`
 * `proxy by HTTP_PROXY env var`
 * `proxy by HTTPS_PROXY env var`


## Events

There are a number of events available during the test:

### downloadprogress

Fired when data is downloaded.
The progress in percent is passed.

Note that if more than 1 server is used for download testing, this
will run to 100% multiple times.


```js
require('speedtest-net')().on('downloadprogress', progress => {
  console.log('Download progress:', progress);
});
```

### uploadprogress

Fired when data is uploaded.
The progress in percent is passed.

```js
require('speedtest-net')().on('uploadprogress', progress => {
  console.log('Upload progress:', progress);
});
```

### error

Fired when an error occurs.
The error is passed.

```js
require('speedtest-net')().on('error', err => {
  console.log('Speed test error:');
  console.error(err);
});
```

### config

Fired when the configuration has been fetched from the speedtest server.
The config is passed.

```js
require('speedtest-net')().on('config', => {
  console.log('Configuration info:');
  console.dir(config);
});
```

### servers

Fired when the list of servers has been fetched from the speedtest server.
The list of server objects is passed.

```js
require('speedtest-net')().on('servers', servers => {
  console.log('Complete list of all available servers:');
  console.dir(servers);
});
```

### bestservers

Fired after closest servers are pinged.
An ordered list of server objects is passed, fastest first.

```js
require('speedtest-net')().on('bestservers', servers => {
  console.log('Closest servers:');
  console.dir(servers);
});
```

### testserver

Fired before download or upload is started on a server.
The server object is passed.

```js
require('speedtest-net')().on('testserver', server => {
  console.log('Test server:');
  console.dir(server);
});
```

### downloadspeed

Fired when a download speed is found.
When testing on multiple servers, it's fired multiple times.
The speed in megabits (1 million bits) per second is passed, after it is corrected to be in line with speedtest.net results.
The associated server is the server passed in the last `testserver` event.

```js
require('speedtest-net')().on('downloadspeed', speed => {
  console.log('Download speed:', (speed * 125).toFixed(2), 'KB/s');
});
```

### uploadspeed

Fired when the upload speed is found.
The speed in megabits (1 million bits) per second is passed, after it is corrected to be in line with speedtest.net results.
The associated server is the server passed in the last `testserver` event, which will be the fastest server from download test(s).

```js
require('speedtest-net')().on('uploadspeed', speed => {
  console.log('Upload speed:',(speed * 125).toFixed(2),'KB/s');
});
```

### downloadspeedprogress
Fired before final download has completed to show download speed in progress, and is fired multiple times. The speed in megabits (1 million bits) per second is passed, after it is corrected to be in line with speedtest.net results. The associated server is the server passed in the most recent testserver event.

```js
require('speedtest-net')().on('downloadspeedprogress', speed => {
  console.log('Download speed (in progress):', (speed * 125).toFixed(2), 'KB/s');
});
```

### uploadspeedprogress
Fired before final download has completed to show upload speed in progress, and is fired multiple times. The speed in megabits (1 million bits) per second is passed, after it is corrected to be in line with speedtest.net results. The associated server is the server passed in the most recent testserver event.

```js
require('speedtest-net')().on('uploadspeedprogress', speed => {
  console.log('Upload speed (in progress):', (speed * 125).toFixed(2), 'KB/s');
});
```

### result

Fired when the data has been uploaded to SpeedTest.net server.
The url of the result is passed, or `undefined` on error.

```js
require('speedtest-net')().on('result', url => {
  if (!url) {
    console.log('Could not successfully post test results.');
  } else {
    console.log('Test result url:', url);
  }
});
```


### data

Fired when tests are done with all relevant information.
The data is passed.

```js
require('speedtest-net')().on('data', data => {
  console.dir(data);
});
```

The returned data is a nested object with the following properties:

* __`speeds`__:
 * `download`: download bandwidth in megabits per second
 * `upload`: upload bandwidth in megabits per second
 * `originalDownload`: unadjusted download bandwidth in bytes per second
 * `originalUpload`: unadjusted upload bandwidth in bytes per second
  
  
*  __`client`__:
 * `ip`: ip of client
 * `lat`: latitude of client
 * `lon`: longitude of client
 * `isp`: client's isp
 * `isprating`: some kind of rating
 * `rating`: another rating, which is always 0 it seems
 * `ispdlavg`: avg download speed by all users of this isp in Mbps
 * `ispulavg`: same for upload
  
  
* __`server`__:
 * `host`: test server url
 * `lat`: latitude of server
 * `lon`: longitude of something
 * `location`: name of a location, usually a city, but can be anything
 * `country`: name of the country
 * `cc`: country code
 * `sponsor`: who pays for the test server
 * `distance`: distance from client to server (SI)
 * `distanceMi`: distance from client to server (Imperial)
 * `ping`: how long it took to download a small file from the server, in ms
 * `id`: the id of the server

### done

Fired when the test are done.
An object with too much data is passed.
Note that it is not fired when an error occurs.

```js
require('speedtest-net')().on('done', dataOverload => {
  console.log('TL;DR:');
  console.dir(dataOverload);
  console.log('The speed test has completed successfully.');
});
```

## Considerations

The test results are fudged to be in-line with what speedtest.net (owned by Ookla) produces. Please see the
[Ookla test flow](http://www.ookla.com/support/a21110547/what+is+the+test+flow+and) description to find out why it is
necessary to do this. It is certainly possible to copy Ookla's test method in node.js, but it's a significant job.

The current method is likely to produce very similar results as speedtest.net, as long as the internet connection with
the server has a relatively low [packet jitter](http://en.wikipedia.org/wiki/Jitter#Packet_jitter_in_computer_networks).

## License

[MIT](http://choosealicense.com/licenses/mit/)
