(function () {
    'use strict';

    var REPEAT_JOBS = 3,
        FILES = ['100k.dat', '200k.dat', '10M.dat', '0.dat'];

    function jobRunner() {
        var jobs = [];
        var out = [];
        var resolve = undefined;

        function push(job) {
            jobs.push(job);
        }

        function run() {
            var job = jobs.shift();

            if (!job) {
                resolve(out);
                return;
            }

            job().then(function () {
                out.push({
                    success: true,
                    args: arguments
                });
                run();
            }, function () {
                out.push({
                    success: false,
                    args: arguments
                });
                run();
            })
        }

        function start() {
            return new Promise(function (r) {
                resolve = r;
                run();
            });
        }

        return Object.freeze({
            start: start,
            push: push
        });
    }

    function download(url) {
        return new Promise(function (resolve, reject) {
            var chunks = [],
                req,
                total;

            function handleProgress(evt) {
                var date = new Date();

                if (evt.lengthComputable) {
                    chunks.push({
                        date: date,
                        loaded: evt.loaded
                    });
                    total = evt.total;
                }
            }

            function handleSuccess() {
                resolve(chunks);
            }

            function handleFailure() {
                reject();
            }

            req = new XMLHttpRequest();
            req.open("GET", url + '?' + (new Date()).getTime());
            req.overrideMimeType("text/plain; charset=x-user-defined");

            req.addEventListener('progress', handleProgress);
            req.addEventListener('load', handleSuccess);
            req.addEventListener('error', handleFailure);
            req.addEventListener('abort', handleFailure);

            req.send();

            chunks.push({
                date: new Date(),
                loaded: 0
            });
        });
    }

    function post(url, data) {
        return new Promise(function (resolve, reject) {
            var req = new XMLHttpRequest(),
                dataParts = [];
            req.open('POST', url, true);
            req.setRequestHeader(
                'Content-Type',
                'application/x-www-form-urlencoded; charset=UTF-8'
            );

            req.addEventListener('load', resolve);
            req.addEventListener('error', reject);
            req.addEventListener('abort', reject);

            Object.keys(data).forEach(function (k) {
                dataParts.push(encodeURIComponent(k) + '=' + encodeURIComponent(data[k]));
            });

            req.send(dataParts.join('&'));
        });
    }

    function chunksToSpeeds(chunks) {
        var i,
            dt,
            dx,
            speeds = [];

        for (i = 1; i < chunks.length; i += 1) {
            dx = chunks[i].loaded - chunks[i - 1].loaded;
            dt = (chunks[i].date.getTime() - chunks[i - 1].date.getTime()) / 1000;
            speeds.push(dx / dt);
        }

        return speeds;
    }

    function findNTile(position, array) {
        var workArray = [].concat(array).sort();
        return workArray[Math.min(array.length, Math.floor(position * array.length))];
    }

    function statsAnalysis(array) {
        function makeAvg(ar) {
            return ar.reduce(function (a, b) { return a + b; }, 0) / ar.length;
        }

        function makeSquareDiff(v) {
            return Math.pow(v - avg, 2);
        }

        var avg = makeAvg(array),
            med = findNTile(0.5, array),
            min = Math.min.apply(Math, array),
            max = Math.max.apply(Math, array),
            n90 = findNTile(0.9, array),
            n10 = findNTile(0.1, array),
            dev = Math.sqrt(makeAvg(array.map(makeSquareDiff)));

        return {
            avg: avg,
            med: med,
            min: min,
            max: max,
            n90: n90,
            n10: n10,
            dev: dev
        };
    }

    function downloadJob(url) {
        return function () {
            return new Promise(function (resolve, reject) {
                download(url).then(function (chunks) {
                    resolve(chunks);
                }, function () {
                    reject();
                });
            });
        };
    }

    function draw(speed, ping, raw) {
        document.querySelector('#loading').remove();
        document.querySelector('#speed').innerText = parseInt(speed) + ' ko/s';
        document.querySelector('#ping').innerText = parseInt(ping) + ' ms';
    }

    function runDownloads() {
        var jr = jobRunner(),
            j,
            i;

        for (i = 0; i < FILES.length; i += 1) {
            for (j = 0; j < REPEAT_JOBS; j += 1) {
                jr.push(downloadJob('files/' + FILES[i]));
            }
        }

        jr.start().then(function (res) {
            var speeds = [],
                latencies = [],
                speedStats,
                pingStats,
                data;

            res.forEach(function (out) {
                var chunks,
                    speed;

                if (!out.success) {
                    return;
                }

                chunks = out.args[0];
                speed = findNTile(0.9, chunksToSpeeds(chunks));

                if (speed && speed !== Infinity) {
                    speeds.push(speed);
                }

                if (chunks.length >= 2) {
                    latencies.push(
                        (chunks[1].date.getTime() - chunks[0].date.getTime()) / 1000
                    );
                }
            });

            speedStats = statsAnalysis(speeds);
            pingStats = statsAnalysis(latencies);

            draw(speedStats.n90 / 1024, pingStats.min * 1000, {
                speed: speedStats,
                ping: pingStats
            });

            data = {
                speeds: speeds,
                pings: latencies,
                pingStats: pingStats,
                speedStats: speedStats
            };

            post('writer.php', {
                data: JSON.stringify(data)
            });
        });
    }

    runDownloads();
}());
