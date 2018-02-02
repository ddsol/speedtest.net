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

var parseXML     = require('xml2js').parseString
  , url          = require('url')
  , EventEmitter = require('events').EventEmitter
  , HttpProxyAgent = require('http-proxy-agent')
  , HttpsProxyAgent = require('https-proxy-agent')
  // These numbers were obtained by measuring and averaging both using this module and the official speedtest.net
  , speedTestDownloadCorrectionFactor = 1.135
  , speedTestUploadCorrectionFactor   = 1.139
  , proxyOptions = null
  , proxyHttpEnv = findPropertiesInEnvInsensitive('HTTP_PROXY')
  , proxyHttpsEnv = findPropertiesInEnvInsensitive('HTTPS_PROXY')
  ;

function findPropertiesInEnvInsensitive(prop) {
  prop = prop.toLowerCase();
  for (var p in process.env) {
    if (process.env.hasOwnProperty(p) && prop === p.toLowerCase()) {
      return process.env[p];
    }
  }
  return null;
}

//set the proxy agent for each http request
// priority :
// 1 - proxyOptions
// 2 - proxyHttpEnv (HTTP_PROXY)
// 3 - proxyHttpsEnv (HTTPS_PROXY)
function proxy(options) {
  var proxy = null
    , isSSL = false
    , haveHttp = false
    ;

  if (!proxyHttpEnv && !proxyHttpsEnv && !proxyOptions) {
    return;
  }
  // Test the proxy parameter first for priority
  if (proxyOptions) {
    if (proxyOptions.substr(0, 6) === 'https:') {
      isSSL = true;
    }
    proxy = proxyOptions;
  } else {
    // Test proxy by env
    proxy = proxyHttpEnv;
    if (proxyHttpEnv) {
      //for support https in HTTP_PROXY env var
      if (proxyHttpEnv.substr(0, 6) === 'https:') {
        isSSL = true;
      } else {
        haveHttp = true;
      }
    } else if (proxyHttpsEnv) {
      isSSL = true;
      proxy = proxyHttpsEnv;
    }
    // for http priority
    if (proxyHttpEnv && proxyHttpEnv.substr(0, 6) !== 'https:') {
      haveHttp = true;
    }
  }

  if (!isSSL || haveHttp) {
    options.agent = new HttpProxyAgent(proxy);
  } else {
    options.agent = new HttpsProxyAgent(proxy);
  }
}

function once(callback) {
  if (typeof callback !== 'function') {
    callback = function() {};
  }
  return function() {
    if (callback) {
      callback.apply(this, arguments);
      callback = null;
    }
  };
}

function distance(origin, destination) {
  var lat1   = origin.lat
    , lon1   = origin.lon
    , lat2   = destination.lat
    , lon2   = destination.lon
    , radius = 6371 //km
    , dlat   = deg2rad(lat2 - lat1)
    , dlon   = deg2rad(lon2 - lon1)
    , a
    , c
    ;

  a = (Math.sin(dlat / 2) * Math.sin(dlat / 2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dlon / 2) * Math.sin(dlon / 2));
  c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return radius * c;

  function deg2rad(d) {
    return d / 180 * Math.PI;
  }
}


function getHttp(theUrl, discard, callback) {
  var http
    , options
    ;

  if (!callback) {
    callback = discard;
    discard = false;
  }

  callback = once(callback);

  options = theUrl;

  if (typeof options === 'string') options = url.parse(options);

  http = options.protocol === 'https:' ? require('https') : require('http');
  proxy(options);
  delete options.protocol;

  options.headers = options.headers || {};
  options.headers['user-agent'] = options.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 6.3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.' + Math.trunc(Math.random() * 400 + 2704) + '.' + Math.trunc(Math.random() * 400 + 103) + ' Safari/537.36';

  http.get(options, function(res) {
    if (res.statusCode === 302) {
      return getHttp(res.headers.location, discard, callback);
    }
    var data = ''
      , count = 0
      ;

    if (!discard) res.setEncoding('utf8');
    res.on('error', callback);
    res.on('data', function(newData) {
      count += newData.length;
      if (!discard) data += newData;
    });
    res.on('end', function() {
      if (discard) data = count;
      callback(null, data, res.statusCode);
    });
  }).on('error', callback);
}

