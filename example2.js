/* Below is a convenience function that takes an array, intended to be an
 * TypedArrayView on a Shared Buffer, and will fill it with the range from 1 to
 * size. No bounds check is performed in accessing the passed-in array, and in
 * some languages or runtime environments this could introduce a buffer
 * overflow.
 */
const fillWithRange = (arr,size)=>(Array.from({ length: size }).map((_,i)=>i+1).forEach((v,i)=>arr[i]=v),arr);

/* Convenience function here again, because this is ultimately the specific
 * "SharedTypedArray" it doesn't really _matter_ what TypedArray is here and
 * you can change it. When you run it and see the output not be what you
 * expect, try to guess why. Think about what the numbers you see look like in
 * binary. If you don't know any off the top of your head, try these:
 *
 * Uint8Array
 * Int16Array
 * Uint32Array
 * Float32Array
 * Float64Array
 * BigInt64Array
 *
 */
const SharedArray = Uint32Array;

/* This is pulling shared globals and thread-local variables into the current
 * execution scope.
 */
const { Worker, isMainThread, workerData, parentPort, threadId } = require('worker_threads');

/* These two below sections differentiate between the values of variables set
 * by the thread environment, passed in as input to the process, or a default
 * value in code.
 *
 * This is split in two to aid in showing the argv input handling as well as a
 * necessity because the arrLen value is used to generate another variable's
 * default -- we need its value first.
 */
const { arrLen, threadCount } = workerData || {
  arrLen:      parseInt(process.argv[2]) || 20,
  threadCount: parseInt(process.argv[3]) || 2,
};
const { buf1, buf2, useAtomics } = workerData || {
  buf1: new SharedArrayBuffer(arrLen*SharedArray.BYTES_PER_ELEMENT),
  buf2: new SharedArrayBuffer(arrLen*SharedArray.BYTES_PER_ELEMENT),
};

// this block is not the main execution context
if (!isMainThread) {
  /* Logging to the console doesn't work directly in this thread setup as-is,
   * so far as the author knows this is because of how console.log works with
   * the stdout stream. This is a straightforward hack that sends the log
   * text to the main thread to log it. The direct console.log below the log
   * will be shown _inconsistently_ when this is true.
   *
   * Changing parentPort.postMessage to console.log will also be somewhat
   * unpredictable.
   */
  const log = (...args)=>parentPort.postMessage({log:`[${(new Date()).toISOString()}] (${process.pid}-${threadId}) ${args.join(' ')}`});
  log('new thread executing');
  console.log('this is why the postMessage hack');

  const start = Date.now();
  const arr1 = new SharedArray(buf1);
  const arr2 = new SharedArray(buf2);

  function showProgress() {
    log(`arr1:${arr1.join(',')} | arr2:${arr2.join(',')}`);
  }

  let i=0;
  let randIx,rand;
  let arr;
  /* These magic numbers in the loop may need to be adjusted to get reasonable
   * output on any given machine. The amount of work a given physical machine
   * can or will perform at any given moment is not something that can be known
   * at the time this code is written. The actions performed by this loop are
   * to iterate from 0 to a high number, sometimes logging information to the
   * screen, sometimes modifying the shared values referred to here as the
   * variables "arr1" and "arr2"
   */
  const SHRINK_LOOP_SIZE_BY      = 10000000;
  const SHOW_PROGRESS_EVERY      = 200000000000;
  const FIDDLE_WITH_MEMORY_EVERY = 300000;
  while (i++ < Number.MAX_SAFE_INTEGER/SHRINK_LOOP_SIZE_BY) {
    if (i%SHOW_PROGRESS_EVERY === 0) showProgress();
    if (i%FIDDLE_WITH_MEMORY_EVERY === 0) {
      randIx = Math.floor(Math.random()*arrLen);
      rand = Math.random(); // for consistency below
      const ixModifier = (rand=>randIx=>Math.ceil(randIx*rand*10))(rand);
      [arr,name] = randIx > Math.floor(arrLen/2) ? [arr1,'arr1'] : [arr2,'arr2'];
      /* Uncommenting the below log may be helpful but noisy
       */
      //log(`${useAtomics?'Atomics.':''}store ${name}[${randIx}]="${i+ixModifier(randIx)}"`);

      /* Running showProgress more often in any thread _may_ expose a data race
       * by using the different syntaxes below. I have not confirmed this
       * happens in reality on any particular machine, but my understanding of
       * the specification _allows_ for these syntaxes to differ in that
       * manner.
       *
       * The need for an "Atomics" global is itself a kind of proof
        * it's possible a different interface may perform differently.
       */
      if (useAtomics) {
        Atomics.store(arr, randIx, i+ixModifier(randIx));
      } else {
        arr[randIx]=i+ixModifier(randIx);
      }
    }
  };
  log(`arr1: ${arr1}\narr2: ${arr2}`);
  log(`new ${useAtomics?'Atomic':'direct-access'} thread finished in ${Date.now()-start}ms`);

}

