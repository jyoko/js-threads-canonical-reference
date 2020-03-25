# Javascript is Multithreaded

## And Corollaries Like "Javascript is not single threaded"

## STATUS: DRAFT - INCOMPLETE

### Overview

The purpose of this document is to attempt to give a canonical reference on the topic of threads in Javascript.

This position has been thoroughly researched, debated, and uses many citations to primary sources or source code and output in specific environments to assert this position. Javascript does not care who uses it or how we talk about it; it is either an abstract thing, a document called a specification, source code for a real machine, or the act of executing source code in a real machine. If we cannot agree on what we're talking about then we cannot focus on whatever purpose there is to what our code is meant to do!

Older documents, including versions _of this document_, may have used words to mean different things at different times. This is a not a criticism of existing works.

Any and all reproductions of this work are free for anyone to use without restriction. The intent is for people to learn and to make communication easier; myself and the others that helped me create this document appreciate credit but it is not necessary unless otherwise specifically stated.

Please help us improve this document. At the time of writing this first draft, I am publishing it on Github and you may use the tools available there. This may change and does not preclude other methods or maintainers.

The words written here, unless specifically defined otherwise, are used according to a meaning that can be found on wordnik.com.[0]

TODO: deal with markdown and formatting definitions, and/or make this entirely human-reading-oriented plaintext and decide how to deal with converting those inline citations/links for different versions or markup from there.

### Caveats: Jargon Definitions and Background