function postHttp(theUrl, data, callback) {
  if (!callback) {
    callback = data;
    data = '';
  }

  callback = once(callback);

  var options = theUrl
    , http
    , req
    ;

  if (typeof options === 'string') options = url.parse(options);

  options.headers = options.headers || {};
  options.headers['user-agent'] = options.headers['user-agent'] || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.8; rv:24.0) Gecko/20100101 Firefox/24.0';
  options.headers['content-type'] = 'application/x-www-form-urlencoded';
  options.headers['content-length'] = data.length;
  options.method = 'POST';

  http = require(options.protocol === 'https:' ? 'https' : 'http');
  proxy(options);
  delete options.protocol;

  req = http.request(options, function(res) {
    var data = '';
    res.setEncoding('utf8');
    res.on('error', callback);
    res.on('data', function(newData) {
      data += newData;
    });
    res.on('end', function() {
      callback(null, data, res.statusCode);
    });
  });

  req.on('error', callback);

  req.end(data);
}

function randomPutHttp(theUrl, size, callback) {
  callback = once(callback);

  size = (size || 131072) | 0; //eslint-disable-line no-bitwise

  var options = theUrl
    , headers = {
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.8; rv:24.0) Gecko/20100101 Firefox/24.0',
      'content-length': size
    }
    , toSend  = size
    , sent1   = false
    , dataBlock
    , http
    , headerName
    , request
    ;

  if (typeof options === 'string') options = url.parse(theUrl);


  options.headers = options.headers || {};

  for (headerName in headers) {
    options.headers[headerName] = options.headers[headerName] || headers[headerName];
  }

  options.method = 'POST';

  dataBlock = (function() {
    var d = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    while (d.length < 1024 * 16) d += d;
    return d.substr(0, 1024 * 16);
  })();

  http = options.protocol === 'https:' ? require('https') : require('http');
  proxy(options);
  delete options.protocol;

  request = http.request(options, function(response) {
    response.on('error', callback);
    response.on('data', function(newData) {
      //discard
    });
    response.on('end', function() {
      // Some cases (like HTTP 413) will interrupt the upload, but still return a response
      callback(null, size - toSend);
    });
  });

  request.on('error', callback);

  function write() {
    do {
      if (!toSend) {
        return; //we're done sending...
      }
      var data = dataBlock;
      if (!sent1) {
        sent1 = true;
        data = 'content1=' + data;
      }
      data = data.substr(0, toSend);
      toSend -= data.length;
    } while (request.write(data));
  }

  request.on('drain', write);

  write();
}

function getXML(xmlurl, callback) {
  callback = once(callback);

  getHttp(xmlurl, function(err, data) {
    if (err) return callback(err);
    parseXML(data, function(err, xml) {
      if (err) return callback(err);
      callback(null, xml);
    });
  });
}

function pingServer(server, callback) {
  callback = once(callback);

  var total = 3
    , done = 0
    , bestTime = 3600
    ;

  function nextPing() {
    var start = process.hrtime()
      , complete
      ;

    setTimeout(function() {
      if (!complete) {
        complete = true;
        return callback(new Error('Ping timeout'));
      }
    }, 5000);

    getHttp(url.resolve(server.url, 'latency.txt'), function(err, data) {
      if (complete) return; // already hit timeout
      complete = true;
      var diff = process.hrtime(start);
      diff = diff[0] + diff[1] * 1e-9; //seconds
      if (!err && data.substr(0, 9) !== 'test=test') err = new Error('Unknown latency file');
      if (err) diff = 3600; //an hour...
      if (diff < bestTime) bestTime = diff;
      done++;
      if (done === total) {
        if (bestTime >= 3600) return callback(new Error('Ping failed'));
        return callback(null, bestTime * 1000); //ms
      } else {
        nextPing();
      }
    });
  }

  nextPing();
}