// this block is the main execution context
if (isMainThread) {
  const log = (...args)=>console.log(`[${(new Date()).toISOString()}] (${process.pid}-${threadId}) ${args.join(' ')}`);
  log('main thread/process started');

  /* Initialize the shared data when the process starts, using the convenience
   * function at the top of the file.
   */
  const arr1 = fillWithRange(new SharedArray(buf1), arrLen);
  const arr2 = fillWithRange(new SharedArray(buf2), arrLen);

  /* Here we see concurrency and the only type of "threading" Javascript _used
   * to_ support. This thread schedules the showProgress function to be queued
   * to run at some point of time in the future. This allows a type of user
   * space thread via ad-hoc time slicing. In this example, it causes 
   */
  const ANNOYING_LOG_REPEAT_INTERVAL = 3000; // about once every 3 seconds
  let progressDisplay = setTimeout(function showProgress() {
    progressDisplay = setTimeout(showProgress, ANNOYING_LOG_REPEAT_INTERVAL);
    log(`arr1:${arr1.join(',')} | arr2:${arr2.join(',')}`);
  }, 0);
    
  const runThread = (useAtomics=false)=>{
    const worker = new Worker(__filename, { workerData: { buf1, buf2, arrLen, useAtomics, threadCount } });

    // postMessage hack because of stdin/sdtout stream semantics and how console.log works
    worker.on('message', data=>data.log && console.log(data.log));
    worker.on('error', e => console.log(e));
    worker.on('exit', (code) => {
      clearTimeout(progressDisplay);
      if (code !== 0) throw new Error(`Worker stopped with exit code ${code}`);

      log(`thread finished; arr1:${arr1} | arr2:${arr2}`);
    });
  };
  for (let i=0; i < threadCount; i++) {
    log(`starting thread ${i+1}`);
    runThread();
  }

  // this setTimeout is only to mimic the sleep(1)
  // it doesn't effect the outcome...
  // unless you make the timeout long enough
  // this function doesn't execute until after a log
  setTimeout(()=>{
    for (let i = 0; i < arrLen; i++) {
      Atomics.store(arr2, i, arr2[i] * 2);
    }
    for (let i = 0; i < threadCount; i++) {
      runThread(true);
    }
  }, 1000);
}