The words process and thread as commonly used are inherently ambiguous. A similar event occurs when speaking of [rectangles](https://en.wikipedia.org/wiki/Rectangle) and [squares](https://en.wikipedia.org/wiki/Square) and any other time one word may be defined with the other.

This document addresses engineering concerns as relates to Javascript[1], meaning:

1. The language defined in the [ECMAScript® 2019 Language Specification](https://www.ecma-international.org/ecma-262/10.0/index.html), aka ECMA-262, 10th edition, June 2019, aka Javascript, aka JS, and many other things.
2. The most popular implementations of that specification, specifically [NodeJS](https://nodejs.org) and [v8](https://v8.dev) or the execution environments provided as web applications or web pages in web browsers like [Chromium](https://www.chromium.org/Home) and [Mozilla Firefox](https://www.mozilla.org/firefox/browsers).

and the concept of [processes](https://en.wikipedia.org/wiki/Process_(computing)) and [threads](https://en.wikipedia.org/wiki/Thread_(computing)) as defined by Wikipedia, or in a manner similar to [POSIX Threads](https://en.wikipedia.org/wiki/POSIX_Threads) and other common conceptual models as implemented in [Linux](https://linux.die.net/man/7/pthreads), [Windows](https://www.sourceware.org/pthreads-win32/conformance.html), [BSD](https://www.unix.com/man-page/freebsd/3/libthr/), and [Mac OS](https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/Multithreading/CreatingThreads/CreatingThreads.html) operating systems.

On the distinctions between "user threads" or "user-space threads" and "kernel threads", the [History section of the Wikipedia entry `Thread_(computing)#History`](https://en.wikipedia.org/wiki/Thread_(computing)#History) has this to say:

> Threads made an early appearance under the name of "tasks" in OS/360 Multiprogramming with a Variable Number of Tasks (MVT) in 1967. Saltzer (1966) credits Victor A. Vyssotsky with the term "thread". The process schedulers of many modern operating systems directly support both time-sliced and multiprocessor threading, and the operating system kernel allows programmers to manipulate threads by exposing required functionality through the system-call interface. Some threading implementations are called kernel threads, whereas light-weight processes (LWP) are a specific type of kernel thread that share the same state and information. Furthermore, programs can have user-space threads when threading with timers, signals, or other methods to interrupt their own execution, performing a sort of ad hoc time-slicing.

Source code given in this document will demonstrate threading done by timers provided by a Javascript runtime environment (like [`setTimeout`](https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/setTimeout)) and in the concurrent, parallel execution meaning as provided by an underlying operating system scheduler.

This document is aware of [C specifications](https://web.archive.org/web/20161223125339/http://flash-gordon.me.uk/ansi.c.txt) and other programming languages' use of this technical jargon. The word "thread" does not appear in the specification linked to in the previous sentence. The specification does define shared namespaces, it says a 

> special guarantee is made in order to simplify the use of unions: If a union contains several structures that share a common initial sequence, and if the union object currently contains one of these structures, it is permitted to inspect the common initial part of any of them.

Thus enabling a C implementation to share a resource like memory in a manner that allows something like the above definitions of "threads" to exist in a given C process, including implementations of [POSIX threads](https://pubs.opengroup.org/onlinepubs/9699919799/basedefs/pthread.h.html) commonly used today.

Any refutation of this document's title and main point must clearly define the usage of any disputed term and demonstrate a working example others may use to confirm your refutation is accurate. This document is extremely precise, so should be any worthwhile or useful criticism.

### Concession

The only concession this document makes is:

1. If you choose to define the words differently then the assertion of this document can be made untrue.

The position of this document is that is always true of any statement and is pointless semantic debate.

### Explanation of a Javascript Runtime

To explain what happens in any real machine executing Javascript code, we must first understand what exactly Javascript code _is_. To quote the [ECMAScript Overview](https://www.ecma-international.org/ecma-262/10.0/index.html#sec-overview) nearly in full:

> ECMAScript is an object-oriented programming language for performing computations and manipulating computational objects within a host environment. ECMAScript as defined here is not intended to be computationally self-sufficient; indeed, there are no provisions in this specification for input of external data or output of computed results. Instead, it is expected that the computational environment of an ECMAScript program will provide not only the objects and other facilities described in this specification but also certain environment-specific objects, whose description and behaviour are beyond the scope of this specification except to indicate that they may provide certain properties that can be accessed and certain functions that can be called from an ECMAScript program.

> ECMAScript was originally designed to be used as a scripting language, but has become widely used as a general-purpose programming language. A scripting language is a programming language that is used to manipulate, customize, and automate the facilities of an existing system. In such systems, useful functionality is already available through a user interface, and the scripting language is a mechanism for exposing that functionality to program control. In this way, the existing system is said to provide a host environment of objects and facilities, which completes the capabilities of the scripting language. A scripting language is intended for use by both professional and non-professional programmers.

> ECMAScript was originally designed to be a Web scripting language, providing a mechanism to enliven Web pages in browsers and to perform server computation as part of a Web-based client-server architecture. ECMAScript is now used to provide core scripting capabilities for a variety of host environments. Therefore the core language is specified in this document apart from any particular host environment.

> ECMAScript usage has moved beyond simple scripting and it is now used for the full spectrum of programming tasks in many different environments and scales. As the usage of ECMAScript has expanded, so has the features and facilities it provides. ECMAScript is now a fully featured general-purpose programming language.

Javascript code by itself has _no defined way to handle input and output with a user_ and only defines how a single execution flow of a Javascript process should perform.

What this means is that from the very beginning, Javascript _implementations_ or _runtimes_ may have been multithreaded: All that this means is that in what the host operating system defines as a "process" there are multiple "threads" of execution.

Early versions of Javascript (implementations and the ECMAScript specification both) could thus be technically described as multithreaded, but it was a misleading thing to say: JS defines "single-threaded" execution, or a single series of discrete steps. Most programming environments use a "thread" to refer to doing work _in parallel_ and not merely _concurrently_ when such a distinction is meaningful. This, due to no defined way for parallel execution contexts to _by definition_ share resources in the same process, is what lead to the many statements of "Javascript is single threaded." Many of those statements made concessions to engine implementations and were correctly asserting that parallel execution was not enabled in the specification.

The specification did not _disallow_ this behavior, though! It simply was undefined. Javascript did not define how to share access to resources like memory in the same process. [Clause 27 of the current ECMAScript specification (titled Memory Model)](https://www.ecma-international.org/ecma-262/10.0/index.html#sec-memory-model) uses the abstract definition of a Shared [Data Block](https://www.ecma-international.org/ecma-262/10.0/index.html#sec-data-blocks) in order to define this kind of thing; a portion of the Data Block definition is reproduced below:

> The Data Block specification type is used to describe a distinct and mutable sequence of byte-sized (8 bit) numeric values. [...] A data block that resides in memory that can be referenced from multiple agents concurrently is designated a Shared Data Block. A Shared Data Block has an identity (for the purposes of equality testing Shared Data Block values) that is address-free: it is tied not to the virtual addresses the block is mapped to in any process, but to the set of locations in memory that the block represents.

What this is saying is that the abstract data storage mechanism that Javascript uses (because the actual input/output is left to the implementor) must _allow_ for shared access (ie: threaded execution by sharing this memory resource in a given JS process is permitted and defined here in the specification). A given implementation _may_ not meet a person's specific desired definition of a "thread" but the necessary conceptual underpinnings or execution and data access primitives are _defined_ in the specification and we can look at _real implementations_.

This document is focused on _engineers_ or _programmers_ who are working with real systems, not theoretical computer scientists. Introductory documents may choose to be less precise or inaccurate as a way of simplifying the presentation of information to students.

To further that goal, let us now examine how a specific implementation of this specification, [NodeJS version 12.x](https://github.com/nodejs/node/tree/v12.x), actually uses processes and threads as defined by an operating system like Linux, using [implementations of POSIX threads](https://github.com/nodejs/node/blob/d6f6d7f8541327b72667d38777c47b9ea675125d/deps/uv/docs/src/threading.rst) as provided by [libuv](https://libuv.org):

Below is a text-based diagram (with own supporting glossary) that attempts to show what happens in a NodeJS program when you run it at a highly-abstracted level of a process and threads of execution:

```
+=========================================================================================+
|                                  NodeJS Process                                         |
|=========================================================================================|
|                                        ||                                               |
|  +--------------------------+          ||                                               |
|  |    Resources:  Memory    |<========>|| <------------ This downward flow, beginning   |
|  |--------------------------|          \/               when the process is executed,   |
|  |                          |   +--------------+        is the thread of execution.     |
|  | +----------------------+ |   |  Event Loop  |                                        |
|  | | Shared Address Space | |   +--------------+                                        |
|  | +----------------------+ |          ||                                               |
|  |                          |         //\\  <---------- A split of the execution        |
|  | +----------------------+ |        //  \\             inside of a process is          |
|  | | Local/Auto Variables | |       //    \\            commonly called a "thread"      |
|  | +----------------------+ |      ||     ||                                            |
|  |                          |      \/     \/                                            |
|  | +----------------------+ |  +------+ +------+                                        |
|  | |   Global Variables   | |  | STEP | | STEP | <----- What these steps really do is   |
|  | +----------------------+ |  +------+ +------+        unimportant, it can be          |
|  |                          |     ||      ||            anything                        |
|  +--------------------------+     \/      \/                                            |
|                                +------+ +------+                                        |
|                                | STEP | | STEP |                                        |
|                                +------+ +------+                                        |
|                                   ||      ||                                            |
|                                   \\      //                                            |
|                                    \\    //  <--------- No matter whether engine        |
|                                     \\  //              internals or application        |
|                                      \\//               code, it is eventually          |
|                                       ||                seen back at this top           |
|                                       \/                level process                   |
|                             +---------------------+                                     |
|                             |  Repeat Event Loop  |                                     |
|                             +---------------------+                                     |
|                                       ||                                                |
|                                       \/                                                |
+=========================================================================================+



+=========================================================================================+
|                                    Glossary                                             |
|=========================================================================================|
|                                                                                         |
| NodeJS:               A specific piece of software that acts as a Javascript            |
|                       runtime environment or engine.                                    |
|                                                                                         |
| NodeJS Process:       A compiled NodeJS executable binary file being executed           |
|                       by an operating system. Specifically in these examples,           |
|                       NodeJS v12.16.1 on a recent version of Ubuntu Linux.              |
|                                                                                         |
| Process:              A combined set of resources and a current execution               |
|                       context.                                                          |
|                                                                                         |
| Execution Context:    The state of an executing action or event at a moment             |
|                       in time, like variables and scope.                                |
|                                                                                         |
| Thread:               A current execution context.                                      |
|                                                                                         |
| Resource:             A thing to be used like memory or thread of execution.            |
|                                                                                         |
| Memory:               Blobs of data on a storage medium.                                |
|                                                                                         |
| Shared Address Space: An area of memory accessible to all threads within the            |
|                       process.                                                          |
|                                                                                         |
| Local/Auto Variables: A variable in a specific scope or execution context,              |
|                       here meaning thread and represented by a "block" of               |
|                       code when written as Javascript. Auto is short for                |
|                       "automatic" and means resource allocation for the                 |
|                       variable is handled automatically by its execution                |
|                       context.                                                          |
|                                                                                         |
| Global Variables:     A variable visible to the entire program or process.              |
|                                                                                         |
| Step:                 Any arbitrary action performed by the code.                       |
|                                                                                         |
| Event Loop:           A logical construction for a repeated series of steps.            |
|                                                                                         |
+=========================================================================================+
```

TODO: This is a placeholder sentence for any conclusion or further explanation needed for the above representation.

### Examples

Examples given in this document are meant to be run with and output is shown using Node v12.16.1. Any fully-compliant Javascript implementation with [a similar API](https://nodejs.org/api/worker_threads.html) should get more-or-less the same result depending upon the specifics of the execution within that machine.

Output of the given examples is included within this document as well as in the source code in the companion, standalone files as a comment at the bottom of the code.

#### Example 1

This example shows logs from within a `while` loop and within a `setTimeout` loop. These happen simultaneously within the same process.

```javascript
TODO:placeholder
```

Output:

```
TODO:placeholder
```

#### Example 2

This example uses both the regular bracket-notation access and the `Atomics` global to update shared memory.

```javascript
TODO:placeholder
```

Output:

```
TODO:placeholder
```

#### Example 3

This example uses the Web Worker API and is visible in a browser here (TODO:use github pages) and here (TODO:use jsFiddle or similar site).

```html
TODO:placeholder
```

### Footnotes

[0]: From [wordnik.com/about](https://wordnik.com/about)

> What is Wordnik?
> 
> Wordnik is the world's biggest online English dictionary, by number of words.
> 
> Wordnik is a 501(c)(3) nonprofit organization, and our mission is to find and share as many words of English as possible with as many people as possible.

[1]: Javascript is a [trademark owned by Oracle](https://tsdr.uspto.gov/#caseNumber=75026640&caseType=SERIAL_NO&searchType=statusSearch) and other official documents avoid using it because Oracle has just been terrible sometimes. That is the opinion of this document and may be disputed. This author hopes Oracle's lawyers have not yet found some way to sue "the internet" for infringing upon their trademark in source code.
