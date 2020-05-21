/* Example1.js
 *
 * This example shows logs from within a while loop and within a setTimeout loop.
 *
 */

// get thread stuff, all built-ins from node
const { Worker, isMainThread, workerData, parentPort, threadId } = require('worker_threads');

/* First, setup a recursive setTimeout to run the entire length of this program.
 * It will log immediately and then once every second until complete.
 * This function will be invoked only in the main thread.
 */

function recursiveTimeoutLog() {
  // use for counter in loop
  let n = 0;
  let stop = false;
  function loop() {
    console.log(`[${(new Date()).toISOString()}] (${process.pid}-${threadId}) timeout log: ${++n}`);
    if (!stop) setTimeout(loop, 1000);
  }
  loop();
  return function stopLoop() {
    stop = true;
  };
}

function blockingWhileLoop(log,output,timeInMs=5000,logEvery=10000000) {
  const stopTime = Date.now() + timeInMs;
  let n = 0;
  while (Date.now() < stopTime) {
    if (++n%logEvery===0) log(`[${(new Date()).toISOString()}] (${process.pid}-${threadId}) ${output}: ${n}`);
  }
}

if (isMainThread) {

  // start timeout
  const stopTimeout = recursiveTimeoutLog();

  // Run a "long" while loop for several seconds, logging occasionally
  // This blocks the event loop and keeps the timeout log from firing 
  blockingWhileLoop(console.log,'first while');

  // Now spin off a worker to run another loop exactly like above
  const worker = new Worker(__filename);

  // postMessage hack because of stdin/sdtout stream semantics and how console.log works
  worker.on('message', data=>data.log && console.log(data.log));
  worker.on('error', e=>console.log(e));
  worker.on('exit', (code)=>{
    stopTimeout();
    if (code !== 0) throw new Error(`Worker stopped with exit code ${code}`);
  });
}

if (!isMainThread) {
  const log = (...args)=>parentPort.postMessage({log:args.join(' ')});
  blockingWhileLoop(log,'second while');
}

/*
jrandm@example:~/js-threads-canonical-reference$ uname -a
Linux example 4.4.0-178-generic #208-Ubuntu SMP Sun Apr 5 23:45:10 UTC 2020 x86_64 x86_64 x86_64 GNU/Linux

jrandm@example:~/js-threads-canonical-reference$ node -v
v12.16.1

jrandm@example:~/js-thread-canonical-reference$ time node example1.js 5 4 # time is used to get execution time for the node process, see man time
[2020-05-21T23:41:52.350Z] (21661-0) timeout log: 1
[2020-05-21T23:41:52.887Z] (21661-0) first while: 10000000
[2020-05-21T23:41:53.414Z] (21661-0) first while: 20000000
[2020-05-21T23:41:53.930Z] (21661-0) first while: 30000000
[2020-05-21T23:41:54.451Z] (21661-0) first while: 40000000
[2020-05-21T23:41:54.970Z] (21661-0) first while: 50000000
[2020-05-21T23:41:55.494Z] (21661-0) first while: 60000000
[2020-05-21T23:41:56.006Z] (21661-0) first while: 70000000
[2020-05-21T23:41:56.527Z] (21661-0) first while: 80000000
[2020-05-21T23:41:57.043Z] (21661-0) first while: 90000000
[2020-05-21T23:41:57.356Z] (21661-0) timeout log: 2
[2020-05-21T23:41:57.910Z] (21661-1) second while: 10000000
[2020-05-21T23:41:58.357Z] (21661-0) timeout log: 3
[2020-05-21T23:41:58.430Z] (21661-1) second while: 20000000
[2020-05-21T23:41:58.950Z] (21661-1) second while: 30000000
[2020-05-21T23:41:59.358Z] (21661-0) timeout log: 4
[2020-05-21T23:41:59.474Z] (21661-1) second while: 40000000
[2020-05-21T23:41:59.988Z] (21661-1) second while: 50000000
[2020-05-21T23:42:00.358Z] (21661-0) timeout log: 5
[2020-05-21T23:42:00.514Z] (21661-1) second while: 60000000
[2020-05-21T23:42:01.030Z] (21661-1) second while: 70000000
[2020-05-21T23:42:01.358Z] (21661-0) timeout log: 6
[2020-05-21T23:42:01.547Z] (21661-1) second while: 80000000
[2020-05-21T23:42:02.062Z] (21661-1) second while: 90000000
[2020-05-21T23:42:02.358Z] (21661-0) timeout log: 7
[2020-05-21T23:42:03.359Z] (21661-0) timeout log: 8

real    0m11.072s
user    0m10.224s
sys     0m0.056s
*/