function pingServers(servers, count, callback) {
  var result = []
    , todo = Math.min(count, servers.length)
    , done = 0
    , serverIndex
    ;

  for (serverIndex = 0; serverIndex < todo; serverIndex++) {
    (function(server) {
      result.push(server);
      server.bestPing = 3600;
      pingServer(server, function(err, bestTime) {
        if (bestTime < 10 && server.dist < 2) { //too close! Same datacenter? upload speeds of several GB/s ?? Bad measurment...
          bestTime = 100;
        }
        if (err) {
          server.bestPing = 3600;
        } else {
          server.bestPing = bestTime;
        }
        done++;
        if (done === todo) {
          result.sort(function(a, b) {
            return a.bestPing - b.bestPing;
          });
          callback(null, result);
        }
      });
    })(servers[serverIndex]);
  }
  if (todo === 0) {
    setImmediate(callback, null, []);
  }
}

function downloadSpeed(urls, maxTime, callback) {
  var concurrent = 2
    , running = 0
    , started = 0
    , done = 0
    , todo = urls.length
    , totalBytes = 0
    , emit
    , timeStart
    ;

  callback = once(callback);

  maxTime = (maxTime || 10000) / 1000;

  if (this.emit) {
    emit = this.emit.bind(this);
  } else {
    emit = function() {};
  }

  next();

  timeStart = process.hrtime();

  function next() {
    if (started >= todo) return; //all are started
    if (running >= concurrent) return;
    running++;

    var starting = started
      , url      = urls[starting]
      ;

    started++;

    getHttp(url, true, function(err, count) { //discard all data and return byte count
      if (err) return callback(err);
      var diff = process.hrtime(timeStart)
        , timePct
        , amtPct
        , speed
        , fixed
        ;

      diff = diff[0] + diff[1] * 1e-9; //seconds

      running--;
      totalBytes += count;
      done++;
      speed = totalBytes / diff;
      fixed = speed * speedTestDownloadCorrectionFactor / 125000;

      timePct = diff / maxTime * 100;
      // amtPct=done/todo*100;
      amtPct = 0; //time-only

      if (diff > maxTime) {
        done = todo;
      }
      if (done <= todo) {
        emit('downloadprogress', Math.round(Math.min(Math.max(timePct, amtPct), 100.0) * 10) / 10);
        emit('downloadspeedprogress', fixed);
      }
      if (done >= todo) {
        callback(null, speed); //bytes/sec
      } else {
        next();
      }
    });

    next(); //Try another
  }
}

function uploadSpeed(url, sizes, maxTime, callback) {
  var concurrent = 2
    , running = 0
    , started = 0
    , done = 0
    , todo = sizes.length
    , totalBytes = 0
    , emit
    , timeStart
    ;

  callback = once(callback);
  maxTime = (maxTime || 10000) / 1000;

  if (this.emit) {
    emit = this.emit.bind(this);
  } else {
    emit = function() {};
  }

  next();

  timeStart = process.hrtime();

  function next() {
    if (started >= todo) return; //all are started
    if (running >= concurrent) return;
    running++;
    var starting = started
      , size     = sizes[starting]
      ;

    started++;
    //started=(started+1) % todo; //Keep staing more until the time is up...

    randomPutHttp(url, size, function(err, count) { //discard all data and return byte count
      if (done >= todo) return;
      if (err) {
        count = 0;
      }
      var diff = process.hrtime(timeStart)
        , timePct
        , amtPct
        , speed
        , fixed
        ;

      diff = diff[0] + diff[1] * 1e-9; //seconds

      running--;
      totalBytes += count;
      done++;
      speed = totalBytes / diff;
      fixed = speed * speedTestUploadCorrectionFactor / 125000;

      timePct = diff / maxTime * 100;
      amtPct = done / todo * 100;
      //amtPct=0; //time-only

      if (diff > maxTime) {
        done = todo;
      }
      if (done <= todo) {
        emit('uploadprogress', Math.round(Math.min(Math.max(timePct, amtPct), 100.0) * 10) / 10);
        emit('uploadspeedprogress', fixed);
      }
      if (done >= todo) {
        callback(null, speed); //bytes/sec
      } else {
        next();
      }
    });

    next(); //Try another
  }
}

