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
  arrLen: parseInt(process.argv[2]) || 20, // add input too
  threadCount: parseInt(process.argv[3])>MAX_THREAD_DEMO_LIMIT && MAX_THREAD_DEMO_LIMIT ||
               parseInt(process.argv[3]) || 2, // more input
};
const { buf1, buf2, useAtomics } = workerData || {
  buf1: new SharedArrayBuffer(arrLen*SharedArray.BYTES_PER_ELEMENT),
  buf2: new SharedArrayBuffer(arrLen*SharedArray.BYTES_PER_ELEMENT),
};

// this block is not the main execution context
if (!isMainThread) {
  const log = (...args)=>parentPort.postMessage({log:`[${(new Date()).toISOString()}] (${process.pid}-${threadId}) ${args.join(' ')}`});
  const start = Date.now();
  log('am I a thread??');
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
  while (i++ < Number.MAX_SAFE_INTEGER/10) {
    if (i%2000 === 0) showProgress();
    if (i%3000 === 0) {
      randIx = Math.floor(Math.random()*arrLen);
      rand = Math.random(); // for consistency below
      const ixModifier = (rand=>randIx=>Math.ceil(randIx*rand*10))(rand);
      [arr,name] = randIx > Math.floor(arrLen/2) ? [arr1,'arr1'] : [arr2,'arr2'];
      log(`${useAtomics?'Atomics.':''}store ${name}[${randIx}]="${i+ixModifier(randIx)}"`);
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
  log(`new thread finished in ${Date.now()-start}ms`);

}

// this block is the main execution context
if (isMainThread) {
  const log = (...args)=>console.log(`[${(new Date()).toISOString()}] (${process.pid}-${threadId}) ${args.join(' ')}`);
  log('am I a thread??');

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
  let progressDisplay = setTimeout(function showProgress() {
    progressDisplay = setTimeout(showProgress, 100);
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
jrandm@example:~$ node -v
v12.16.1
jrandm@example:~$ node demo.js 5
[2020-03-23T13:20:34.082Z] (8328-0) am I a thread??
[2020-03-23T13:20:34.087Z] (8328-0) starting thread 1
[2020-03-23T13:20:34.089Z] (8328-0) starting thread 2
[2020-03-23T13:20:34.090Z] (8328-0) arr1:1,2,3,4,5 | arr2:1,2,3,4,5
[2020-03-23T13:20:34.115Z] (8328-1) am I a thread??
[2020-03-23T13:20:34.116Z] (8328-2) am I a thread??
[2020-03-23T13:20:34.179Z] (8328-1) arr1:1,2,3,4,5 | arr2:1,2,3,4,5
[2020-03-23T13:20:34.181Z] (8328-2) arr1:1,2,3,4,5 | arr2:1,2,3,4,5
[2020-03-23T13:20:34.190Z] (8328-0) arr1:1,2,3,4,5 | arr2:1,2,3,4,5
[2020-03-23T13:20:34.222Z] (8328-1) store arr2[1]="30000009"
[2020-03-23T13:20:34.224Z] (8328-2) store arr1[3]="30000016"
[2020-03-23T13:20:34.273Z] (8328-1) arr1:1,2,3,30000016,5 | arr2:1,30000009,3,4,5
[2020-03-23T13:20:34.275Z] (8328-2) arr1:1,2,3,30000016,5 | arr2:1,30000009,3,4,5
[2020-03-23T13:20:34.290Z] (8328-0) arr1:1,2,3,30000016,5 | arr2:1,30000009,3,4,5
[2020-03-23T13:20:34.366Z] (8328-1) arr1:1,2,3,30000016,5 | arr2:1,30000009,3,4,5
[2020-03-23T13:20:34.366Z] (8328-1) store arr2[2]="60000019"
[2020-03-23T13:20:34.370Z] (8328-2) arr1:1,2,3,30000016,5 | arr2:1,30000009,60000019,4,5
[2020-03-23T13:20:34.370Z] (8328-2) store arr1[3]="60000020"
[2020-03-23T13:20:34.390Z] (8328-0) arr1:1,2,3,60000020,5 | arr2:1,30000009,60000019,4,5
[2020-03-23T13:20:34.461Z] (8328-1) arr1:1,2,3,60000020,5 | arr2:1,30000009,60000019,4,5
[2020-03-23T13:20:34.465Z] (8328-2) arr1:1,2,3,60000020,5 | arr2:1,30000009,60000019,4,5
[2020-03-23T13:20:34.491Z] (8328-0) arr1:1,2,3,60000020,5 | arr2:1,30000009,60000019,4,5
[2020-03-23T13:20:34.506Z] (8328-1) store arr2[2]="90000019"
[2020-03-23T13:20:34.506Z] (8328-1) arr1: 1,2,3,60000020,5
arr2: 1,30000009,90000019,4,5
[2020-03-23T13:20:34.506Z] (8328-1) new thread finished in 391ms
[2020-03-23T13:20:34.508Z] (8328-0) thread finished; arr1:1,2,3,60000020,5 | arr2:1,30000009,90000019,4,5
[2020-03-23T13:20:34.511Z] (8328-2) store arr1[3]="90000014"
[2020-03-23T13:20:34.512Z] (8328-2) arr1: 1,2,3,90000014,5
arr2: 1,30000009,90000019,4,5
[2020-03-23T13:20:34.512Z] (8328-2) new thread finished in 396ms
[2020-03-23T13:20:34.513Z] (8328-0) thread finished; arr1:1,2,3,90000014,5 | arr2:1,30000009,90000019,4,5
[2020-03-23T13:20:35.123Z] (8328-4) am I a thread??
[2020-03-23T13:20:35.123Z] (8328-3) am I a thread??
[2020-03-23T13:20:35.189Z] (8328-3) arr1:1,2,3,90000014,5 | arr2:2,60000018,180000038,8,10
[2020-03-23T13:20:35.190Z] (8328-4) arr1:1,2,3,90000014,5 | arr2:2,60000018,180000038,8,10
[2020-03-23T13:20:35.233Z] (8328-3) Atomics.store arr1[4]="30000026"
[2020-03-23T13:20:35.234Z] (8328-4) Atomics.store arr1[4]="30000004"
[2020-03-23T13:20:35.279Z] (8328-3) arr1:1,2,3,90000014,30000004 | arr2:2,60000018,180000038,8,10
[2020-03-23T13:20:35.279Z] (8328-4) arr1:1,2,3,90000014,30000004 | arr2:2,60000018,180000038,8,10
[2020-03-23T13:20:35.354Z] (8328-3) arr1:1,2,3,90000014,30000004 | arr2:2,60000018,180000038,8,10
[2020-03-23T13:20:35.354Z] (8328-3) Atomics.store arr2[2]="60000012"
[2020-03-23T13:20:35.354Z] (8328-4) arr1:1,2,3,90000014,30000004 | arr2:2,60000018,180000038,8,10
[2020-03-23T13:20:35.354Z] (8328-4) Atomics.store arr2[0]="60000000"
[2020-03-23T13:20:35.440Z] (8328-3) arr1:1,2,3,90000014,30000004 | arr2:60000000,60000018,60000012,8,10
[2020-03-23T13:20:35.440Z] (8328-4) arr1:1,2,3,90000014,30000004 | arr2:60000000,60000018,60000012,8,10
[2020-03-23T13:20:35.480Z] (8328-3) Atomics.store arr2[2]="90000009"
[2020-03-23T13:20:35.480Z] (8328-3) arr1: 1,2,3,90000014,30000004
arr2: 90000000,60000018,90000009,8,10
[2020-03-23T13:20:35.480Z] (8328-3) new thread finished in 357ms
[2020-03-23T13:20:35.480Z] (8328-4) Atomics.store arr2[0]="90000000"
[2020-03-23T13:20:35.481Z] (8328-4) arr1: 1,2,3,90000014,30000004
arr2: 90000000,60000018,90000009,8,10
[2020-03-23T13:20:35.481Z] (8328-4) new thread finished in 359ms
[2020-03-23T13:20:35.482Z] (8328-0) thread finished; arr1:1,2,3,90000014,30000004 | arr2:90000000,60000018,90000009,8,10
[2020-03-23T13:20:35.483Z] (8328-0) thread finished; arr1:1,2,3,90000014,30000004 | arr2:90000000,60000018,90000009,8,10
*/