/*
jrandm@example:~/js-threads-canonical-reference$ uname -a
Linux example 4.4.0-176-generic #206-Ubuntu SMP Fri Feb 28 05:02:04 UTC 2020 x86_64 x86_64 x86_64 GNU/Linux

jrandm@example:~/js-threads-canonical-reference$ node -v
v12.16.1

jrandm@example:~/js-thread-canonical-reference$ time node example2.js 5 4 # time is used to get execution time for the node process, see man time
[2020-03-26T11:03:16.179Z] (12362-0) main thread/process started
[2020-03-26T11:03:16.183Z] (12362-0) starting thread 1
[2020-03-26T11:03:16.185Z] (12362-0) starting thread 2
[2020-03-26T11:03:16.186Z] (12362-0) starting thread 3
[2020-03-26T11:03:16.186Z] (12362-0) starting thread 4
[2020-03-26T11:03:16.188Z] (12362-0) arr1:1,2,3,4,5 | arr2:1,2,3,4,5
[2020-03-26T11:03:16.225Z] (12362-3) new thread executing
this is why the postMessage hack
[2020-03-26T11:03:16.227Z] (12362-4) new thread executing
this is why the postMessage hack
[2020-03-26T11:03:16.229Z] (12362-1) new thread executing
[2020-03-26T11:03:16.230Z] (12362-2) new thread executing
this is why the postMessage hack
this is why the postMessage hack
this is why the postMessage hack
[2020-03-26T11:03:17.260Z] (12362-8) new thread executing
this is why the postMessage hack
[2020-03-26T11:03:17.245Z] (12362-5) new thread executing
this is why the postMessage hack
[2020-03-26T11:03:17.245Z] (12362-6) new thread executing
this is why the postMessage hack
[2020-03-26T11:03:17.245Z] (12362-7) new thread executing
[2020-03-26T11:03:19.190Z] (12362-0) arr1:1,2,3,70800013,66000007 | arr2:72000000,124800009,71100004,8,10
[2020-03-26T11:03:22.194Z] (12362-0) arr1:1,2,3,230700004,232500004 | arr2:179700000,227400002,187500009,8,10
[2020-03-26T11:03:25.195Z] (12362-0) arr1:1,2,3,335100026,334800012 | arr2:347400000,344100003,302400017,8,10
[2020-03-26T11:03:28.198Z] (12362-0) arr1:1,2,3,388200015,462300012 | arr2:400500000,414300007,388500015,8,10
[2020-03-26T11:03:31.202Z] (12362-0) arr1:1,2,3,560100018,576600007 | arr2:523500000,507000003,570000003,8,10
[2020-03-26T11:03:34.203Z] (12362-0) arr1:1,2,3,631800017,618300029 | arr2:687300000,682200008,632100002,8,10
[2020-03-26T11:03:37.206Z] (12362-0) arr1:1,2,3,724500025,798300019 | arr2:729300000,774600002,794100004,8,10
[2020-03-26T11:03:39.895Z] (12362-2) arr1: 1,2,3,831300008,824100002
arr2: 831900000,874800006,896100007,8,10
[2020-03-26T11:03:39.911Z] (12362-2) new direct-access thread finished in 23680ms
[2020-03-26T11:03:39.915Z] (12362-0) thread finished; arr1:1,2,3,897000020,875400030 | arr2:824400000,835200005,824700006,8,10
[2020-03-26T11:03:40.013Z] (12362-3) arr1: 1,2,3,829200002,840300021
arr2: 879000000,861600003,829500016,8,10
[2020-03-26T11:03:40.013Z] (12362-3) new direct-access thread finished in 23787ms
[2020-03-26T11:03:40.022Z] (12362-0) thread finished; arr1:1,2,3,836700010,836400022 | arr2:879000000,879600009,829500016,8,10
[2020-03-26T11:03:40.516Z] (12362-4) arr1: 1,2,3,850500015,850200031
arr2: 871800000,900300003,859500011,8,10
[2020-03-26T11:03:40.516Z] (12362-4) new direct-access thread finished in 24288ms
[2020-03-26T11:03:40.519Z] (12362-0) thread finished; arr1:1,2,3,850500015,872100024 | arr2:871800000,900300003,859500011,8,10
[2020-03-26T11:03:40.957Z] (12362-7) arr1: 1,2,3,900300026,900000008
arr2: 900600000,900300001,868500015,8,10
[2020-03-26T11:03:40.957Z] (12362-7) new Atomic thread finished in 23712ms
[2020-03-26T11:03:40.960Z] (12362-0) thread finished; arr1:1,2,3,877800021,900000008 | arr2:900600000,900300001,868800016,8,10
[2020-03-26T11:03:40.964Z] (12362-1) arr1: 1,2,3,869400016,900000008
arr2: 878100000,869100007,900600002,8,10
[2020-03-26T11:03:40.964Z] (12362-1) new direct-access thread finished in 24734ms
[2020-03-26T11:03:40.967Z] (12362-0) thread finished; arr1:1,2,3,869400016,900000008 | arr2:878100000,869400009,900600002,8,10
[2020-03-26T11:03:41.297Z] (12362-5) arr1: 1,2,3,892800010,892500031
arr2: 892500000,891900009,893100014,8,10
[2020-03-26T11:03:41.297Z] (12362-5) new Atomic thread finished in 24052ms
[2020-03-26T11:03:41.301Z] (12362-0) thread finished; arr1:1,2,3,892800010,892500031 | arr2:893100000,891900009,893100014,8,10
[2020-03-26T11:03:41.406Z] (12362-8) arr1: 1,2,3,899400016,898800033
arr2: 900300000,899700003,900600014,8,10
[2020-03-26T11:03:41.406Z] (12362-8) new Atomic thread finished in 24146ms
[2020-03-26T11:03:41.408Z] (12362-0) thread finished; arr1:1,2,3,899400016,898800033 | arr2:900300000,900600006,900600014,8,10
[2020-03-26T11:03:41.409Z] (12362-6) arr1: 1,2,3,899400016,898800033
arr2: 900300000,900600006,900600014,8,10
[2020-03-26T11:03:41.409Z] (12362-6) new Atomic thread finished in 24163ms
[2020-03-26T11:03:41.411Z] (12362-0) thread finished; arr1:1,2,3,899400016,898800033 | arr2:900300000,900600006,900600014,8,10

real    0m25.289s
user    3m5.052s
sys     0m0.124s
*/