function speedTest(options) {
  options = options || {};

  options.pingCount = options.pingCount || (options.serverId ? 1 : 5);

  var self = new EventEmitter()
    , speedInfo = {}
    , serversUrls = [
      'http://www.speedtest.net/speedtest-servers-static.php',
      'http://www.speedtest.net/speedtest-servers-static.php?really=yes',
      'https://www.speedtest.net/speedtest-servers-static.php',
      'https://www.speedtest.net/speedtest-servers-static.php?really=totally',
      'http://www.speedtest.net/speedtest-servers.php',
      'http://www.speedtest.net/speedtest-servers.php?really=sure',
      'https://www.speedtest.net/speedtest-servers.php',
      'https://www.speedtest.net/speedtest-servers.php?really=absolutely'
    ]
    , curServer = 0
    , serversUrl
    ;

  options = options || {};

  options.maxTime = options.maxTime || 10000;
  options.pingCount = options.pingCount || (options.serverId ? 1 : 5);
  options.maxServers = options.maxServers || 1;
  options.proxy = options.proxy || null;
  proxyOptions = options.proxy;

  function httpOpts(theUrl) {
    var o = url.parse(theUrl);
    o.headers = options.headers || {};
    return o;
  }

  //Fetch config

  getXML(httpOpts('http://www.speedtest.net/speedtest-config.php'), gotConfig);

  function gotConfig(err, config) {
    if (err) return self.emit('error', err);
    config = config && config.settings || {};

    function get(name) {
      return ((config[name] || [])[0] || {}).$ || {};
    }

    var client   = get('client')
      , times    = get('times')
      , download = get('download')
      , upload   = get('upload')
      ;

    speedInfo.config = {
      client: client,
      times: times,
      download: download,
      upload: upload
    };

    self.emit('config', speedInfo.config);
    gotData();
  }

  if (options.serversUrl) {
    serversUrl = options.serversUrl;
    curServer = -1;
  }

  function nextServer(err) {
    if (curServer >= serversUrls.length) {
      return self.emit('error', err || new Error('There was a problem getting the list of servers from SpeedTest.net. Consider using a custom serversUrl'));
    }
    if (curServer < 0) {
      curServer = serversUrls.length;
    } else {
      serversUrl = serversUrls[curServer];
      curServer++;
    }
    getXML(httpOpts(serversUrl), gotServers);
  }

  nextServer();

  function gotServers(err, servers) {
    if (err) return nextServer(err);
    if (!servers || !servers.settings) {
      return nextServer(new Error('No server found, verify your proxy/network'));
    }
    var server = servers.settings.servers[0].server
      , serverIndex
      ;

    servers = [];
    for (serverIndex = 0; serverIndex < server.length; serverIndex++) {
      if (options.serverId && server[serverIndex].$.id === options.serverId) {
        servers = [server[serverIndex].$];
        break;
      }
      servers.push(server[serverIndex].$);
    }

    speedInfo.servers = servers;

    self.emit('servers', servers);
    gotData();
  }

  function gotData() {
    if (!speedInfo.config || !speedInfo.servers) return; //not ready yet

    //order servers by how close they are:
    var servers = speedInfo.servers
      , serverIndex
      , server
      , dist
      ;

    for (serverIndex = 0; serverIndex < servers.length; serverIndex++) {
      server = servers[serverIndex];
      dist = distance(speedInfo.config.client, server);

      server.dist = dist;
      server.distMi = dist * 0.621371;
    }

    servers.sort(function(a, b) {
      return (a.dist - b.dist);
    });

    pingServers(servers, options.pingCount, function(err, bestServers) {
      if (err) return self.emit('error', err);
      if (!bestServers || !bestServers.length) return self.emit('error', new Error('Could not find a server to test on.'));

      speedInfo.bestServers = bestServers;
      speedInfo.bestServer = speedInfo.bestServers[0];
      self.emit('bestservers', bestServers);

      startDownload();
    });
  }

  function startDownload(ix) {
    ix = ix || 0;
    if (ix >= speedInfo.bestServers.length || ix >= options.maxServers) return startUpload();
    var server = speedInfo.bestServers[ix]
      , svrurl = server.url
      , sizes  = [350, 500, 750, 1000, 1500, 2000, 2500, 3000, 3500, 4000]
      , urls   = []
      , n
      , i
      , size
      ;

    for (n = 0; n < sizes.length; n++) {
      size = sizes[n];
      for (i = 0; i < 4; i++) {
        urls.push(url.resolve(svrurl, 'random' + size + 'x' + size + '.jpg'));
      }
    }

    self.emit('testserver', server);

    downloadSpeed.call(self, urls, options.maxTime, function(err, speed) {
      if (err) return self.emit('error', err);
      var fixed = speed * speedTestDownloadCorrectionFactor / 125000;
      self.emit('downloadprogress', 100);
      self.emit('downloadspeed', fixed);

      if (speedInfo.downloadSpeed) {
        if (speed > speedInfo.downloadSpeed) {
          speedInfo.downloadSpeed = speed;
          speedInfo.speedTestDownloadSpeed = fixed;
          speedInfo.bestServer = server;
        }
      } else {
        speedInfo.downloadSpeed = speed;
        speedInfo.speedTestDownloadSpeed = fixed;
      }

      startDownload(ix + 1);
    });
  }

  function startUpload() {
    var sizes     = []
      , sizesizes = [
        Math.round(0.25 * 1000 * 1000),
        Math.round(0.5 * 1000 * 1000),
        Math.round(1 * 1000 * 1000),
        Math.round(2 * 1000 * 1000),
        Math.round(4 * 1000 * 1000),
        Math.round(8 * 1000 * 1000),
        Math.round(16 * 1000 * 1000),
        Math.round(32 * 1000 * 1000)
      ]
      , sizesize
      , n
      , i
      ;

    for (n = 0; n < sizesizes.length; n++) {
      sizesize = sizesizes[n];
      for (i = 0; i < 25; i++) {
        sizes.push(sizesize);
      }
    }
    self.emit('testserver', speedInfo.bestServer);
    uploadSpeed.call(self, speedInfo.bestServer.url, sizes, options.maxTime, function(err, speed) {
      if (err) return self.emit('error', err);
      speedInfo.uploadSpeed = speed;
      speedInfo.speedTestUploadSpeed = speed * speedTestUploadCorrectionFactor / 125000;
      self.emit('uploadprogress', 100);
      self.emit('uploadspeed', speedInfo.speedTestUploadSpeed);

      //emit results as nice, clean, object

      /*
      { url: 'http://208.54.87.70/speedtest/upload.jsp',
        lat: '40.9419',
        lon: '-74.2506',
        name: 'Wayne, NJ',
        country: 'United States',
        cc: 'US',
        sponsor: 'T-Mobile',
        id: '1861',
        host: '208.54.87.70:8080',
        dist: 114.3911751633326,
        bestPing: 37.36689500000001 }
      */

      function num(name) {
        speedInfo.config.client[name] = parseFloat(speedInfo.config.client[name]);
      }

      num('lat');
      num('lon');
      num('isprating');
      num('rating');
      num('ispdlavg');
      num('ispulavg');

      delete speedInfo.config.client.loggedin; //We're never logged in, so this is useless.

      //Convert to megabits/s
      speedInfo.config.client.ispdlavg /= 1000;
      speedInfo.config.client.ispulavg /= 1000;

      var best = speedInfo.bestServer
        , data = {
          speeds: {
            //Rounding, because these numbers look way more accurate than they are...
            download: Math.round(speedInfo.speedTestDownloadSpeed * 1000) / 1000,
            upload: Math.round(speedInfo.speedTestUploadSpeed * 1000) / 1000,
            originalDownload: Math.round(speedInfo.downloadSpeed),
            originalUpload: Math.round(speedInfo.uploadSpeed)
          },
          client: speedInfo.config.client,
          server: {
            host: url.parse(best.url).host,
            lat: Number(best.lat),
            lon: Number(best.lon),
            location: best.name,
            country: best.country,
            cc: best.cc,
            sponsor: best.sponsor,
            distance: Math.round(best.dist * 100) / 100,
            distanceMi: Math.round(best.distMi * 100) / 100,
            ping: Math.round(best.bestPing * 10) / 10,
            id: best.id
          }
        }
        ;

      self.emit('data', data);
      postResults();
    });
  }

  function postResults() {
    var best      = speedInfo.bestServer
      , md5       = function(v) {
        return require('crypto').createHash('md5').update(v).digest('hex');
      }
      , dlspeedk  = Math.round(speedInfo.speedTestDownloadSpeed * 1000)
      , ulspeedk  = Math.round(speedInfo.speedTestUploadSpeed * 1000)
      , ping      = Math.round(best.bestPing)
      , res       = [
        'download', dlspeedk,
        'ping', ping,
        'upload', ulspeedk,
        'promo', '',
        'startmode', 'pingselect', //or flyok, recommendedselect
        'recommendedserverid', best.id,
        'accuracy', 1,
        'serverid', best.id,
        'hash', md5(ping + '-' + ulspeedk + '-' + dlspeedk + '-297aae72')
      ]
      , reportUrl = 'http://www.speedtest.net/api/api.php'
      , prms      = []
      , opts
      , n
      ;

    for (n = 0; n < res.length; n += 2) {
      prms.push(res[n] + '=' + encodeURIComponent(res[n + 1]));
    }

    opts = httpOpts(reportUrl);

    opts.headers.referer = 'http://c.speedtest.net/flash/speedtest.swf';

    postHttp(opts, prms.join('&'), function(err, data, status) {
      if (err) return self.emit('error', err);
      var match = String(data).match(/^resultid=(\d+)(&|$)/), resultUrl;
      if (status === 200 && match && match[1]) { //I get '0', don't know why. No one knows why.
        resultUrl = 'http://www.speedtest.net/result/' + match[1] + '.png';
      }

      speedInfo.resultUrl = resultUrl;

      self.emit('result', resultUrl);
      self.emit('done', speedInfo);
    });
  }

  return self;
}

module.exports = speedTest;

function visualSpeedTest(options, callback) {
  require('draftlog').into(console);

  // We only need chalk and DraftLog here. Lazy load it.
  var chalk = require('chalk')
    , test = speedTest(options)
    , log  = function() {}
    , finalData
    , percentage = 0
    , speed = 0
    , bar = console.draft()
    , size = 50
    , red = (chalk.supportsColor ? chalk.bgRed(' ') : '─')
    , green = (chalk.supportsColor ? chalk.bgGreen(' ') : '▇')
    ;

  callback = once(callback);

  if (options.log) {
    if (typeof options.log === 'function') {
      log = options.log;
    } else {
      log = console.log.bind(console);
    }
  }

  test.on('error', function(err) {
    callback(err);
  });

  test.on('testserver', function(server) {
    log('Using server by ' + server.sponsor + ' in ' + server.name + ', ' + server.country + ' (' + (server.distMi * 0.621371).toFixed(0) + 'mi, ' + (server.bestPing).toFixed(0) + 'ms)');
  });

  test.on('config', function(config) {
    var client = config.client;
    log('Testing from ' + client.ip + ' at ' + client.isp + ', expected dl: ' + (client.ispdlavg / 8000).toFixed(2) + 'MB/s, expected ul: ' + (client.ispulavg / 8000).toFixed(2) + 'MB/s');
  });

  function prog(what, pct, spd) {
    percentage = pct || percentage;
    speed = spd || speed;

    var complete = Math.round(percentage / 100 * size)
      , barStr = ''
      ;

    // What + padding
    barStr += what;
    barStr += ' '.repeat(12 - what.length);

    // Bar
    barStr += green.repeat(complete);
    barStr += red.repeat(size - complete);

    // Percent
    pct = percentage + '%';
    barStr += ' ' + pct;

    // Speed
    barStr += ' '.repeat(8 - pct.length) + speed;

    bar(barStr);
  }

  test.on('downloadprogress', function(pct) {
    prog('download', pct, null);
  });

  test.on('uploadprogress', function(pct) {
    prog('upload', pct, null);
  });

  test.on('downloadspeed', function(speed) {
    log('Download speed: ', speed.toFixed(2) + 'Mbps');

    // Create a new line after each new download
    bar = console.draft();
  });

  test.on('uploadspeed', function(speed) {
    log('Upload speed: ', speed.toFixed(2) + 'Mbps');

    // Create a new line after each new upload
    bar = console.draft();
  });

  test.on('downloadspeedprogress', function(speed) {
    prog('download', null, speed.toFixed(2) + 'Mbps');
  });

  test.on('uploadspeedprogress', function(speed) {
    prog('upload', null, speed.toFixed(2) + 'Mbps');
  });

  test.on('data', function(data) {
    finalData = data;
  });

  test.on('result', function(url) {
    log('Results url: ' + url);
  });

  test.on('done', function() {
    callback(null, finalData);
  });

  return test;
}

speedTest.visual = visualSpeedTest;
