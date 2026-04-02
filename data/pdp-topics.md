
**JS Jun**

1. Types, Operators, and Type System Core

-   Primitive vs. Reference values.

-   Detailed behavior of null, undefined, Symbol, BigInt.

-   Type Coercion: implicit (==, +) and explicit (Number(), String()).

-   typeof, instanceof, and type checking strategies.

2\. Functions & Execution Mechanics

-   Function types: Declarations, Expressions, Arrow, IIFE.

-   Hoisting of variables (var, let, const) and functions.

-   Closures: Lexical scope, practical patterns (data privacy, module pattern).

3\. The this Keyword & Execution Context

-   How this is bound: global, method, constructor, explicit (call, apply, bind).

-   The loss of this and solutions (bound functions, self = this, arrow functions).

-   Ties closely with Function, Context.

4\. Objects: Prototypes, Inheritance, and Properties

-   Object Inheritance, \_\_proto\_\_, prototype: The prototype chain, new operator, Object.create.

-   Object Descriptors: Property flags (writable, enumerable, configurable), getters/setters (set/get).

-   ES6 Classes as syntactic sugar over prototypes.

5\. Advanced Data Structures & Iteration

-   Array Methods: Master map, filter, reduce, find, some, every, flatMap.

-   Iterables, Iterators, for\...of loop.

-   Map, Set, WeakMap, WeakSet and their use cases vs. plain objects.

6\. Asynchronous JavaScript & The Event Loop

-   *(Essential modern topic to add)*

-   How JavaScript works: Call Stack, Web APIs, Callback Queue, Microtask Queue.

-   Callbacks, Promises (then/catch/finally), async/await.

-   Error handling in async code.

7\. Regular Expressions & Dates (Practical APIs)

-   RegExp Basics: Syntax, flags (i, g), character classes, quantifiers, groups.

-   Methods: test(), exec(), String.match(), String.replace().

-   Dates Usage: Date object, formatting, parsing, common libraries (date-fns, Day.js).

8\. Meta-Programming & Advanced Patterns

-   Proxy and Reflect objects (intercepting object operations).

-   ES6 Modules (import/export).

-   Error handling patterns and custom errors.

**Task:** Create a simple inventory management system for a bookstore using constructor functions to define Book objects with properties for title, author, and publication date. Implement a closure-based unique ID generator that assigns an ID to each new book, and use prototypal inheritance to add a method that formats and logs the book\'s details using this. Finally, write a function that accepts a search query as a regular expression to filter the inventory array, and use a getter to return the current age of the book based on its publication date.

**JS Mid**

1. Prototypes vs Classical OOP

-   JavaScript\'s prototypal inheritance vs classical inheritance

-   Constructor functions vs ES6 classes (syntactic sugar)

-   Multiple inheritance patterns in JavaScript

-   When to use prototypes directly vs classes

2. Symbol - Unique and Hidden Properties

-   Creating and using Symbols (Symbol(), Symbol.for())

-   Well-known Symbols (Symbol.iterator, Symbol.toStringTag)

-   Using Symbols for metadata and private-like properties

-   Symbol registry and global Symbols

3. Iterables, Iterators & Generators

-   Iterable protocol: \[Symbol.iterator\]() method

-   Iterator protocol: next(), {value, done} pattern

-   Generators: function\*, yield, yield\*

-   Creating custom iterable objects

-   Async iterators and generators

4. Function Mastery: Beyond Basics

-   Currying: Partial application vs currying implementations

-   The new Function() constructor: use cases and security implications

-   Function composition patterns

-   Higher-order functions and function factories

5. BigInt & Number Precision

-   Creating BigInts: 123n, BigInt(123)

-   Operations with BigInt (can\'t mix with Number)

-   Use cases: cryptography, financial calculations

-   Performance considerations

6. ES5 vs ES6+ Evolution

-   Major paradigm shifts: var → let/const, functions → arrows

-   Syntactic sugar: classes, template literals, destructuring

-   New APIs: Promise, Proxy, Reflect, modules

-   Backwards compatibility and transpilation

7. Decorators & Mixins

-   Decorators (stage 3 proposal): \@decorator syntax

-   Implementing decorators for classes, methods, properties

-   Mixins: Object composition vs inheritance

-   Trait pattern in JavaScript

8. Advanced Object Patterns

-   Factory functions vs constructors

-   Flyweight pattern with objects

-   Immutable object patterns

-   Property validation with descriptors

9. Meta-Programming Deep Dive

-   Proxy traps: get, set, has, apply

-   Reflect API mirroring Proxy

-   Runtime introspection and modification

-   Use cases: validation, logging, virtualization

10. Performance & Memory Patterns

-   Generator memory efficiency for large datasets

-   Symbol memory implications

-   BigInt performance considerations

-   Iterator/generator lazy evaluation benefits

**Task:** Develop a custom iterable class named BigIntSequence that utilizes a mixin to provide logging capabilities and stores its internal state using a unique Symbol. Implement a generator function that traverses this sequence, applying a curried filter function to yield specific BigInt values based on custom logic. Enhance one of the class methods with a decorator pattern to measure execution performance or validate inputs. Finally, manually extend the prototype of your class to add a helper method, comparing this approach to standard ES6 class inheritance to illustrate the differences between Prototypes and OOP.

**Garbage collection Jun**

1. Memory Management Fundamentals

-   Memory lifecycle: Allocation → Usage → Release

-   Stack vs Heap memory in JavaScript

-   Reference counting and its limitations (circular references)

-   Memory leaks: common causes and patterns

2. Mark-and-Sweep Algorithm (Core GC)

-   How reachability is determined (roots, references)

-   Marking phase: traversing object graph from roots

-   Sweeping phase: reclaiming unreachable memory

-   Generational hypothesis in JavaScript engines

3. Generational Garbage Collection

-   Young Generation (Nursery) vs Old Generation

-   Scavenge collection (minor GC) for young objects

-   Mark-compact algorithm for old generation

-   Object promotion between generations

4. WeakMap & WeakSet - GC-Aware Collections

-   WeakMap: weak references to keys only (objects as keys)

-   WeakSet: weak references to values (objects only)

-   Use cases: private data, caching, DOM element metadata

-   Differences from Map/Set: no iteration, no size property

**Task:** Create a script that simulates a simple cache system for storing temporary object metadata using a WeakMap, ensuring that keys are automatically garbage collected when they are no longer referenced elsewhere in the application. Define a WeakSet to track \"visited\" objects in a simulated traversal algorithm, observing how these structures behave differently from standard Maps and Sets when the original object references are set to null. Finally, write a brief comment block in your code explaining how the \"mark-and-sweep\" algorithm would likely handle the memory reclamation for the objects stored in your structures compared to strong references.

**Garbage collection Mid**

1. WeakRef & FinalizationRegistry (Advanced)

-   WeakRef: creating weak references to any object

-   FinalizationRegistry: cleanup callbacks when objects are GC\'d

-   Use cases with caution: resource management, monitoring

-   The \"zombie object\" problem and best practices

2. Orinoco: V8\'s Garbage Collector

-   Parallel, incremental, and concurrent collection

-   Idle-time garbage collection

-   Memory pressure and heap growing strategies

-   V8\'s memory schemas: New Space, Old Space, Large Object Space

3. Practical Memory Leak Patterns

-   Accidental global variables

-   Forgotten timers and callbacks

-   DOM references in closures

-   Detached DOM trees

-   Closures holding large objects

4. Memory Profiling & Optimization

-   Chrome DevTools Memory tab: Heap Snapshots

-   Allocation timeline and allocation instrumentation

-   Detecting memory leaks in production

-   Best practices for memory-efficient code

5. Circular References & GC

-   Why circular references aren\'t always collected

-   DOM-to-JavaScript circular reference patterns

-   Breaking circular references explicitly

-   Event listener management

6. Engine-Specific GC Behaviors

-   V8 (Chrome, Node.js) vs SpiderMonkey (Firefox) vs JavaScriptCore (Safari)

-   Differences in GC strategies and heuristics

-   Node.js memory management (\--max-old-space-size)

-   Server-side vs client-side GC considerations

**Task:** Develop a Node.js script that intentionally creates a memory leak by retaining references to large objects within a closure or global variable, simulating a common production issue. Use Chrome DevTools or Node\'s inspector to capture heap snapshots, analyzing the difference between snapshots to pinpoint the specific objects that are not being collected. Finally, refactor the code to fix the leak and document how the Generational Garbage Collection (Young vs. Old generation) handles the allocation and cleanup of these specific objects during the process.

**Asynchronous programming Jun**

1. Fundamentals of Asynchrony

-   Synchronous vs asynchronous code execution

-   Blocking vs non-blocking operations

-   Single-threaded nature of JavaScript

-   Call Stack and execution context

2. Event Loop: Core Mechanism

-   Core components: Call Stack, Web APIs, Callback Queue, Microtask Queue

-   Event Loop phases in browser and Node.js

-   Macrotasks vs Microtasks execution order

-   Browser Event Loop vs Node.js Event Loop differences

3. Callback Patterns & Callback Hell

-   Callback functions: basics and usage

-   \"Callback Hell\" (Pyramid of Doom) problem

-   Error-first callback pattern (Node.js convention)

-   Flow control with callbacks

4. Promises: The Modern Standard

-   Creating promises: new Promise()

-   Promise states: pending, fulfilled, rejected

-   Chaining promises: .then(), .catch(), .finally()

-   Promise combinators: Promise.all(), Promise.race(), Promise.allSettled(), Promise.any()

-   Error handling in promise chains

5. Async/Await: Syntactic Sugar

-   async functions and await keyword

-   Converting promise-based code to async/await

-   Error handling with try/catch blocks

-   Parallel execution with Promise.all() in async functions

-   Sequential vs parallel execution patterns

6. Timers: setTimeout & setInterval

-   setTimeout(): delayed execution

-   setInterval(): periodic execution

-   Clearing timers: clearTimeout(), clearInterval()

-   Timer accuracy and minimum delays

-   Browser throttling and limitations

7. Asynchronous Iterators & Generators

-   Async generators: async function\*

-   for await\...of loop

-   Creating custom async iterators

-   Practical applications: data streaming, pagination

8. Reactive Programming Fundamentals

-   Core concepts: Observables, Observers, Subscriptions

-   RxJS library: key operators (map, filter, merge, switchMap)

-   Pub/Sub and Observer patterns

-   Reactivity in modern frameworks (Vue 3, Solid.js)

-   Comparison with Promise-based approach

9. Asynchronous Programming Patterns

-   Throttling & Debouncing: rate-limiting execution

-   Task queues and job scheduling

-   Concurrency limiting: controlling parallel execution

-   Retry patterns with exponential backoff

-   Cancellation patterns: AbortController, token-based cancellation

10. Practical Applications & Optimization

-   Working with async APIs (Fetch, File API, IndexedDB)

-   Resource loading strategies

-   Performance optimization techniques

-   Debugging asynchronous code

-   Memory leak prevention in async code

**Task:** Build a data fetching tool that requests updates from a mock API every few seconds using setInterval and handles the responses using async/await. Create a separate data processing function that uses callbacks, then rewrite it to use Promises to demonstrate the difference in error handling and flow. Set up a simple reactive system where the user interface updates itself automatically as soon as new information arrives, rather than waiting for a manual refresh. Finally, write a brief explanation describing how the Event Loop prioritizes the timer events compared to the code running inside your promises.

**Asynchronous programming Mid**

**Concurrency vs Parallelism in JavaScript**

-   Single-threaded concurrency: How JavaScript achieves it

-   \"Fake multithreading\": Web Workers for true parallelism

-   Event-driven architecture for concurrent operations

-   Cooperative multitasking vs preemptive multitasking

2. AsyncQueue & Task Scheduling Patterns

-   Implementing asynchronous queue systems

-   Task prioritization algorithms

-   Rate limiting and throttling patterns

-   Cargo/batching patterns: processing in batches

-   Priority queues with heap data structures

3. Event Emitter Pattern Deep Dive

-   Observer pattern implementation

-   Event-driven architecture fundamentals

-   Creating custom EventEmitter class

-   Memory management with event listeners

-   Error handling in event-driven systems

4. Chain of Responsibility in Async Flows

-   Middleware pattern (Express.js, Redux)

-   Pipeline processing of asynchronous operations

-   Error propagation through chains

-   Creating composable async operations

-   Use cases: validation chains, processing pipelines

5. Race Conditions & Concurrency Control

-   Identifying race conditions in async code

-   Mutexes and locks in JavaScript

-   Atomic operations with Atomics API

-   SharedArrayBuffer and Web Workers

-   Database transaction patterns

6. Async/Await Under the Hood

-   How async functions are transformed

-   Generator functions + Promise combination

-   The async keyword as syntactic sugar for generators

-   Babel/TypeScript transpilation of async/await

-   Performance implications

7. Priority Queues & Cargo Patterns

-   Implementing priority-based async queues

-   Cargo pattern: batching async operations

-   Dynamic priority adjustment

-   Use cases: image loading, API rate limiting

-   Libraries: async module, p-queue

8. Advanced Error Handling Patterns

-   Error propagation in complex async flows

-   Circuit breaker pattern

-   Retry with exponential backoff

-   Fallback strategies

-   Global async error handling

9. Async Iteration Patterns

-   Backpressure handling with async iterators

-   Streaming data processing

-   Pipeline pattern with async generators

-   Transforming async data streams

-   Use with ReadableStream

10. Performance Optimization

-   Micro-optimizations for async code

-   Memory usage patterns

-   Avoiding common async anti-patterns

-   Profiling async performance

-   V8 optimizations for async code

**Task:** Develop an asynchronous job runner that uses an Event Emitter to listen for incoming tasks and organizes them into a Priority Queue to ensure urgent items are processed first. Implement a Chain of Responsibility pattern to pass each job through a pipeline of steps, such as validation and execution, while simulating concurrency. Intentionally create a race condition where multiple concurrent jobs attempt to update a single shared counter, and then refactor the code to resolve the conflict using proper synchronization techniques. Finally, briefly document how the async/await keywords you utilized are transformed into Generators and Promises \"under the hood\" to manage this flow on a single thread.

**Parallel programming MID**

1.  **Web Workers: True Parallelism**

-   Dedicated vs. shared workers

-   Message Passing Mechanism

-   Data Transfer Optimization

-   Worker Environment Limitations

-   Performance patterns

2.  **Service workers : Network Proxies & Offline Support**

    -   Service Worker Lifecycle

    -   Caching Strategies

    -   Intercepting Requests

    -   Offline Capabilities

    -   Advanced Features

    -   Storage Management

**Task:** Create a responsive web application that performs a CPU-intensive task, such as calculating large prime numbers or sorting a massive dataset, by offloading the computation to a Web Worker to keep the interface smooth. Simultaneously, implement a Service Worker to intercept network requests and cache the application shell (HTML, CSS, JS), ensuring the app loads and functions even when the user is offline. Configure the Service Worker to communicate with the main thread to notify the user when new content is cached or ready for use. Finally, use browser DevTools to demonstrate the difference in lifecycle and scope between the two workers, showing how the Web Worker terminates with the tab while the Service Worker persists in the background.

TS

**Ts Jun**

1. TypeScript vs JavaScript: The Philosophy

-   Static vs Dynamic typing trade-offs

-   TypeScript as a superset: what stays, what changes

-   Compilation process: TS → JS

-   When to use TypeScript vs JavaScript

-   Migration strategies from JS to TS

2. Type System Fundamentals

-   Type inference: Implicit vs explicit typing

-   Basic types: string, number, boolean, array, tuple, enum

-   Special types: any, unknown, never, void

-   Union and intersection types: \| and & operators

-   Type guards and narrowing: typeof, instanceof, custom type guards

3. Advanced Types & Type Manipulation

-   Generics: Functions, interfaces, classes

-   Conditional types: T extends U ? X : Y

-   Mapped types: { \[K in keyof T\]: \... }

-   Utility types: Partial, Required, Pick, Omit, Record

-   Template literal types: \${T}\${U}

4. Object-Oriented TypeScript

-   Classes: Properties, methods, constructors

-   Interfaces for classes: Implementation contracts

-   Abstract classes: Cannot be instantiated, can have implementation

-   Access modifiers: public, private, protected, readonly

-   Static members and abstract methods

5. Interfaces vs Type Aliases

-   Interfaces: Declaration merging, extends, implements

-   Type aliases: Unions, intersections, computed properties

-   When to use which: Structural vs nominal typing

-   Declaration merging: Multiple interface declarations

-   Index signatures: \[key: string\]: value

6. Compiler & Tooling (TSC)

-   tsconfig.json: Comprehensive configuration

-   Compiler options: strict, noEmit, target, module

-   Declaration files (.d.ts): Creating and using type definitions

-   Source maps: Debugging TypeScript code

-   Incremental compilation: Speeding up builds

7. Type Assertions & Casting

-   Angle-bracket syntax: \<Type\>value

-   As syntax: value as Type

-   Const assertions: as const

-   Non-null assertion: value!

-   Type assertions vs type declarations

8. Modules & Namespaces

-   ES modules: import/export

-   CommonJS interoperability

-   Namespace pattern: Organizing code

-   Module resolution strategies

-   Barrel exports: index.ts files

9. Decorators & Metadata

-   Decorator types: Class, method, property, parameter

-   Decorator factories: Customizing decorators

-   Reflect Metadata API

-   Popular decorator patterns (\@Component, \@Injectable)

-   Experimental decorators vs TC39 proposal

10. Advanced Patterns & Best Practices

-   Mixins: Multiple inheritance pattern

-   Declaration files for libraries: DefinitelyTyped

-   Generic constraints: extends with generics

-   Type inference with generics

-   Performance considerations with complex types

**Task:** Build a mini RPG system by creating an abstract class Character that implements an IAction interface and uses an Enum to define roles like Warrior or Mage. Implement a generic Inventory\<T\> class to store specific item types, and use Union types to define character status (e.g., \'Alive\' \| \'Dead\') along with Intersection types to combine abilities. Write a function using unknown to validate raw input data, returning void on success or never on critical failure, and apply type casting to handle specific character interactions. Finally, compile the project using the tsc compiler and include a manually written .d.ts file to describe a global game configuration object with indexable types.

**Ts Mid**

1. Type Assertions vs Type Casting

-   Type assertions: Developer tells TS about type (as, \<Type\>)

-   Type casting: Runtime transformation (actual conversion)

-   as const assertions for literal types

-   Non-null assertion operator: !

-   Double assertion: value as unknown as Type

-   When to use assertions vs proper type declarations

2. Generics In Depth: Advanced Patterns

-   Generic constraints: extends keyword

-   Default type parameters: T = Default

-   Generic type inference: How TS infers generic types

-   Generic classes with static members

-   Generic utility types: ReturnType\<T\>, Parameters\<T\>, ConstructorParameters\<T\>

-   Generic conditional types: Recursive patterns

-   Mapped types with generics: Advanced transformations

3. Type Widening & Narrowing

-   Type widening: From specific to general

-   Literal type widening: let vs const assignments

-   Contextual typing: Function arguments, callbacks

-   Type narrowing techniques:

    -   typeof and instanceof

    -   Truthiness narrowing

    -   Equality narrowing

    -   in operator narrowing

    -   Discriminated unions

    -   User-defined type guards

-   readonly and as const to prevent widening

4. Type Guards: Advanced Patterns

-   User-defined type guards: is keyword

-   Type predicates with parameters

-   Assertion functions: asserts condition

-   Control flow analysis with type guards

-   Type guard composition: Combining multiple guards

-   Generic type guards: Reusable guard functions

5. Advanced Type Manipulation

-   Mapped types: \[K in keyof T\]: T\[K\]

-   Template literal types: String manipulation at type level

-   Conditional types: T extends U ? X : Y

-   Infer keyword: Extract types from other types

-   Utility types deep dive: How they\'re implemented

-   Recursive types: Self-referential type definitions

6. Module System Deep Dive

-   Module resolution strategies: Classic vs Node

-   Path mapping and baseUrl

-   Barrel files optimization

-   Module augmentation: Adding to existing modules

-   Ambient modules: Declaring external modules

-   Wildcard module declarations

7. Namespaces vs Modules

-   Namespace declaration: namespace keyword

-   Multi-file namespaces: Reference tags

-   Namespace merging: Declaration merging

-   When to use namespaces (legacy code, declaration files)

-   Module vs namespace: Modern practices

-   Triple-slash directives: /// \<reference path=\"\...\" /\>

8. Hybrid Types & Overloads

-   Hybrid types: Objects that act as both functions and objects

-   Callable interfaces: interface Callable { (): void; }

-   Constructor interfaces: new (): Instance

-   Function overloads: Multiple call signatures

-   Method overloads in classes and interfaces

-   Overload implementation best practices

9. Compile-Time vs Runtime Behavior

-   Type erasure: What happens at runtime

-   Decorators runtime vs compile-time behavior

-   Enum runtime representation

-   Interface runtime non-existence

-   Generic runtime absence

-   Reflect Metadata API usage

-   Branded types for runtime checking

10. Advanced Class Features

-   Private constructors: Singleton pattern

-   Abstract properties and methods

-   Static blocks: static { \... }

-   Parameter properties: Shorthand constructor syntax

-   Decorator factory patterns for classes

-   Mixins with composition

**Task:** Design a type-safe \"Configuration Manager\" class that uses a private constructor to enforce a Singleton pattern and function overloads to retrieve specific config values. Implement Generics combined with Conditional Types and Template Literal Types to strongly type nested configuration keys (e.g., \"database.host\"), ensuring the return type is automatically inferred based on the key string. Create a custom Type Guard to validate external JSON input, performing type narrowing to distinguish between valid config objects and runtime errors. Finally, use Mapped Types to generate a utility that transforms the configuration interface into a readonly format, demonstrating how these constructs provide safety at compile time without adding overhead at runtime.

Backend

**Node Jun**

1\. Core Philosophy and Architecture

-   Advantages and disadvantages of Node.js

-   How Node.js works: single-threaded, non-blocking, event-driven model

-   V8 engine and libuv library roles

-   High-level Node.js architecture overview

2\. The Event Loop and Queues

-   Event Loop in Node.js: phases and execution order

-   Callstack, callback queue, micro/macro task queues

-   process.nextTick() and setImmediate()

-   Blocking vs non-blocking event loop

3\. Modules and Module System

-   CommonJS module system (require, module.exports)

-   The node\_modules folder and resolution algorithm

-   Core modules vs local modules vs npm packages

-   ES modules support in Node.js

4\. The File System (fs module)

-   Asynchronous vs synchronous filesystem operations

-   Reading, writing, and updating files

-   Working with directories and file stats

-   Streams for large file processing

5\. Streams Module

-   Types of streams: Readable, Writable, Duplex, Transform

-   Stream events and methods

-   Piping data between streams

-   Backpressure handling

6\. HTTP and Networking

-   HTTP module for creating servers and clients

-   Request and response objects

-   Building REST APIs

-   HTTPS and HTTP/2 support

7\. Events and Event-Based Approach

-   EventEmitter class and custom events

-   Event-driven architecture patterns

-   Error handling in event-based code

-   Best practices for event usage

8\. Child Processes and Worker Threads

-   Spawning child processes (exec, spawn, fork)

-   Inter-process communication

-   Worker Threads for CPU-intensive tasks

-   When to use which approach

**Task:** Create a basic HTTP server using the http module that accepts requests to process a large text file using Streams to ensure memory efficiency. Implement a custom EventEmitter to trigger events during the file read process (e.g., \'start\', \'data\', \'end\') and offload a CPU-intensive task, such as counting unique words, to a Worker Thread to demonstrate how to prevent blocking the main thread. Structure your application using local Modules, and intentionally place process.nextTick and setImmediate calls within your code to log and observe the execution order of the Event Loop, Call Stack, and Micro/Macro task queues. Finally, write a short summary explaining how libuv handles the asynchronous file I/O operations while V8 executes the JavaScript code.

**Node Mid**

1\. V8, Libuv, and Node.js Architecture

-   The roles of V8 (JavaScript execution) and libuv (async I/O, event loop)

-   Node.js architecture: interaction between V8, libuv, bindings, and the application

-   The Reactor Pattern: handling multiple operations in a single thread using event demultiplexing and request dispatching

-   Comparison to the traditional thread-per-connection approach (e.g., Apache)

2\. Implementation Principles and the Thread Pool

-   Low-level principles: event-driven architecture, non-blocking I/O with async system calls

-   The libuv thread pool: default size (4 threads) and configuration (UV\_THREADPOOL\_SIZE)

-   Thread pool limitations: blocking operations it handles (parts of fs, crypto, dns.lookup)

-   Historical async patterns: Fibers (deprecated), coroutines, and the callback-based foundation

3\. Multiprocessing and Multithreading

-   Worker Threads: parallel execution of CPU-intensive JavaScript, using SharedArrayBuffer for communication

-   Child Process: spawning external processes (spawn, fork, exec)

-   Cluster module: creating a network of Node.js processes to share a port and manage load

-   Inter-Process Communication (IPC): pipes, messaging, and shared memory

4\. Package Managers and Workspaces

-   npm/yarn/pnpm: differences in dependency resolution, performance, and disk usage

-   node\_modules structure: nested (npm v1/v2), flat/deduped (npm v3+, yarn), and content-addressable storage with symlinks (pnpm)

-   npm workspaces / yarn workspaces / pnpm workspaces: managing monorepositories and cross-package dependencies

-   Lockfiles: purpose and differences between package-lock.json, yarn.lock, and pnpm-lock.yaml

5\. Load Balancing and Optimization

-   Cluster load management: built-in Round Robin and strategies for stateful applications (e.g., sticky sessions)

-   Performance monitoring: Event Loop lag, memory leaks, and CPU profiling

-   Optimizing thread pool usage: identifying and managing blocking operations

-   Profiling and debugging: using tools like the Node.js Inspector, clinic.js, and async\_hooks

6\. Asynchronous Patterns in Node.js

-   EventEmitter and Observer pattern: the foundation of Node.js\'s event-driven model

-   Streams: processing data incrementally with Readable, Writable, Duplex, and Transform streams

-   Async Generators and Iterators: handling asynchronous data sequences

-   Modern async/await patterns and Promise-based concurrency control

**Task:** Construct a high-performance API within an npm workspaces monorepo that utilizes the Cluster module to fork processes based on available CPU cores, implementing a custom load management strategy. Offload CPU-intensive computations to Worker Threads and establish a robust Inter-Process Communication (IPC) channel to aggregate performance metrics back to the master process. Intentionally design a \"blocking\" endpoint that saturates the libuv thread pool with cryptographic operations, using this to analyze the limitations of Node\'s event-driven architecture compared to a traditional thread-per-connection model. Finally, document how the Pattern Reactor orchestrates these non-blocking I/O operations and briefly explain the low-level role of V8 versus libuv in your execution flow.

**Security Jun**

1\. Password Storage

-   Hashing vs Encryption

-   Algorithms: bcrypt, scrypt, argon2

-   Salting and pepper

-   Password policies and validation

2\. Environment Variables Management

-   .env files and dotenv package

-   Configuring different environments

-   Secret rotation strategies

-   Security of CI/CD pipelines

3\. JWT Implementation

-   JWT structure (header, payload, signature)

-   Access vs Refresh tokens

-   Token storage strategies (cookies vs localStorage)

-   Token expiration and revocation

4\. Cryptographic Fundamentals

-   Symmetric encryption (AES)

-   Asymmetric encryption (RSA, ECC)

-   Digital signatures

-   Key management and storage

5\. Common Security Vulnerabilities

-   SQL/NoSQL injection prevention

-   XSS (Cross-Site Scripting)

-   CSRF (Cross-Site Request Forgery)

-   Security headers (CSP, HSTS)

6\. Authentication Strategies

-   Session-based auth

-   OAuth 2.0 / OpenID Connect

-   Multi-factor authentication

-   Social login integration

7\. Authorization Patterns

-   Role-Based Access Control (RBAC)

-   Attribute-Based Access Control (ABAC)

-   Permission systems

-   Middleware for route protection

8\. API Security

-   Rate limiting and throttling

-   Input validation and sanitization

-   API keys and secrets management

-   Webhook security

9\. Security Tooling

-   Static code analysis

-   Dependency scanning (npm audit)

-   Penetration testing tools

-   Logging and monitoring for security

10\. Production Security

-   HTTPS and SSL/TLS configuration

-   Docker security best practices

-   Server hardening

-   Incident response planning

**Task:** Build a simple authentication API that accepts user credentials and securely stores the password using a hashing algorithm like bcrypt or Argon2. Configure the application to load sensitive configuration, such as secret keys, strictly from Environment Variables rather than hardcoding them. Implement a login route that issues a short-lived JWT Access Token and a long-lived Refresh Token, requiring the client to use the refresh token to renew their session when the access token expires. Finally, generate a public/private key pair to sign these tokens using Asymmetric Cryptography, and write a brief comment explaining the security benefits of this approach compared to using a single Symmetric secret key.

**Security Mid**

1\. Injection Attacks (SQL & NoSQL)

-   Parameterized queries vs. string concatenation

-   ORM security features (Prisma, Sequelize)

-   Input validation and sanitization libraries

-   MongoDB injection prevention (\$where, \$regex)

-   Database permission principles

2\. Dependency Security (Snyk, npm audit)

-   Understanding vulnerability databases (CVE)

-   npm audit workflow and fix strategies

-   Snyk CLI and CI/CD integration

-   Lockfile security implications

-   Dependency pinning strategies

3\. Network Layer Attacks

-   MITM attack mechanics and prevention

-   HTTPS/TLS implementation (Let\'s Encrypt)

-   Certificate pinning concepts

-   Secure WebSocket connections

-   HTTP security headers (HSTS, CSP)

4\. JSON Security

-   JSON hijacking historical context

-   Safe JSON parsing practices

-   Content-Type enforcement

-   JSON schema validation

-   JSONP security considerations

5\. Application Integrity Attacks

-   Website defacement prevention

-   File upload security

-   Directory traversal prevention

-   Server misconfiguration risks

-   WAF (Web Application Firewall) basics

6\. Social Engineering Attacks

-   Phishing techniques and detection

-   Pharming vs phishing differences

-   User security education strategies

-   Multi-factor authentication implementation

-   Password policy best practices

7\. Availability Attacks

-   DoS/DDoS attack types

-   Rate limiting implementation

-   Load balancing for DoS protection

-   CDN security features

-   Bot detection techniques

8\. Session Management Security

-   Secure cookie attributes (HttpOnly, Secure, SameSite)

-   Session storage strategies

-   Token vs cookie-based sessions

-   Session fixation prevention

-   Concurrent session control

9\. CORS & Cross-Origin Security

-   CORS header configuration

-   Preflight request handling

-   Credentialed requests security

-   CSRF protection implementation

-   OAuth CORS considerations

10\. Comprehensive Security Audit

-   Security headers configuration

-   Security.txt standard implementation

-   Logging and monitoring for attacks

-   Incident response planning

-   Regular security assessment schedule

**Task:** Create a vulnerable API endpoint susceptible to SQL Injection, then refactor the code to use parameterized queries to close the security hole. Configure strict CORS policies to prevent unauthorized domains from accessing your resources and implement rate limiting to protect against DoS attacks targeting your session management. Run a security scan using npm audit or Snyk to identify and patch dependencies with known vulnerabilities. Finally, briefly explain how using HTTPS and secure cookies mitigates Man-in-the-Middle attacks and prevents JSON Hijacking.

**Tests**

1.  Testing Fundamentals & The Testing Pyramid

    -   Purpose and value of automated tests

    -   The Testing Pyramid (Unit, Integration, E2E) and its rationale

2.  Unit Testing Mastery

    -   Writing testable code and isolating dependencies

    -   Using Mocks, Stubs and Spies (theory and practice)

3.  JavaScript/Node.js Testing Tools (Basic Proficiency)

    -   Jest framework (test runner, assertions, built-in mocking)

    -   Basic test structure and organization

4.  Integration Testing (Basics)

    -   Concept of testing component interactions

    -   Setting up and tearing down test data (fixtures)

```{=html}
<!-- -->
```
5.  Integration Testing (Advanced)

    -   Testing with real databases and external APIs

    -   Contract testing and service virtualization concepts

6.  End-to-End (E2E) Testing

    -   Core concepts and trade-offs (speed, reliability, cost)

    -   Proficiency with one E2E tool (Cypress OR Playwright)

7.  Test-Driven Development (TDD)

    -   Red-Green-Refactor cycle in practice

    -   Applying TDD to implement features and fix bugs

8.  Testing Special Code Patterns

    -   Testing asynchronous logic (Promises, async/await)

    -   Testing React components (component testing)

    -   Snapshot testing for UI/output consistency

```{=html}
<!-- -->
```
9.  Testing Strategy & Architecture

    -   Designing a balanced test suite for a project

    -   Measuring and interpreting code coverage metrics

    -   Continuous Integration (CI) pipeline for testing

10. Advanced Topics & Performance

    -   Behavior-Driven Development (BDD) with Cucumber

    -   Introduction to performance and load testing (e.g., k6)

    -   Advanced mocking techniques and patterns

**Task:** Develop a small \"Shopping Cart\" module and write Unit tests for individual calculation functions using a tool like Jest to ensure math accuracy. Implement Integration tests to verify that the cart correctly updates the total price and inventory count when items are added or removed. Create a basic HTML interface and use a tool like Cypress or Playwright to write a simple E2E test that simulates a user clicking \"Buy\" and checking the final receipt on the screen. Finally, organize your test suite to reflect the Testing Pyramid principle by ensuring you have a large number of unit tests, fewer integration tests, and only one or two E2E scenarios.

**Tests MID**
\
1. TDD Pros and Cons**

-   Analyzing the trade-offs: faster debugging vs slower initial writing time

-   Impact on code quality, modularity, and self-documentation

-   Scenarios where TDD is beneficial vs where it is unnecessary overhead

2.  **TDD Main Ideas**

-   The Red-Green-Refactor cycle: detailed steps and philosophy

-   Writing the minimum amount of code required to pass the test

-   The role of refactoring in maintaining clean code without breaking functionality

3.  **TDD Anti-Patterns**

-   Interdependent tests: why tests must not rely on each other or execution order

-   Testing implementation details instead of behavior (The Inspector)

-   Managing heavy external dependencies that cause performance issues

4.  **Test Fixtures Concept**

-   Setup and Teardown: preparing the environment before and after tests

-   Strategies for database cleaning and state isolation

-   Using data factories versus hard-coded static data

5.  **Mocks, Stubs, Spies, Fakes, Test Containers**

-   Differences between Test Doubles: Mocks vs Stubs vs Spies

-   Using Fakes for in-memory replacements of complex systems

-   Using Testcontainers (Docker) for realistic integration testing environments

6.  **Coverage**

-   Understanding coverage metrics: Line, Branch, and Function coverage

-   The pitfall of chasing 100% coverage without meaningful assertions

-   How to generate and interpret coverage reports

7.  **Tests in CI/CD**

-   Automating test execution in pipelines (e.g., GitHub Actions, Jenkins)

-   Strategies for failing the build immediately upon test error

-   Separating fast unit tests from slow integration tests in the workflow

**Task:** Create a simple calculator module that supports addition, subtraction, multiplication, and division of two numbers. You must strict adhere to the \"Red-Green-Refactor\" cycle by writing a test that fails before you write the logic to solve it. Once the logic is working, refactor your code to be cleaner while ensuring the tests still pass. Finally, run a coverage report to verify that all your calculation functions are fully tested.

**Express and Nest Jun**

**Express**

1\. Middleware System

-   Core Pattern: Study the Request-Response Cycle and the role of middleware as a chain of functions with access to req, res, next.

-   Types & Execution Order: Understand application-level (app.use), router-level, error-handling ((err, req, res, next)), and built-in middleware (e.g., express.json()).

-   Real-World Middleware: Analyze the source or purpose of common packages (helmet, cors, morgan, compression).

2\. Routing & Application Structure

-   Router Object: Deep dive into creating modular routes with express.Router().

-   Route Parameters & Validation: Explore req.params, req.query, and how to validate them (e.g., with express-validator).

-   Project Structure: Research common patterns for scaling an Express API (MVC, layered architecture, feature-based organization).

3\. Advanced req & res Objects

-   Extending Objects: How and why to add custom properties/methods to req (e.g., req.user) or res.

-   Request/Response Flow: Trace the journey of a request from receipt to final response, noting what middleware can modify at each stage.

4\. Server-Side Rendering (SSR)

-   Template Engines: Experiment with pug, ejs, or handlebars to render HTML on the server.

-   Data Hydration: Understand the pattern of passing server-side data into the initial HTML page for seamless client-side hydration.

5\. Error Handling & Input Security

-   Centralized Error Handling: Implement a final error-handling middleware that catches all synchronous and asynchronous errors.

-   Validation vs. Sanitization: Distinguish between checking input validity (express-validator) and cleaning malicious data from input (e.g., with dompurify for HTML).

-   Session Management: Explore session storage strategies (in-memory, express-session with stores like Redis) and secure cookie configuration.

**Task:** Create a basic web server using Express.js that implements modular routing to handle user profiles, using app.use to mount the routes. Write custom middleware to log the method and URL of every incoming request, and inspect the properties of the Req and Res objects to send a specific status code based on the user agent. Implement a server-side rendered (SSR) view using a template engine like EJS to display a form, applying validation and sanitization to the inputs before storing the data in a temporary session. Finally, add a global error handling middleware function at the end of the stack to catch and gracefully display any server errors that occur during processing.

**NestJS**

1\. Architectural Philosophy & Dependency Injection (DI)

-   Express vs. Nest: Contrast Nest\'s opinionated, modular architecture built with TypeScript and DI to Express\'s minimalist, unopinionated approach.

-   DI Container: Research how Nest\'s IoC (Inversion of Control) container manages the lifecycle and dependencies of providers.

-   Module System: Analyze how the \@Module() decorator defines the application\'s structure and encapsulation boundaries.

2\. Core Building Blocks (Guards, Pipes, Interceptors, Exception Filters)

-   Request Lifecycle: Map the exact order in which these components execute and their specific responsibilities.

-   Guards: Explore implementing role-based access control (RBAC) or other authentication/authorization logic.

-   Pipes: Study transformation (e.g., ParseIntPipe) and validation (e.g., with class-validator) use cases.

-   Interceptors: Analyze their power for wrapping request/response flow (logging, transforming responses, caching).

-   Exception Filters: Learn how to create custom filters for consistent application error responses and HTTP status codes.

3\. Advanced Patterns & Tooling

-   Decorators & Metadata: Deep dive into how Nest uses custom decorators (like \@Get(), \@Body()) and the Reflect Metadata API to power its functionality.

-   Circular Dependencies: Understand why they occur and the patterns to resolve them (forward referencing, module refactoring, Inject with forwardRef).

-   Logging Strategy: Compare different approaches (built-in logger, structured logging with winston or pino).

-   API Documentation: Implement OpenAPI/Swagger auto-generation with the \@nestjs/swagger package and decorators.

**Task:** Build a RESTful \"Task Manager\" API using NestJS that leverages Dependency Injection to connect your Services and Controllers, and document all endpoints automatically using Swagger/OpenAPI. Implement a custom Guard to restrict access, a Pipe to validate incoming DTOs, and an Interceptor that utilizes the built-in Logger to track request duration. Intentionally introduce a Circular Dependency between two modules and resolve it using forwardRef to understand module linkage. Finally, replace standard error responses with a global Exception Filter to standardize output, observing how these Decorators and architectural patterns differ from a raw Express JS setup.

**NestJs mid**

#### 1. Architectural Design Patterns

-   Dependency Injection (DI) / Inversion of Control (IoC): The foundational pattern of Nest. Explore how the DI container manages singleton/scoped/transient providers.

-   Modular Architecture: Deep dive into how \@Module() decorator enables separation of concerns, encapsulation, and reusability (Shared Modules, Dynamic Modules).

-   Decorator Pattern: How Nest uses decorators (\@Controller(), \@Injectable(), \@Get()) extensively to attach metadata and define behavior.

-   Facade / Adapter Pattern: Investigate how Nest\'s abstractions (like HttpModule with Axios) provide a clean, consistent interface over underlying libraries.

#### 2. Application & Component Lifecycle

-   Application Lifecycle Hooks (onModuleInit, onApplicationBootstrap, onModuleDestroy, onApplicationShutdown): When they fire, use cases for initialization (DB connections) and cleanup.

-   Provider/Service Lifecycle Scopes: Singleton (default), Request-scoped, and Transient. How scope affects performance and state management.

-   Request-Scoped Lifecycle: The lifespan of a provider created per HTTP request and its relation to the REQUEST provider token.

#### 3. Advanced Module & Dependency System

-   Dynamic Modules: Pattern for creating configurable modules that accept parameters (e.g., forRoot({\...}), forFeature(\...)). Key to building reusable libraries (like \@nestjs/typeorm).

-   Custom DI Tokens & Providers: Beyond class tokens. Use of string/symbol tokens (\'CONNECTION\'), factory providers (useFactory), value providers (useValue), and aliasing existing providers (useExisting).

-   Module Coupling & Circular Dependencies: Types of coupling (tight/loose). Strategies to resolve circular dependencies: code refactoring, forward reference (forwardRef()), and the module/provider split.

#### 4. Request Lifecycle & Execution Context

-   Detailed Request Lifecycle Sequence: Map the exact order: Middleware → Guards → Interceptors (pre) → Pipes → Controller → Service → Interceptors (post) → Exception Filters.

-   Reflector & Metadata: The Reflector service as the tool to retrieve custom metadata attached via decorators (e.g., \@SetMetadata(\'roles\', \[\'admin\'\])). Critical for dynamic Guard/Interceptor logic.

-   ExecutionContext vs. ArgumentsHost: Understand the difference. ExecutionContext (extends ArgumentsHost) provides more details (handler class, method) and is used in Guards/Interceptors. ArgumentsHost is generic across HTTP, GraphQL, WebSockets.

#### 5. Security & Advanced Features

-   Helmet Integration: How HelmetMiddleware sets crucial security HTTP headers (XSS-Filter, noSniff, etc.) and best practices for its configuration in Nest.

-   Custom Decorators: Creating parameter (\@User()) and method/class decorators for cleaner, more expressive code.

-   Global Prefix & Versioning: Strategies for API versioning (URI, header, media type) using built-in features.

-   Hybrid Applications: Running Nest on different transports simultaneously (HTTP + WebSockets/Microservices).

**Task:** Develop a reusable \"SecurityModule\" as a Dynamic Module that uses a Custom DI token to inject configuration and implements the onModuleInit lifecycle hook to validate settings on startup. Secure the global application scope using Helmet, and create a custom Guard that utilizes the Reflector to access metadata from the Execution Context, allowing you to control access to specific routes based on custom decorators. Add console logs across your middleware, guards, and interceptors to map the precise Request Lifecycle, visually confirming the execution order of each component. Finally, ensure the module remains loosely coupled by designing it to be easily portable to another project without code changes, demonstrating standard NestJS architectural patterns.

React

**React JUN**


1.  **JSX**

-   Understanding syntax: mixing HTML-like structure with JavaScript logic

-   Embedding JavaScript expressions and logic within curly braces

-   Differences from HTML: camelCase attributes (e.g., className, htmlFor)

-   **How Babel transpiles JSX into React.createElement calls**

2.  **Functional vs Class Components**

-   Syntax comparison: functions vs ES6 classes extending React.Component

-   State management: useState hook vs this.state and this.setState

-   Lifecycle handling: useEffect vs lifecycle methods (componentDidMount)

-   The shift in the React ecosystem towards functional components

3.  **Lifecycle**

-   **The three main phases: Mounting, Updating, and Unmounting**

    -   Managing side effects (API calls, subscriptions) using useEffect

    -   The dependency array: controlling when effects run

    -   Cleanup functions to prevent memory leaks (replacing componentWillUnmount)

4.  **Props**

-   Passing data from parent components to child components

-   Immutability: understanding that props are read-only

-   Prop Types: validating data types for better reliability

-   The concept of \"children\" props for wrapper components

5.  **Basic Hooks**

-   useState: initializing and updating local component state

-   useEffect: handling side effects and synchronization

-   useRef: accessing DOM elements directly without re-renders

-   The \"Rules of Hooks\": top-level calls and call order

6.  **Router**

-   Single Page Application (SPA) fundamentals: navigation without page reloads

-   Setting up routes and linking between different views

-   Accessing URL parameters and query strings

-   Handling 404s and redirecting users

7.  **MobX / Redux / Flux / Context**

-   The \"Prop Drilling\" problem and why global state is needed

-   Context API: native React solution for sharing state across the tree

-   Redux core concepts: Store, Actions, Reducers, and unidirectional flow

-   Flux architecture: the pattern behind modern state management libraries

8.  **Styling (Styled Components, SCSS/SASS)**

-   CSS-in-JS: scoping styles to specific components (Styled Components)

-   CSS Modules: preventing class name collisions

-   SASS/SCSS features: nesting, variables, and mixins

-   Conditional styling based on component props or state

9.  **Webpack**

-   The role of a bundler: combining assets into deployable files

-   Loaders: teaching Webpack how to handle non-JS files (CSS, images)

-   Configuring the dev server and Hot Module Replacement (HMR)

-   Code splitting for performance optimization

10. **Vite**

-   Differences from Webpack: native ES Modules and on-demand compilation

-   Project scaffolding and faster development server startup

-   Configuration simplicity compared to traditional bundlers

-   Building for production using Rollup under the hood

11. **Forms**

-   Controlled components: driving input values via React state

-   Uncontrolled components: using refs to access values

-   Handling form submission and preventing default browser behavior

-   Basic validation strategies and error state management

**Task:** Create a simple \"To-Do List\" application where users can type a task into an input field and add it to a displayed list. You must use functional components to structure your application and useState to keep track of the current tasks. Ensure that each task can be deleted by clicking a button next to it. Finally, use basic CSS or Styled Components to make the list look neat and ensure the input field automatically clears after adding a new item.

**React MID**
\
1. Treeshaking**

-   The process of removing \"dead\" (unused) code from the final bundle

-   How ES Modules (import/export) enable bundlers to detect unused exports

-   The role of side effects in preventing code elimination

-   Why tree shaking is critical for keeping bundle sizes small

2.  **SSR / PWA / SPA / SSG**

-   SSR (Server-Side Rendering): Generating HTML on the server for better SEO and initial load

-   SPA (Single Page App): Loading a single HTML file and updating content dynamically

-   SSG (Static Site Generation): Pre-building pages at compile time for maximum speed

-   PWA (Progressive Web App): Making web apps installable and offline-capable

3.  **RTK (Redux Toolkit)**

-   Why RTK is the standard, simplified way to write Redux logic

-   Using createSlice to combine actions and reducers in one place

-   Writing \"mutating\" logic safely using the built-in Immer library

-   Managing async API calls with createAsyncThunk or RTK Query

4.  **Testing**

-   Unit Testing vs Integration Testing: what to test and when

-   Jest: The test runner and assertion library

-   React Testing Library: Testing components from the user\'s perspective (clicks, text)

-   Mocking external API calls and dependencies

5.  **Next.js vs React**

-   Library (React) vs Framework (Next.js) distinction

-   File-based routing (Next.js) vs component-based routing (React Router)

-   Built-in performance features: Image optimization and font loading

-   API Routes: writing backend code directly within the frontend project

6.  **Rollup**

-   Differences between bundling apps (Webpack/Vite) and libraries (Rollup)

-   Outputting clean \"flat\" bundles using ES modules

-   Why Rollup is often preferred for publishing packages to npm

-   Configuration simplicity compared to older Webpack setups

7.  **Multithreading in Browser**

-   Understanding JavaScript\'s single-threaded event loop

-   Web Workers: Running heavy computations in a background thread

-   Communication between the main thread and workers via postMessage

-   Limitations: No DOM access inside a worker

8.  **Performance Optimization**

-   Code Splitting: loading only the JavaScript needed for the current page

-   Memoization: using useMemo and useCallback to prevent expensive recalculations

-   Virtualization: rendering only visible items in large lists (e.g., react-window)

-   Reducing unnecessary re-renders with React.memo

9.  **Localization (i18n)**

-   Managing translation files (JSON key-value pairs)

-   Using libraries like react-i18next or react-intl

-   Handling dynamic content (plurals, dates, currency)

-   Supporting Right-to-Left (RTL) languages like Arabic or Hebrew

10. **React vs Other Frameworks**

-   Vue: Templates vs JSX, and mutable vs immutable state patterns

-   Angular: Full-blown opinionated framework vs React\'s unopinionated library approach

-   Svelte: Compiler-based approach (no Virtual DOM) vs React\'s runtime Virtual DOM

-   Ecosystem maturity and job market availability

11. **Advanced Hooks**

-   useReducer: managing complex state logic (Redux-lite pattern)

-   useLayoutEffect: running effects synchronously before the browser paints

-   useImperativeHandle: exposing child component functions to parents

-   useContext: preventing prop-drilling in deeply nested component trees

**Task:** Create a small Next.js application that fetches a list of users from an API and displays them on the page. Implement Server-Side Rendering (SSR) so that the data is fully loaded before the page reaches the browser, improving SEO. Use Redux Toolkit (RTK) to manage a global \"theme\" state (light/dark mode) that persists across different pages. Finally, add a language toggle button to switch the interface text between two languages (Localization) and write a simple test to verify that your user list renders correctly.

Databases

**Sql vs Nosql Jun**

-   What kinds of NoSQL databases exist (document, key-value, column-family, graph)? What are their pros, cons, and typical use cases?

-   How does transaction management differ between SQL and NoSQL databases? What are the implications for data consistency and reliability?

-   How do data modeling and schema design differ between SQL (relational) and NoSQL (non-relational) databases?

-   What are the main differences in query languages and data access patterns between SQL and NoSQL databases?

-   How do SQL and NoSQL databases handle scalability and performance, especially for large-scale or distributed systems?

-   What are the trade-offs between ACID (Atomicity, Consistency, Isolation, Durability) and BASE (Basically Available, Soft state, Eventual consistency) properties in SQL vs NoSQL?

-   In what scenarios is it better to use SQL databases, and when is NoSQL a better fit?

-   How do SQL and NoSQL databases differ in terms of flexibility and ease of making schema changes?

-   What are the security considerations and challenges unique to SQL and NoSQL databases?

-   How does the CAP theorem influence the design and behavior of SQL and NoSQL databases?

-   What are some real-world case studies or examples where organizations migrated from SQL to NoSQL, or vice versa?

-   What are the cost implications (infrastructure, licensing, maintenance) of using SQL vs NoSQL databases?

-   How do cloud-native solutions (like AWS RDS, DynamoDB, Google Cloud Spanner, etc.) compare for SQL and NoSQL databases?

-   What is polyglot persistence, and when should you consider using both SQL and NoSQL databases in the same application?

**Task:** Design a simple \"User Profile and Orders\" system, first by creating a relational schema with connected tables in an SQL database (like PostgreSQL) to enforce strict data integrity. Rebuild the same system in a NoSQL database (like MongoDB) by nesting order data directly within user documents to experience schema-less flexibility. Write a script to insert and query data in both systems, observing how SQL joins differ from NoSQL document retrieval. Finally, add a brief comment explaining which database you would choose if your data structure needed to change rapidly versus if you required strict transaction safety.

**SQL Jun**

-   What is Data Manipulation Language (DML) in SQL? What operations does it include, and how are they used in practice?

-   What is Data Definition Language (DDL) in SQL? How does it differ from DML, and what are its primary commands?

-   What are cursors in SQL? When should you use them, and what are their advantages and disadvantages?

-   What are views and materialized views in SQL? How do they differ, and what are their typical use cases?

-   What are triggers in SQL? How do they work, and what are common scenarios for using them?

-   What are stored procedures in SQL? How do they enhance database functionality, and what are best practices for using them?

-   What are functions in SQL? How do they differ from stored procedures, and when should each be used?

-   What are constraints in SQL? What types exist, and how do they help maintain data integrity?

-   What are joins in SQL? What types of joins exist, and how do they affect query results and performance?

**Task:** Create a database schema for an \"Employee Management System\" using DDL commands to define tables with strict Constraints (Primary/Foreign keys), and populate them with sample data using DML. Write a complex query utilizing Joins to combine employee and department data, then save this logic as both a standard View and a Materialized View to understand the difference in data freshness. Develop a Stored Procedure containing a custom Function that uses a Cursor to iterate through specific records and calculate a bonus. Finally, implement a Trigger that automatically inserts a log entry into an audit table whenever an employee\'s salary is updated.

**Relational Model Jun**

-   What are normal forms in the relational model? Why is normalization important, and how do different normal forms (1NF, 2NF, 3NF, BCNF, etc.) help prevent data anomalies?

-   What is a primary key in a relational database? How do you choose an effective primary key, and what role does it play in ensuring data integrity?

-   What is a foreign key in a relational database? How do foreign keys enforce referential integrity, and what are common use cases and challenges when designing foreign key relationships?

**Task:** Design a schema for a \"Student Course Registration\" system starting from a single, unnormalized spreadsheet containing repeating student info and comma-separated lists of classes. Decompose this data into multiple related tables to satisfy First, Second, and Third Normal Forms (1NF, 2NF, 3NF). Assign a unique Primary Key to every entity and use Foreign Keys to create the relationships between students and the courses they are taking. Finally, write a brief explanation describing how this normalized structure prevents data redundancy compared to the original flat file.

**Transactions Jun**

-   What are transactions in databases? What properties define a transaction (ACID), and why are they important for data integrity?

-   What are isolation levels in database transactions? What are the different isolation levels (Read Uncommitted, Read Committed, Repeatable Read, Serializable), and how do they affect concurrency and consistency?

-   What types of problems can occur with different isolation levels (e.g., dirty reads, non-repeatable reads, phantom reads), and how can they be mitigated?

-   How do different database systems implement and optimize transaction isolation, and what are the trade-offs between performance and consistency?

**Task:** Open two separate database connections to simulate concurrent users and begin a transaction in the first session that updates a record without committing. In the second session, set the transaction isolation level to READ UNCOMMITTED to query that record, observing how you can see data that hasn\'t been saved yet (a \"dirty read\"). Switch the second session to READ COMMITTED and run the query again to prove that the uncommitted change is now hidden, ensuring better consistency. Finally, set the level to SERIALIZABLE and attempt to modify the same row in the second session to demonstrate how the database forces the second user to wait until the first transaction is finished.

**NoSQL categories Jun**

-   What are the main categories (types) of NoSQL databases, and what distinguishes each category (document, key-value, column-family, graph)?

-   What are the key differences between NoSQL database categories in terms of data model, scalability, and use cases?

-   What factors should be considered when choosing between different NoSQL categories for a specific application or workload?

-   What are some common examples of NoSQL databases in each category, and what are their typical strengths and weaknesses?

-   How do real-world use cases map to different NoSQL database types, and what are best practices for selecting the right NoSQL solution?

**Task:** Install and run four different NoSQL database types locally or via Docker: a Key-Value store (Redis), a Document store (MongoDB), a Column-family store (Cassandra), and a Graph database (Neo4j). Create a script to store a simple user session in Redis and a complex profile object in MongoDB, then model a \"friend of a friend\" query in Neo4j to observe which structure handles relationships most efficiently. Contrast these by simulating a high-velocity logging feature suitable for Cassandra, noting the specific trade-offs in consistency and flexibility for each category. Finally, write a brief conclusion explaining which database type you would choose for a real-time analytics dashboard versus a content management system based on the choice factors you discovered.

**Concepts Jun**

-   What is OLAP (Online Analytical Processing)? What are its main characteristics, and how does it differ from OLTP?

-   What is OLTP (Online Transaction Processing)? What are its typical use cases, and how does it differ from OLAP?

-   What are ACID properties in databases? Why are they important, and how do they ensure reliable transactions?

-   What is an Entity-Relationship Diagram (ERD)? How is it used in database design, and what are its key components?

-   What is the BASE model in NoSQL databases? How does it contrast with the ACID model, and what are the trade-offs?

-   What are database migrations? Why are they necessary, and what are best practices and common tools for managing schema and data migrations?

**Task:** Design an Entity Relationship Diagram (ERD) for an e-commerce platform and implement it using a database Migration tool to version control your schema changes. Write a transaction script that simulates a user purchase, ensuring it adheres to strict ACID properties (Atomicity, Consistency, Isolation, Durability) so the inventory and payment records remain accurate. Contrast this by setting up a separate reporting database optimized for OLAP (Online Analytical Processing) queries, explaining how its design differs from your main OLTP (Online Transaction Processing) system. Finally, briefly research a NoSQL database scenario for this platform and describe how it would follow the BASE model (Basically Available, Soft state, Eventual consistency) instead of ACID constraints.

**Normalisation JUN**
1. Normal Forms**

-   First Normal Form (1NF): Ensuring atomicity (no lists within a single cell)

-   Second Normal Form (2NF): Removing partial dependencies on composite keys

-   Third Normal Form (3NF): Eliminating transitive dependencies (non-key attributes dependent on other non-keys)

-   Understanding Data Anomalies: How normalization prevents Insert, Update, and Delete errors

2.  **Denormalization**

-   The trade-off: sacrificing write speed and storage for faster read performance

-   Intentionally introducing redundancy to avoid complex, slow SQL joins

-   Strategies for maintaining consistency (e.g., database triggers, scheduled updates)

**Task**: Create a database design for a simple online store starting with a huge \"Orders\" table that includes Customer Name, Product details, Price, and Shipping Address all in one row. Apply the rules of Normalization to split this single table into distinct, related tables (e.g., Customers, Products, Orders) to eliminate data duplication. Once normalized, identify a scenario where joining these tables becomes too slow for a specific report. Finally, propose a Denormalization strategy to speed up that report, explaining the trade-off between speed and


**Task:** Given a denormalized table containing order data (OrderID, CustomerName, CustomerEmail, CustomerPhone, ProductName, ProductPrice, Quantity, OrderDate), normalize it step by step through 1NF, 2NF, and 3NF. Create the SQL CREATE TABLE statements for the final normalized schema, write INSERT statements to populate it with sample data, and then write a JOIN query that reconstructs the original denormalized view. Explain why each normalization step was necessary.

**No SQL Jun**

-   What is MongoDB, and what type of NoSQL database is it? What are its core features, strengths, and typical use cases?

-   How does MongoDB handle data modeling, querying, and indexing compared to other NoSQL and SQL databases?

-   What is Redis, and what type of NoSQL database is it? What are its core features, strengths, and typical use cases?

-   How does Redis manage data storage, persistence, and in-memory operations, and what are its advantages and limitations?

-   In what scenarios would you choose MongoDB over Redis, or vice versa? What are the key factors influencing this decision?

-   What are some real-world examples or case studies of applications using MongoDB and Redis?

**Task:** Build a Node.js application that implements a caching strategy by checking Redis for a user\'s data before querying a MongoDB database to optimize performance. If the cache is empty, fetch the document from MongoDB, store it in Redis with a 60-second expiration time, and return the result. Create a function to update the user in MongoDB that also deletes the specific key in Redis to ensure the cache does not serve outdated information. Finally, inspect the stored data using CLI tools to verify that MongoDB holds the complex nested object while Redis holds the temporary key-value pair, illustrating the difference between persistent storage and volatile caching.

**Column based DBs Mid**

-   What are the key architectural trade-offs of columnar databases compared to row-oriented databases (e.g., write amplification, compression efficiency, column pruning, late materialization)? In which scenarios do these trade-offs become critical?

-   How do column-based databases handle write-heavy workloads (e.g., LSM trees, write buffers, merge processes) and what impact does that have on latency and operational complexity?

-   What are the primary analytical use cases where columnar storage significantly outperforms traditional row-based SQL databases (e.g., aggregations over large datasets, data warehousing, time-series analytics)?

-   How do columnar databases optimize performance for OLAP-style queries (e.g., vectorized execution, dictionary encoding, compression, predicate pushdown), and how do these techniques differ from traditional SQL engines?

-   In mixed workloads (OLTP + OLAP), what patterns or architectures (e.g., HTAP systems, dual-write, CDC to a warehouse) are used when integrating columnar databases with row-based OLTP stores?

-   How does query performance in columnar databases compare to classic SQL RDBMS for:

    -   Wide analytical queries (many rows, few columns)

    -   Point lookups and small transactions (few rows, many columns)?

-   What consistency and concurrency models do popular columnar databases (e.g., ClickHouse, Apache Cassandra, Amazon Redshift, Apache HBase) offer, and how do these influence application design?

-   What are typical data modeling best practices for columnar databases (e.g., denormalization, wide tables, partitioning, clustering keys), and how do they differ from normalized relational schemas?

-   What are some concrete examples of columnar databases (e.g., ClickHouse, Redshift, BigQuery, Snowflake, Apache Parquet-based lakehouses, Cassandra/HBase as wide-column stores), and how do their architectures and target use cases differ?

-   How do backup, replication, and failure recovery strategies differ in columnar systems compared to traditional relational databases, especially at large scale?

**Task:** Generate a large dataset containing one million sales records and import it into both a traditional row-based SQL database (like PostgreSQL) and a column-oriented store (like DuckDB or ClickHouse). Execute an aggregation query that calculates the total revenue from a specific column in both systems, measuring the execution time to demonstrate the significant performance advantage of the columnar architecture for analytical tasks. Conversely, attempt to retrieve all fields for a single specific user to observe the latency difference where the row-based system typically performs better. Finally, document your findings in a short note explaining why column-based databases are the standard for OLAP and Big Data analytics despite the trade-offs in transactional write speeds and single-row lookups.

**SQL Mid**

-   What are Common Table Expressions (CTEs) in SQL? How do they improve query readability and maintainability, and what are their performance implications compared to subqueries or derived tables?

-   What are temporary tables in SQL? When should you use temp tables versus CTEs or subqueries, and what are the trade-offs in terms of performance and resource usage?

-   How do subqueries differ from joins in SQL? What are the advantages, disadvantages, and performance considerations of each approach in various scenarios?

-   What are window functions in SQL? How do they enable advanced analytics (e.g., ranking, running totals, moving averages), and what are best practices for their use?

-   What techniques and tools are available for profiling and optimizing SQL queries? How can you identify and resolve common performance bottlenecks (e.g., using EXPLAIN plans, indexing strategies, query rewriting)?

-   How do recursive CTEs work internally, and what are common patterns for using them (hierarchies, graphs, recursive aggregates)? What are typical performance pitfalls?

-   When is it beneficial to break a complex query into multiple steps using temporary tables rather than one large query with CTEs/subqueries? Can you describe a real case where this significantly improved performance?

-   How do correlated subqueries differ from non-correlated subqueries in terms of execution plans, and when can a correlated subquery become a major performance issue?

-   How does the DB engine execute window functions internally (e.g., sorting, partitioning, buffering), and what is the impact on memory and sorting costs?

**Task:** Construct a complex SQL query that uses a Common Table Expression (CTE) to aggregate monthly sales data and applies a Window Function to rank the top-performing products within each category. Store these results in a Temporary Table, then retrieve the final dataset using both a Subquery and a Join, comparing the performance of each approach by running the EXPLAIN ANALYZE profiler to inspect the cost. Modify the database schema to store product attributes in both JSON and JSONB columns, and run a query filtering on a specific attribute to demonstrate the indexing and speed advantages of the binary format. Finally, analyze the query plan output to document the specific bottlenecks found in the subquery version versus the join version.

**Replication Mid**

-   What is database replication, and what problems does it solve in modern systems (availability, scalability, latency)?

-   What are the main replication typologies:

    -   Master--slave (primary--replica)

    -   Master--master (multi-primary)

    -   Peer-to-peer / multi-leader

    -   Log-shipping / logical vs physical replication?

-   How do synchronous and asynchronous replication differ? In which scenarios is each typically used?

-   What is the difference between:

    -   Statement-based replication

    -   Row-based replication

    -   Logical vs physical replication?

-   How does replication work conceptually in your main DB (e.g., PostgreSQL, MySQL, SQL Server)? What components are involved (WAL/binlog, replication slots, etc.)?

-   How does replication improve read scalability, and what patterns are used to offload reads to replicas?

-   In what ways does replication contribute to high availability and disaster recovery?

-   How can geographically distributed replicas help reduce latency for users in different regions?

-   How can you use replicas for analytical workloads, reporting, or backups without impacting the primary?

-   What benefits does replication provide for zero-downtime maintenance (e.g., rolling upgrades, failover)?

-   What are the main trade-offs between synchronous and asynchronous replication in terms of:

    -   Latency

    -   Durability

    -   Throughput

    -   User experience?

-   What kinds of consistency issues can arise with replicated databases (e.g., stale reads, read-after-write inconsistencies, replication lag)?

-   How do replication lag and network partitions affect application behavior, and how can applications be designed to handle them gracefully?

-   What are typical conflict scenarios in multi-master replication, and what conflict resolution strategies exist (last-write-wins, app-level resolution, CRDTs)?

-   How does replication increase operational complexity (monitoring, failover, split-brain handling), and what practices/tools help manage that complexity?

-   What are the performance overheads of enabling replication on the primary (extra I/O, logging, network), and how can they be mitigated?\
    > \
    > **Task:** Configure a Master-Slave replication setup using two Docker containers for a database like PostgreSQL, distinguishing the write-only leader from the read-only follower. Write a script that inserts a record into the Master and immediately attempts to read it from the Slave, measuring the time difference to observe the replication lag and the trade-off of eventual consistency. Simulate a server failure by stopping the Master container, confirming that the Slave can still handle read requests to demonstrate the benefit of high availability. Finally, write a brief comparison explaining why a Master-Master topology might be more complex to manage regarding conflict resolution compared to the setup you just built.

**Sharding Mid**

-   What is sharding in the context of databases, and how does it differ from simple replication?

-   What are the main data distribution strategies for sharding (e.g., range-based, hash-based, directory-based, geo-sharding)?

-   How do you choose an appropriate sharding key, and what are the consequences of a poor sharding key selection?

-   How do different sharding strategies affect data locality, query routing, and rebalancing?

-   What are the challenges of resharding (changing the sharding key or adding/removing shards) in a live system?

-   How does sharding enable horizontal scalability for large datasets and high-throughput applications?

-   In what ways can sharding improve performance, reduce contention, and support multi-region deployments?

-   How can sharding help isolate workloads and improve fault tolerance or availability?

-   What are some real-world scenarios or case studies where sharding was essential for scaling?

-   What are the main trade-offs and complexities introduced by sharding (e.g., cross-shard queries, distributed transactions, increased operational overhead)?

-   How does sharding impact consistency, especially in distributed systems (e.g., eventual consistency, two-phase commit)?

-   What are the operational challenges of monitoring, backup, and recovery in a sharded environment?

-   How do you handle hot spots (uneven data or traffic distribution) and what strategies exist to mitigate them?

-   What are the risks and mitigation strategies for data loss or split-brain scenarios in sharded architectures?

**Task:** Simulate a sharded database architecture by creating three separate arrays representing distinct servers and writing a \"shard manager\" function that uses the modulo operator on a user\'s ID to route data to the correct array. Implement a \"getById\" function that calculates the specific array to check, demonstrating the performance benefit of direct routing compared to searching a monolithic list. Next, attempt to find a user by their name, forcing the system to query every single array to locate the record, effectively illustrating the \"scatter-gather\" trade-off and increased complexity. Finally, add a comment explaining how this horizontal partitioning strategy allows for infinite scaling but introduces significant challenges when trying to join data across different shards.

**Concepts Mid**

-   What is the CAP theorem, and what do the terms Consistency, Availability, and Partition Tolerance mean in distributed systems?

-   Why can't a distributed system guarantee all three properties (C, A, and P) simultaneously?

-   How do real-world databases and distributed systems (e.g., MongoDB, Cassandra, etcd) position themselves on the CAP triangle?

-   What are practical examples of systems that prioritize CA, CP, or AP, and what trade-offs do they make?

-   How does network partitioning affect system behavior, and what strategies exist to handle partitions gracefully?

-   How does the CAP theorem influence architectural decisions for high-availability and globally distributed applications?

-   What are the main types of database backups (full, incremental, differential, logical, physical), and when should each be used?

-   How do backup strategies differ for relational vs. NoSQL databases?

**Task:** Set up a small MongoDB replica set (or a similar distributed database) and intentionally disconnect the primary node from the network to observe how the system behaves, effectively demonstrating the trade-offs between Consistency and Availability defined in the CAP theorem. While the system is in this degraded state, attempt to read and write data to see if the database chooses to accept updates (Availability) or lock down to prevent conflicts (Consistency). Afterward, write a script to perform a logical backup (like mongodump) of the data and automate a restoration process to a fresh instance to ensure data integrity. Finally, verify the restored data and write a brief summary explaining why your specific database configuration could not satisfy all three CAP properties simultaneously during the partition.

**Locking strategies Mid**

-   What is optimistic locking, and how does it work in practice (e.g., version numbers, timestamps)?

-   In what scenarios is optimistic locking preferred over pessimistic locking, and why?

-   How do you implement optimistic locking in popular databases or ORMs (e.g., PostgreSQL, Hibernate, Entity Framework)?

-   What are the typical failure modes of optimistic locking (e.g., update conflicts), and how should applications handle them?

-   How does optimistic locking impact system performance and user experience in high-concurrency environments?

-   What is pessimistic locking, and how does it differ from optimistic locking?

-   What are the main types of locks (e.g., row-level, table-level, shared, exclusive) used in pessimistic locking?

-   How do you implement pessimistic locking in SQL (e.g., SELECT \... FOR UPDATE), and what are the implications for transaction isolation and deadlocks?

-   What are the risks of deadlocks and lock contention with pessimistic locking, and how can they be detected and resolved?

-   How does pessimistic locking affect throughput and latency in systems with many concurrent users?

-   How do you decide which locking strategy to use for a given workload or application scenario?

-   What are the trade-offs between optimistic and pessimistic locking in terms of consistency, performance, and complexity?

-   How do distributed databases handle locking and concurrency control, and what additional challenges arise (e.g., distributed deadlocks, network partitions)?

-   Can you describe a real-world scenario where switching from pessimistic to optimistic locking (or vice versa) significantly improved system performance or reliability?

-   How do modern databases and ORMs abstract or automate locking strategies, and what are the best practices for configuring them?

**Task**: Create a script connected to a local SQL database that simulates an inventory system using a version column to implement **Optimistic Locking**, where two concurrent updates attempt to modify the same item and one fails due to a version mismatch. Refactor the code to use **Pessimistic Locking** by wrapping the read operation in a transaction with SELECT \... FOR UPDATE, ensuring that the second request waits for the first to complete rather than throwing an error. Run both scenarios to observe the difference between handling a \"stale data\" exception versus experiencing a delay due to a database lock. Finally, write a short comment comparing the user experience of getting an error message versus waiting for the lock to release.


**Task:** Create a demonstration application that shows the difference between optimistic and pessimistic locking strategies. Implement a bank account balance update scenario where: (1) pessimistic locking uses SELECT FOR UPDATE to prevent concurrent modifications, (2) optimistic locking uses a version column and retries on conflict. Simulate 10 concurrent transfers and log how each strategy handles conflicts, including the number of retries and any failed transactions.

**NO SQL MID**

1.  **DynamoDB Architecture & Data Modeling**

-   NoSQL key-value store fundamentals

-   Partition Keys vs Composite Primary Keys

-   Single Table Design patterns and adjacency lists

-   Global Secondary Indexes (GSI) vs Local Secondary Indexes (LSI)

-   Capacity modes: Provisioned vs On-demand scaling

-   DynamoDB Streams and Lambda triggers

2.  **ElasticSearch Internals & Querying**

-   Inverted Index structure and lucene segments

-   Text Analysis process: Analyzers, Tokenizers, and Filters

-   Query DSL: Boolean logic, Match, and Term queries

-   Aggregations for analytics and metrics

-   Cluster architecture: Shards, Replicas, and Nodes

-   Handling distributed document conflicts and versioning

3.  **ClickHouse for OLAP Analytics**

-   Column-oriented storage vs Row-oriented storage

-   MergeTree table engine family and data parts

-   Data compression techniques and codecs

-   Vectorized query execution engine

-   Materialized Views for real-time aggregation

-   Data replication and distributed query processing

**Task:** Design a data architecture for a \"Log Analytics System\" that leverages the specific strengths of three different NoSQL engines. Start by creating a **DynamoDB** table to handle high-velocity write throughput for incoming raw log events. Implement a stream processor (using DynamoDB Streams or a script) to replicate these logs in real-time into **ElasticSearch**, enabling a complex full-text search API that lets users filter logs by partial keywords or fuzzy matches. Simultaneously, batch-load the data into **ClickHouse** to handle heavy analytical aggregations, such as calculating the \"Average Error Rate per Minute\" over millions of records. Finally, run a benchmark comparing the speed of a full-table Scan in DynamoDB against the indexed search in ElasticSearch and the columnar aggregation in ClickHouse to demonstrate why specific workloads require specialized databases.

PostgreSQL

**Indexes JUN**

1.  **Types of Indexes in SQL**

-   Clustered vs. Non-clustered indexes: Physical storage differences

-   B-Tree and B+ Tree data structures

-   Hash indexes: Key-value lookups and limitations

-   Composite indexes: Importance of column order

-   Full-text indexes for complex string searching

-   Bitmap indexes for low-cardinality data

2.  **Benefits of Indexes in SQL**

-   Accelerating data retrieval speed (SELECT performance)

-   Optimizing sorting operations (ORDER BY clauses)

-   Improving aggregate performance (GROUP BY clauses)

-   Enforcing data uniqueness (Unique Constraints)

-   Covering Indexes: Retrieving data without accessing table rows

-   Reducing disk I/O through Index Seeks

3.  **Trade-offs of Indexes in SQL**

    -   **I**mpact on Write Performance (INSERT, UPDATE, DELETE overhead)

    -   Disk space consumption and storage costs

    -   Maintenance requirements: Rebuilding and reorganizing fragmented indexes

    -   Query Optimizer overhead: Cost of choosing the right path

    -   The risk of over-indexing vs. under-indexing

    -   Locking issues during index maintenance

**Task:** Design a simple database schema with a high-volume table, populate it with mock data, and analyze query performance using execution plans. Implement specific indexing strategies (for ex. Clustered, Composite, Covering) to optimize it,analyze SELECT and INSERT INTO query performance again and find how indexes affect it.

**Data Types JUN**

1.  **Postgres Data Types**

-   Numeric Primitives: Integer types (Smallint, Int, Bigint) vs. Arbitrary Precision (Numeric)

-   Character Storage: The internal similarity and trade-offs between CHAR, VARCHAR, and TEXT

-   Date and Time: Handling Timezones with TIMESTAMPTZ vs. TIMESTAMP

-   Unstructured Data: JSON vs. JSONB (Binary format, GIN indexing, and whitespace handling)

-   Collections and Arrays: Storing multiple values in a single column using ARRAY types

-   Special Types: UUIDs for distributed keys, Network types (INET), and Geometric types

> **Task:** Create a database table for a \"Product Catalog\" that utilizes a variety of specific PostgreSQL data types. Use UUID for primary keys, NUMERIC for monetary values, JSONB for flexible product attributes, and TIMESTAMPTZ for audit logs. Write queries to insert data, perform mathematical operations on the specific types, and query keys within the JSONB column.

**Query planner MID**

1.  **Index Selectivity**

-   Definition: Ratio of distinct values to total rows (Cardinality)

-   High Selectivity vs. Low Selectivity: When indexes are ignored

-   The role of pg\_stats and auto-vacuum statistics

-   Impact of data skew and histograms on planner decisions

-   Partial indexes for highly selective subsets of data

2.  **Query Plan Settings**

-   Cost constants: seq\_page\_cost vs. random\_page\_cost

-   Planner method configuration: enable\_seqscan, enable\_indexscan, enable\_nestloop

-   Memory settings impact: work\_mem on Hash Joins and Sorts

-   effective\_cache\_size: Informing the planner about available RAM

-   Genetic Query Optimizer (GEQO) limits for complex joins

3.  **Explain Analyze**

-   EXPLAIN (theoretical path) vs. EXPLAIN ANALYZE (actual execution)

-   Reading the plan: Bottom-up execution flow and indentation

-   Key metrics: Startup cost, Total cost, Actual Rows vs. Estimated Rows

-   Buffer usage analysis: Hit blocks, Read blocks, and Dirtied blocks

-   Identifying performance bottlenecks: Loops, Sort methods, and Filter removal

**Task:** Set up a PostgreSQL table with a skewed data distribution (e.g., a status column where \~95% is \'active\' and \~5% is \'archived\'). Run queries filtering by the different statuses and use EXPLAIN ANALYZE to observe when the planner chooses a Sequential Scan versus an Index Scan. Experiment with modifying random\_page\_cost and enable\_seqscan to force different execution paths and analyze the resulting cost and timing differences.

**INDEXES MID**

1.  **Full Text Search**

-   Pattern matching limitations: Why LIKE and regex are slow for large text

-   The TSVECTOR type: Parsing, normalizing, and storing lexemes

-   The TSQUERY type: Constructing search conditions (AND, OR, NOT)

-   Ranking results: Using ts\_rank and ts\_rank\_cd for relevance

-   Indexing for FTS: GiST vs. GIN indexes

-   Dictionaries and Stemming: Handling language variations and stop words

**Task:** Create a table containing a large volume of text data (e.g., product descriptions or blog posts). Implement a standard LIKE \'%\...%\' search query and measure its performance. Then, add a TSVECTOR column, create a GIN index on it, and rewrite the query using @@ operators to perform a Full Text Search. Compare the execution times and analyze the EXPLAIN output to see the index usage.

**Internals MID**

1.  **Vacuum**

-   Dead Tuples: Why deleted/updated rows remain on disk

-   Autovacuum Daemon: Configuration, thresholds, and maintenance

-   VACUUM vs. VACUUM FULL: Locking behavior and space reclamation

-   Transaction ID Wraparound: The risk of data loss and \"freezing\"

-   Visibility Map: optimizing Index-Only Scans

2.  **WAL (Write-Ahead Logging)**

-   Durability Guarantee: Writing to logs before modifying data files

-   Checkpoints: Syncing dirty pages from memory to disk

-   LSN (Log Sequence Number): Tracking position in the transaction log

-   Point-in-Time Recovery (PITR): Using WAL archives for restoration

-   Performance: Benefits of sequential I/O over random I/O

3.  **MVCC (Multi-Version Concurrency Control)**

-   Snapshot Isolation: Readers do not block writers

-   Hidden System Columns: Role of xmin (creation tx) and xmax (deletion tx)

-   Row Versioning: How UPDATE operations create new tuple versions

-   Isolation Levels: Read Committed vs. Repeatable Read vs. Serializable

-   Bloat: The storage consequence of preserving multiple row versions

**Task:** Create a high-activity environment by running a script that continuously updates and deletes rows in a specific table. Monitor the accumulation of \"dead tuples\" using pg\_stat\_user\_tables. Manually execute VACUUM versus VACUUM FULL to observe the differences in storage reclamation and table locking. Finally, query the xmin and xmax system columns on a specific row to observe how transaction IDs track row versions.

**Internal functions MID**

1.  **Table Functions**

-   Set-Returning Functions (SRFs): Concept and usage

-   RETURNS TABLE (\...): Defining explicit output schema

-   RETURNS SETOF \...: Returning rows based on existing types

-   Language choices: SQL vs. PL/pgSQL for complexity

-   Lateral Joins: Using table functions in the FROM clause referencing prior columns

-   Performance implications: Optimizer opacity (black box) issues

**Task:** Create a custom PL/pgSQL function that accepts a parameter (e.g., a date range or category ID) and returns a set of rows (RETURNS TABLE) joining data from multiple existing tables. Invoke this function in a standard SELECT statement (e.g., SELECT \* FROM my\_function(\...)) and compare its usage and flexibility against a standard View or CTE, specifically focusing on how parameters are passed.

WEB

**REST JUN**

1.  **Status codes**

-   The 5 classes: Information, Success, Redirection, Client Error, Server Error

-   Success states: 200 (OK), 201 (Created), 204 (No Content)

-   Client errors: 400 (Bad Request), 401 (Unauthorized) vs. 403 (Forbidden)

-   Resource handling: 404 (Not Found) vs. 410 (Gone)

-   Server-side issues: 500 (Internal Server Error) vs. 503 (Service Unavailable)

2.  **Principles**

-   Statelessness: Server contains no client state between requests

-   Client-Server architecture: Separation of concerns

-   Uniform Interface: Standardized communication (URI, Methods)

-   Cacheability: Explicit caching instructions for clients

-   Layered System: Intermediaries (proxies, load balancers) are transparent

3.  **Methods**

-   Safe methods: GET, HEAD (No side effects)

-   Resource creation: POST (Non-idempotent)

-   Full replacement: PUT (Idempotent)

-   Partial update: PATCH (Modification instructions)

-   Removal: DELETE (Idempotent)

-   Metadata retrieval: OPTIONS and HEAD

4.  **Response/request structure**

-   Headers: Metadata (Content-Type, Authorization, Accept)

-   The Payload: Body formats (JSON, XML, Form-data)

-   URI Components: Path parameters vs. Query strings

-   Status Line: Version and Status Code

-   Cookies: State management mechanism

5.  **RESTful**

-   Richardson Maturity Model: The levels of REST compliance

-   HATEOAS: Hypermedia as the Engine of Application State

-   Resource-oriented URLs: Nouns over verbs (e.g., /users not /getUsers)

-   Content negotiation: Serving different formats based on Accept headers

-   Strict adherence to Roy Fielding\'s dissertation constraints

6.  **RESTlike**

-   Pragmatic REST: Loosening constraints for ease of use

-   RPC over HTTP: Action-based URLs (e.g., /api/calculateTotal)

-   Ignoring HATEOAS: Returning simple JSON data without links

-   Simplified Error Handling: Using 200 OK for logical errors with internal codes

-   Often used in internal microservices or simple public APIs

7.  **Idempotence**

-   Safe vs. Idempotent: GET is both; DELETE is idempotent but not safe

-   POST issues: Why double-submitting a form creates duplicate records

-   Handling retries: Ensuring network failures don\'t corrupt data

-   Implementation strategies: Idempotency keys in headers

> **Task:** Design a simple API for a \"User Management System\". Implement endpoints to create a user (POST), retrieve a user (GET), update a user (PUT vs PATCH), and delete a user (DELETE). Ensure that the PUT and DELETE operations are idempotent (running them multiple times yields the same result) and return the strictly correct HTTP status codes for scenarios like \"Resource Created\" (201), \"Not Found\" (404), and \"Bad Request\" (400).
>
> **Other styles JUN**

1.  **SOAP (Simple Object Access Protocol)**

-   XML-based message format: Envelope, Header, Body

-   WSDL (Web Services Description Language): Strict contract definition

-   WS-Security and ACID compliance: Enterprise-grade reliability

-   Transport independence: Works over HTTP, SMTP, TCP

-   Verbosity and complexity: Overhead compared to JSON/REST

-   Legacy usage: Prevalent in banking and older enterprise systems

2.  **GraphQL**

-   Single Endpoint architecture: Avoiding the \"N+1 request\" problem

-   Schema Definition Language (SDL): Strongly typed API contract

-   Overfetching vs. Underfetching: Client requests exactly what is needed

-   Resolvers: Logic for fetching data for specific fields

-   Mutations: Modifying server-side data

-   Introspection: Self-documenting capabilities (GraphiQL)

3.  **GRPC (gRPC Remote Procedure Call)**

-   Protocol Buffers (Protobuf): Binary serialization vs. JSON text

-   HTTP/2 Transport: Multiplexing and header compression

-   Types of RPC: Unary, Server Streaming, Client Streaming, Bidirectional

-   Code Generation: Auto-generating client stubs from .proto files

-   Language Agnostic: Cross-language communication

-   Performance: High throughput and low latency suitable for microservices

4.  **Websockets**

-   Full-duplex communication: Bidirectional data flow

-   The Handshake: Upgrading an HTTP connection to a persistent socket

-   ws:// vs wss://: Unencrypted vs. Encrypted protocols

-   Event-driven: pushing data (onMessage) vs. polling

-   Connection maintenance: Heartbeats, Pings, and Pongs

-   Use cases: Real-time chat, Live gaming, Collaborative edi

> **Task:** Develop a simplified version (with basic operations and mock responses) of \"Stock Market Dashboard\" backend to explore different communication patterns. Implement a gRPC service for high-frequency internal updates between microservices (e.g., pricing engine to aggregator). Expose a GraphQL API for the frontend to fetch specific company profiles without overfetching data. Finally, implement a Websocket server to push live price changes to the client in real-time, contrasting this persistent connection with the request-response model.
>
> **Auth concepts JUN**
> **

1.  **JWT (JSON Web Tokens)**

-   Structure: Header (Algorithm), Payload (Claims), and Signature

-   Statelessness: validating requests without database lookups

-   Signing vs. Encryption: Integrity (Base64Url) vs. Confidentiality

-   Storage trade-offs: localStorage (XSS risk) vs. httpOnly Cookies

-   The Revocation Problem: Expiration times and Token Blacklisting

-   Refresh Token rotation patterns

2.  **Sessions**

-   Stateful Architecture: Storing user state on the server (Memory/DB/Redis)

-   The Session ID: Opaque reference token stored in a Cookie

-   Cookie Security: HttpOnly, Secure, and SameSite attributes

-   Scaling challenges: Sticky Sessions vs. Distributed Session Stores

-   Immediate Revocation: Server\'s ability to kill active sessions instantly

-   Vulnerability to CSRF (Cross-Site Request Forgery)

3.  **CORS (Cross-Origin Resource Sharing)**

-   Browser Security: The Same-Origin Policy mechanism

-   Simple Requests (GET/POST) vs. Preflight Requests (OPTIONS)

-   Key Headers: Access-Control-Allow-Origin and Access-Control-Allow-Methods

-   Credentials: allowing Cookies across origins (Access-Control-Allow-Credentials)

-   Wildcards: The security implications of using \*

-   Debugging: Distinguishing Network errors from CORS policy blocks

> **Task:** Build a simple authentication service that supports two modes: one using server-side Sessions (stored in Redis) and another using JWTs. Create a separate frontend application running on a different port. Attempt to fetch data from the backend to observe CORS errors, then configure the backend headers (Access-Control-Allow-Origin) and Preflight options to allow the request. Compare the logout process for both: destroying the session on the server vs. the client-side removal of the JWT.
>
> **Storages JUN**

1.  **LocalStorage**

-   Persistence: Data remains until explicitly deleted (No expiration)

-   Scope: Shared across all tabs and windows of the same origin

-   Capacity: Typically \~5MB per origin (Browser dependent)

-   Synchronous API: Blocking main thread operations

-   Data Format: Key-Value pairs (Strings only, requiring JSON serialization)

-   Security: Vulnerability to XSS attacks (Accessible via JS)

2.  **SessionStorage**

-   Lifecycle: Cleared when the page session ends (Tab/Window closed)

-   Scope isolation: Data is not shared between different tabs/windows

-   Surviving reloads: Data persists through page refreshes

-   Use cases: Multi-step form data, temporary UI state

-   Storage limits: Similar to localStorage (\~5MB)

3.  **CacheStorage**

-   Service Worker integration: The backbone of Progressive Web Apps (PWA)

-   Data Structure: Storing Request/Response object pairs

-   Asynchronous API: Promise-based access (caches.open, caches.match)

-   Network strategies: Cache-First, Network-First, Stale-While-Revalidate

-   Quota Management: Handling large assets and browser eviction policies

-   Access: Available to both window scope and workers

> **Task:** Build a simple \"Note Taking App\" to explore browser storage mechanisms. Use localStorage to save the user\'s theme preference (Dark/Light) so it persists after closing the browser. Use sessionStorage to temporarily save the content of a note while it is being typed to prevent loss during accidental page reloads. Finally, implement a Service Worker that uses cacheStorage to cache the app\'s CSS and JS files, allowing the application to load even when offline.
>
> **OAuth 2.0 MID**
> **

1.  **Key concepts (tokens, refreshing, grant types etc.)**

-   The Roles: Resource Owner, Client, Authorization Server, Resource Server

-   Access Tokens vs. Refresh Tokens: Short-lived credentials vs. Long-lived renewal keys

-   Authorization Code Flow: The standard for server-side apps (Exchange code for token)

-   PKCE (Proof Key for Code Exchange): Security extension mandatory for mobile/SPA

-   Client Credentials Flow: Machine-to-machine authentication (No user interaction)

-   Scopes: Limiting the access level (e.g., read:user, repo)

-   Bearer Authentication: Transmitting tokens in the HTTP Header

2.  **OpenID connect**

-   Authentication vs. Authorization: OIDC adds identity to OAuth\'s access

-   The ID Token: A JWT containing user profile data (Claims)

-   Standard Scopes: openid, profile, email, offline\_access

-   UserInfo Endpoint: Fetching additional user attributes

-   Discovery Document: The role of /.well-known/openid-configuration

-   Nonce validation: Preventing replay attacks

> **Task:** Implement a \"Login with GitHub\" feature for a web application. Configure an OAuth App in GitHub to obtain the Client ID and Secret. Implement the Authorization Code Flow manually (without a library initially) to exchange the temporary code for an Access Token. specific scopes. Store the token securely, use it to fetch the user\'s repositories, and implement the logic to use a Refresh Token (if supported/mocked) when the access token expires.
>
> **Network MID**

1.  **SSL/TLS**

-   Hybrid Encryption: Asymmetric for handshake, Symmetric for data transfer

-   The Handshake: ClientHello, ServerHello, Certificate exchange, and Key derivation

-   PKI (Public Key Infrastructure): Certificate Authorities (CA) and Chain of Trust

-   TLS 1.2 vs. 1.3: Reduced round trips and 0-RTT (Zero Round Trip Time)

-   Certificates: Self-signed vs. CA-signed and common validation errors

-   Forward Secrecy: Protecting past sessions if private keys are compromised

2.  **Cache**

-   Caching Locations: Browser, Proxy, CDN (Edge), and Gateway

-   Control Headers: Cache-Control (max-age, no-cache, no-store) vs. Expires

-   Validation: ETag / If-None-Match and Last-Modified / If-Modified-Since

-   Response Codes: 200 OK (from disk/memory) vs. 304 Not Modified

-   Cache Busting: Filename fingerprinting (e.g., style.v2.css) to force updates

-   The \"Thundering Herd\" problem: Cache stampedes when entries expire

3.  **DNS (Domain Name System)**

-   Hierarchy structure: Root servers, TLDs (.com), and Authoritative nameservers

-   Record Types: A (IPv4), AAAA (IPv6), CNAME (Alias), MX (Mail), TXT (Verification)

-   Resolution Flow: Recursive resolvers (ISP/Google) vs. Iterative queries

-   TTL (Time To Live): Impact on propagation speed and caching

-   Debugging tools: Using dig, nslookup, and whois

-   DNS over HTTPS (DoH): Encrypting DNS queries for privacy

> **Task:** Configure a local web server (e.g., Nginx or Apache) to serve a static site over HTTPS using a self-signed certificate. Use Wireshark to capture and analyze the SSL/TLS handshake packets. Modify the server configuration to send specific Cache-Control headers and observe the behavior in the browser\'s DevTools (200 OK vs. 304 Not Modified). Finally, use command-line tools like dig to inspect DNS records and experiment with the hosts file to override local resolution.
>
> **Other styles MID**

1.  **SOAP (Advanced Integration)**

-   WS-\* Standards: Implementing WS-Security and WS-AtomicTransaction

-   WSDL Contracts: Rigid typing and automated code generation

-   Error Handling: SOAP Faults vs. HTTP status codes

-   Legacy Integration: Bridging modern JSON apps with XML backends

-   Statefulness: Handling conversational state in enterprise service buses

2.  **GraphQL (Scaling and Security)**

-   Federation & Schema Stitching: Composing a single graph from multiple services

-   Performance Optimization: Using DataLoaders to solve the N+1 problem

-   Security: Query depth limiting and complexity analysis to prevent DoS

-   Caching Challenges: Client-side (Apollo) vs. Server-side (CDN/Persisted Queries)

-   Subscriptions: transporting real-time updates over Websockets/SSE

3.  **GRPC (Microservices patterns)**

-   Load Balancing: Client-side balancing vs. Proxy (Envoy/Linkerd) lookaside

-   Interceptors: Implementing middleware for Auth, Logging, and Tracing

-   Resiliency patterns: Deadlines, Timeouts, and Retries

-   Protobuf Evolution: Managing forward and backward compatibility in fields

-   Metadata: Passing context (like headers) between services

4.  **Websockets (Production concerns)**

-   Scaling: Using Redis Pub/Sub to broadcast messages across multiple server nodes

-   Infrastructure: Configuring NGINX/Load Balancers for connection upgrades and sticky sessions

-   Heartbeats: Implementing PING/PONG to detect ghost connections

-   Binary Protocols: Optimizing bandwidth with binary frames vs. text frames

-   Fallbacks: Understanding Long Polling mechanisms (e.g., Socket.io internals)

5.  **Web-RTC (Real-Time Communication)**

-   The Signaling Server: Exchanging SDP (Session Description Protocol) offers/answers

-   NAT Traversal: The ICE framework (Interactive Connectivity Establishment)

-   STUN vs. TURN: Public IP discovery vs. Relay servers for restrictive firewalls

-   Media Engine: Codecs (VP8/H.264), bitrate adaptation, and echo cancellation

-   Data Channels: Sending arbitrary low-latency data alongside media streams

> **Task:** Architect a \"Telehealth Consultation Platform\" that hybridizes multiple communication protocols. Implement a SOAP client to transactionally submit billing data to a legacy insurance system. Use a GraphQL Gateway to federate data from patient records and appointment services. Use gRPC for high-performance communication between internal AI diagnostic services. Build a Websocket service for real-time text chat, and finally, implement a peer-to-peer video call feature using Web-RTC, specifically configuring STUN/TURN servers to handle NAT traversal.
>
> **Real Time Communication MID**

1.  **Polling (Short Polling)**

-   Mechanism: Client repeatedly sends requests at fixed intervals (e.g., setInterval)

-   Resource Waste: High overhead from HTTP headers and empty responses

-   Latency: Updates are delayed by the polling interval

-   Implementation: Simple client-side logic, no special server config

-   Use cases: Dashboards where real-time precision isn\'t critical

2.  **Long-polling**

-   The \"Hanging GET\": Server holds the connection open until data is available

-   Flow: Request → Wait → Response → Immediate Re-request

-   Timeout Handling: Client must handle server timeouts and reconnect immediately

-   Server Load: Ties up threads/processes waiting for events (blocking)

-   Infrastructure: Challenges with timeouts in load balancers and proxies

3.  **Streaming (HTTP Streaming)**

-   Chunked Transfer Encoding: Sending data in pieces over a single long-lived response

-   Infinite Response: The server never closes the response stream

-   Client Processing: Parsing partial data chunks as they arrive (NDJSON)

-   Buffering Issues: Middleboxes (proxies/gateways) might buffer chunks, delaying data

-   Efficiency: Eliminates the overhead of repeated HTTP handshakes

4.  **SSE (Server-Sent Events)**

-   Unidirectional: One-way communication from Server to Client

-   The Protocol: text/event-stream format over HTTP

-   Browser API: Native EventSource interface with automatic reconnection

-   Features: Built-in support for event IDs and custom event types

-   limitations: Max open connections limit (HTTP/1.1) and no binary data support

> **Task:** Build a simple dashboard application that updates a live data point, such as a stock price or viewer count, in real-time. Begin by implementing this using standard Short Polling where the client requests data every few seconds, then upgrade the implementation to Long Polling to reduce empty responses. Finally, refactor the communication layer to use Server-Sent Events (SSE) for a persistent unidirectional stream of updates. Compare the network activity in your browser for each method to analyze the differences in request frequency and connection handling.
>
> **HTML MID**

1.  **Accessibility (a11y) Fundamentals**

-   WCAG guidelines and principles (POUR)

-   Semantic HTML vs non-semantic structure

-   ARIA roles, states, and properties

-   Keyboard navigation and focus management

-   Screen reader compatibility testing

2.  **SEO Best Practices in HTML**

-   Meta tags optimization (title, description, robots)

-   Structured data and Schema.org markup

-   Canonical URLs and pagination handling

-   Image optimization (alt text, WebP, lazy loading)

-   Mobile-first indexing considerations

3.  **requestAnimationFrame & Performance**

-   Browser rendering pipeline (Reflow, Repaint, Composite)

-   Event loop and animation frames

-   Optimizing high-frequency events (scroll, resize)

-   JavaScript animations vs CSS transitions

-   Frame budget and avoiding layout thrashing

> **Task:** Create a simple single-page website that features a visually engaging JavaScript animation, such as a custom progress bar or a parallax background, implemented strictly using requestAnimationFrame for performance. Ensure the underlying HTML structure uses semantic tags and includes necessary ARIA labels to achieve a 100% Accessibility score in a tool like Lighthouse. Additionally, implement full SEO optimization by adding correct meta descriptions, Open Graph tags, and structured data snippets.
>
> **HTTP versions MID**

1.  **HTTP/1.x Fundamentals & Limitations**

-   Text-based protocol structure and readability

-   Persistent connections (Keep-Alive) vs. ephemeral

-   Head-of-Line (HOL) blocking at the application layer

-   Caching strategies and control headers

-   Common workarounds: Domain sharding and sprinting

2.  **HTTP/2 Architecture**

-   Binary framing layer vs. text-based parsing

-   Request multiplexing over a single TCP connection

-   Header compression using HPACK algorithm

-   Server Push capabilities and use cases

-   Stream dependencies and prioritization

3.  **HTTP/3 & QUIC Protocol**

-   Transitioning transport from TCP to UDP (QUIC)

-   Solving Transport-layer Head-of-Line blocking

-   Connection migration and resilience (Client IDs)

-   Zero-RTT (0-RTT) handshakes and TLS 1.3

-   QPACK header compression dynamics

General

**Semver JUN**

1.  **Core SemVer Logic (Major.Minor.Patch)**

-   Breaking changes vs backward compatibility

-   Significance of the Public API definition

-   Initial development phase (0.y.z) behavior

-   Patch versioning for internal bug fixes

-   Resetting logic when incrementing higher numbers

2.  **Pre-release Labels & Build Metadata**

-   Modifiers for unstable versions (alpha, beta, rc)

-   Build metadata syntax (plus sign usage)

-   Sorting and precedence rules for pre-releases

-   Transitioning from Release Candidate to Stable

-   Valid characters and formatting rules

3.  **Version Ranges & Dependency Management**

-   Caret (\^) vs. Tilde (\~) nuances

-   Hyphen ranges and wildcard (\*) usage

-   Pinning versions for build reproducibility

-   Peer dependencies and compatibility matrices

-   Lockfiles and resolution determinism

4.  **Automation Tools & Workflows**

-   Conventional Commits specification

-   Automated versioning tools (semantic-release, standard-version)

-   CI/CD integration for auto-tagging and changelogs

-   Language-specific tools (npm version, cargo release)

-   Managing monorepo versioning strategies

**Task: I**nitialize a dummy git repository and simulate a project history by creating a series of empty commits that follow the Conventional Commits standard (e.g., fix:, feat:, feat!: ). Manually or using a tool like standard-version, calculate the correct Semantic Version number for the project after each commit to see how it transitions from 0.1.0 to 1.0.0 and beyond. Create a scenario specifically designed to trigger a Major version bump due to a breaking change and verify that the Minor and Patch numbers reset correctly. Finally, generate a CHANGELOG.md file that automatically groups these commits under the correct SemVer headers.


**Task:** Create a Node.js package versioning simulation: start with version 1.0.0, then walk through a series of changes (bug fix, new feature, breaking API change, pre-release) and determine the correct version bump for each. Write a script that validates semver ranges (^1.2.3, ~1.2.3, >=1.0.0 <2.0.0) against a list of available versions and returns which versions satisfy each range. Document the difference between ^, ~, and exact version pinning with real-world examples.

**Git JUN**

1.  **Git Architecture & Core Concepts**

-   The Three States: Working Directory, Staging Area, Repository

-   Anatomy of a commit (Hashes, Parents, Tree objects)

-   Understanding HEAD and Detached HEAD state

-   Remote repositories and tracking branches

-   .gitignore patterns and hierarchy

2.  **Essential Workflow Commands**

-   Staging strategies: git add vs git add -p

-   Synchronization: fetch vs pull vs clone

-   Inspecting state: status, log, and diff

-   Stashing work-in-progress changes

-   Managing remotes and upstream tracking

3.  **Branching & Merging Mechanics**

-   Creating, switching, and deleting branches

-   Fast-forward vs. Recursive merge strategies

-   Resolving merge conflicts manually

-   Git Flow vs. Trunk-based development patterns

-   Pull Request / Merge Request workflows

4.  **Rebasing & History Rewriting**

-   git rebase vs. git merge trade-offs

-   Interactive rebase (squash, fixup, reword, drop)

-   Modifying the most recent commit with \--amend

-   Reset modes: Soft, Mixed, and Hard

-   Safety rules for rewriting public history

5.  **Advanced Flags & Debugging Tools**

-   Force pushing safely: \--force vs \--force-with-lease

-   Debugging regressions with git bisect

-   recovering \"lost\" commits using git reflog

-   Log filtering options (\--graph, \--oneline, \--author)

-   Cherry-picking specific commits across branches

**Task:** Initialize a local repository and simulate a messy development process by creating a feature branch with several small, disorganized commits (e.g., \"wip\", \"typo\", \"fix\"). Perform an interactive rebase on this branch to tidy the history: squash related commits together, reword unclear messages, and drop unnecessary checkpoints. Once the history is clean and linear, merge the branch into main and use git reflog to locate the state of the branch prior to the rebase, demonstrating how Git tracks history rewriting.

**Encryption / Encoding JUN**

1.  **Symmetric vs. Asymmetric Encryption**

-   Shared secret keys (AES, DES) vs Key pairs (RSA, ECC)

-   Computational performance and speed differences

-   Key exchange challenges (Diffie-Hellman)

-   Hybrid encryption models (e.g., in TLS/SSL)

-   Perfect Forward Secrecy concepts

2.  **Public Key Infrastructure (PKI) & Signatures**

-   Digital signatures for integrity and non-reputation

-   Certificate Authorities (CA) and chains of trust

-   Public key distribution and verification

-   Encrypting with private vs. public keys

-   Man-in-the-Middle (MitM) attack vectors

3.  **Unicode & UTF-8 Architecture**

-   ASCII compatibility and variable-width encoding

-   Code points, grapheme clusters, and planes

-   Byte Order Marks (BOM) and endianness

-   Handling multi-byte characters (emojis, CJK)

-   Common encoding errors (Mojibake)

4.  **Base64 & Binary-to-Text Schemes**

-   Mechanism: Mapping binary data to 64 printable characters

-   The role of padding characters (=)

-   Size overhead (approx. 33% increase)

-   URL-safe Base64 variants

-   Use cases: Data URIs, Authorization headers, Email attachments

5.  **Encoding vs. Encryption vs. Hashing**

-   Reversibility: One-way (Hash) vs Two-way (Encode/Encrypt)

-   Purpose: Confidentiality vs Format compatibility

-   Collision resistance in hashing

-   Salt and Pepper in password hashing

-   Common misconceptions and security risks

**Task:** Write a script that implements a hybrid encryption workflow to secure a sensitive text string. First, encode the string into Base64 to ensure it is safe for transport, then encrypt the result using a symmetric algorithm like AES-256. Finally, generate an RSA key pair and use the public key to encrypt the symmetric AES key, simulating how HTTPS protects session keys during a handshake. Print the final encrypted bundle and write a reverse function that uses the private key to decrypt the package back to the original text.

**Computer Science Concepts JUN**

1.  **Big O Notation & Algorithmic Complexity**

-   Time complexity (O(1), O(n), O(logn)) vs Space complexity

-   Worst, Average, and Best-case scenarios

-   Analyzing nested loops and recursive functions

-   Impact of constants and lower-order terms

-   Scalability limits in large datasets

2.  **Hashing Internals & Data Structures**

-   Hash functions: Determinism and Uniformity

-   Collision resolution: Chaining vs Open Addressing

-   Load factor and dynamic resizing costs

-   Cryptographic vs non-cryptographic hashes

-   Use cases: Distributed caches, Sets, Database indexing

3.  **Concurrency vs. Parallelism**

-   Logical concurrency vs physical parallelism

-   Amdahl's Law and speedup limitations

-   I/O bound vs CPU bound task optimization

-   Race conditions and critical sections

-   Hardware implications (Multi-core processors)

4.  **Process vs. Thread Architecture**

-   Shared memory (Threads) vs Isolated memory (Processes)

-   Context switching overhead and performance

-   User-level threads vs Kernel-level threads

-   The Global Interpreter Lock (GIL) in specific languages

-   Lifecycle: Creation, Execution, Termination

5.  **Synchronization & Safety Mechanisms**

-   Mutexes, Semaphores, and Monitors

-   Deadlock detection and prevention strategies

-   Livelock and Starvation scenarios

-   Atomic operations and memory consistency

-   Inter-Process Communication (IPC) techniques


**Task:** Implement a basic hash table from scratch supporting insert, lookup, and delete operations with collision handling via chaining. Then write a comparison script that benchmarks your hash table against a binary search tree for 10,000 random key lookups, measuring time complexity in practice. Document the Big-O complexities of each operation for both data structures.

**Git Submodules MID**

1.  **Anatomy & Configuration of Submodules**

-   The role and structure of the .gitmodules file

-   Submodules as pointers to specific commit hashes

-   Understanding the detached HEAD state

-   Gitlink entries in the tree object

-   Relative vs. absolute URL paths

2.  **Adding and Cloning Workflows**

-   Adding dependencies: git submodule add

-   Recursive cloning strategies (\--recurse-submodules)

-   The two-step initialization: git submodule init + update

-   Handling nested submodules (submodules within submodules)

-   Troubleshooting empty directories after clone

3.  **Synchronization & Updates**

-   Updating pointers with git submodule update \--remote

-   Fetching upstream changes without checking out

-   The foreach command for batch operations

-   Syncing configuration changes (git submodule sync)

-   Strategies for tracking specific branches

4.  **Development Lifecycle**

-   Committing and pushing changes from inside a submodule

-   The \"Parent Pointer\" pitfall (pushing parent before child)

-   resolving merge conflicts in .gitmodules

-   Converting a subdirectory into a submodule

-   Consuming library updates in the parent repo

5.  **Removal and Cleanup**

-   Proper de-initialization using git submodule deinit

-   Cleaning up the .git/modules storage

-   Removing cached index entries

-   Handling \"dirty\" submodule states during cleanups

-   Submodules vs. Git Subtree comparison

**Task:** Create two separate git repositories: a \"MainApp\" and a \"SharedLib.\" Add \"SharedLib\" as a submodule into \"MainApp\" and commit the configuration change. Make a code change inside the \"SharedLib\" folder, push it to its own remote, and then go back to the \"MainApp\" root to commit the updated submodule pointer. Finally, clone the \"MainApp\" to a new location to practice the restoration process, using git submodule update \--init \--recursive to hydrate the empty submodule folder.

DevOps

**AWS JUN**

1.  **S3 Fundamentals (The Core)**

-   Buckets vs. Objects concept

-   Creating a bucket and naming conventions (Global uniqueness)

-   Uploading, downloading, and deleting files via Console

-   Understanding S3 Standard storage class

-   Enabling Static Website Hosting

2.  **IAM & Access Control for S3**

-   Bucket Policies (Resource-based) vs. IAM Policies (Identity-based)

-   Public vs. Private access settings (Block Public Access)

-   Creating an IAM User with AmazonS3ReadOnlyAccess

-   Understanding the \"Principal\" element in policies

-   Debugging \"403 Access Denied\" errors

3.  **ECS & S3 Integration**

-   Separation of concerns: Static assets (S3) vs. Application logic (ECS)

-   Injecting configuration files from S3 into containers

-   Using S3 as a shared storage volume (via mountpoints)

-   Handling large file uploads from an ECS application to S3

-   Security: Task Roles vs. Hardcoded credentials

4.  **ECR vs. S3: Storage Distinctions**

-   Use cases: Docker Images (ECR) vs. General Files (S3)

-   Why you shouldn\'t store docker images in S3 manually

-   CI/CD pipelines: Pushing code to S3 vs. pushing images to ECR

-   Artifact storage strategies

-   Cost differences for storage and data transfer

5.  **EC2 & S3 Access Patterns**

-   The role of EC2 Instance Profiles (avoiding access keys)

-   Installing and using the AWS CLI (aws s3) on Linux

-   Copying files between EC2 and S3 (cp, sync)

-   Bootstrapping EC2 instances using scripts stored in S3

-   Performance: S3 Endpoints (VPC Gateway)

6.  **SES (Simple Email Service) & S3**

-   Receiving emails and saving raw content to an S3 bucket

-   Setting up the required Bucket Policy for SES writing

-   Lifecycle rules for archiving email data

-   Triggering workflows upon email receipt

-   Use cases: Contact forms, processing attachments

7.  **Lambda & S3 Triggers**

-   The concept of Event-Driven Architecture

-   Configuring S3 Event Notifications (s3:ObjectCreated)

-   The event object structure in Lambda (finding the bucket and key)

-   Avoiding recursive loops (Outputting to the same bucket)

-   Use case: Automatic image resizing or file validation

8.  **CloudWatch & S3 Observability**

-   Monitoring Bucket metrics (StorageSizeBytes, NumberOfObjects)

-   Setting up CloudWatch Alarms for rapid storage growth

-   S3 Server Access Logs vs. CloudTrail Data Events

-   Analyzing 4xx and 5xx error rates

-   Cost monitoring alerts

**Task:** Create a simple \"Image Gallery\" backend using S3 and Lambda. First, create two S3 buckets: one named source-images-\[yourname\] and another processed-images-\[yourname\]. Configure an AWS Lambda function to trigger specifically when a new object is created in the source bucket. Write a script in the Lambda function that simply copies the newly uploaded file from the source bucket to the processed bucket, effectively \"backing it up\" automatically. Verify the setup by uploading a test.jpg to the source bucket and confirming it appears in the processed bucket within seconds.

**Kubernetes JUN**


1.  **Kubernetes Core & Architecture**

-   Orchestration vs. Virtualization

-   Declarative configuration vs. Imperative commands

-   Control Plane components: API Server, Scheduler, Controller Manager

-   The role of etcd: Distributed key-value backing store

-   Worker Node components: Kubelet and Kube-proxy

2.  **Workloads: Pods & Nodes**

-   The Pod as the atomic unit of deployment

-   Ephemeral nature and Pod lifecycle phases

-   Multi-container pods and the Sidecar pattern

-   Node capacity, allocatable resources, and status

-   Liveness and Readiness probes

3.  **Controllers: Deployments & ReplicaSets**

-   The reconciliation loop: Desired vs. Actual state

-   ReplicaSets: Ensuring high availability and scaling

-   Deployment strategies: Rolling Updates vs. Recreate

-   Managing rollouts and history/rollbacks

-   Labels and Selectors matching logic

4.  **Service & Networking**

-   Service abstraction: Stable IPs for dynamic Pods

-   Service Types: ClusterIP, NodePort, LoadBalancer

-   Internal Service Discovery (DNS)

-   Kube-proxy: iptables vs. IPVS modes

-   Ingress fundamentals (optional but related)

5.  **Namespaces & Multi-tenancy**

-   Logical partitioning of cluster resources

-   Resource Quotas and Limit Ranges

-   Scoping objects (Namespaced vs. Cluster-wide)

-   DNS naming conventions across namespaces

-   Best practices for environment isolation (Dev/Prod)

6.  **Configuration & Secrets**

-   Decoupling configuration from container images

-   ConfigMap usage: Environment variables vs. Volume mounts

-   Secrets management: Base64 encoding vs. Encryption

-   Immutable configuration patterns

-   Injecting sensitive data securely

**Task:** Set up a local Kubernetes cluster using a tool like Minikube, Kind, or Docker Desktop. Create a YAML Deployment file for a simple web server (like Nginx) and use a ConfigMap to inject a custom index.html file that replaces the default welcome page via a volume mount. Apply the configuration to the cluster, expose the application using a NodePort Service, and verify the custom page is accessible in your browser. Finally, manually delete one of the running Pods to witness the ReplicaSet automatically creating a new one to maintain the defined state.

**CI/CD JUN**

1.  **Core Concepts of CI/CD**

-   Continuous Integration: Merging code changes frequently

-   Continuous Delivery vs. Continuous Deployment differences

-   Solving \"Integration Hell\" with automated checks

-   The feedback loop: Fail fast, fix fast

-   Immutable artifacts and reproducibility

2.  **Anatomy of CI/CD Stages**

-   Source: Triggers based on git events (push, pull request)

-   Build: Compiling code and installing dependencies

-   Test: Unit testing, linting, and static code analysis

-   Deploy: Pushing to Staging vs. Production environments

-   Cleanup: Cache management and workspace teardown

3.  **Writing & Configuring Pipelines**

-   YAML syntax fundamentals (structure, arrays, key-value)

-   Defining Jobs, Steps, and dependencies (needs)

-   Choosing runners (Ubuntu, Windows, Self-hosted)

-   Managing secrets (API keys) and environment variables

-   Artifacts: Passing data between different jobs

**Task:** Create a public GitHub repository containing a simple \"Hello World\" script. Set up a GitHub Actions workflow file (inside .github/workflows/) that triggers automatically on every push to the main branch. Configure the pipeline to run two sequential jobs: a \"Build\" job that simply installs dependencies (or prints a dummy message), and a \"Test\" job that executes your script. Finally, intentionally break your script\'s syntax and push the change to witness the pipeline fail in the \"Actions\" tab, verifying the automated feedback loop.

**Tracing JUN**

1.  **Tracing vs. Logging vs. Metrics**

-   The three pillars of observability

-   Why logs aren\'t enough for microservices

-   Visualizing the request lifecycle across systems

-   Structured data vs unstructured text

-   Cost and storage considerations

2.  **Anatomy of a Trace**

-   The \"Trace\" as the full journey

-   \"Spans\" as individual units of work

-   Parent-child relationships between spans

-   Trace IDs and Span IDs

-   Adding metadata: Tags, Logs, and Events

3.  **Context Propagation**

-   Passing IDs across service boundaries

-   HTTP headers standards (W3C Trace Context, B3)

-   Distributed context injection and extraction

-   Handling asynchronous operations

-   Preventing broken traces

4.  **Use Cases: When to Apply Tracing**

-   Debugging latency and performance bottlenecks

-   Root cause analysis in microservices

-   Analyzing database query performance

-   visualizing critical paths (waterfall graphs)

-   Error tracking across boundaries

5.  **Tools & The OpenTelemetry Standard**

-   OpenTelemetry (OTel) as the vendor-neutral standard

-   Instrumentation: Auto (Agents) vs Manual (Code)

-   Backend visualization tools: Jaeger, Zipkin

-   Cloud-native options: AWS X-Ray, Google Cloud Trace

-   Sampling strategies (Head vs Tail sampling)

**Task:** Create a simple application with a single HTTP endpoint that simulates a delay (e.g., using setTimeout or sleep) to mimic a slow database query. Configure the application to use OpenTelemetry libraries to auto-instrument the HTTP layer and export the data. Spin up a local instance of Jaeger using Docker, then trigger your API endpoint and open the Jaeger UI to find the specific Trace ID and visualize the \"waterfall\" graph of the request duration.

**DOCKER JUN**

1.  **Docker Images & Architecture**

-   Difference between Images (Build time) and Containers (Run time)

-   Anatomy of a Dockerfile (FROM, COPY, RUN, CMD)

-   The Layered File System and caching strategy

-   Registry operations (Push, Pull, Docker Hub)

-   Tagging conventions (semantic versioning vs latest)

2.  **Volumes & Data Persistence**

-   The ephemeral nature of container filesystems

-   Docker Volumes (Managed) vs Bind Mounts (Host-mapped)

-   Persisting database data across container restarts

-   Sharing data between multiple containers

-   Volume lifecycle management (create, inspect, prune)

3.  **Networking Fundamentals**

-   Port mapping (-p host:container) to expose services

-   The default Bridge network vs User-defined networks

-   Container-to-container communication via DNS names

-   Host network mode limitations and use cases

-   Troubleshooting connection issues (inspecting networks)

4.  **Docker Compose Orchestration**

-   Declarative infrastructure using YAML

-   Defining multi-container services (App + Database)

-   Managing environment variables (.env files)

-   Service dependencies and startup order (depends\_on)

-   Lifecycle commands (up, down, build, logs)

**Task:** Create a Dockerfile for a simple \"Hello World\" web server and build the image locally. Next, write a docker-compose.yml file that defines two services: your web application and a Redis database instance. Configure the setup so the web app connects to Redis using the hostname redis (relying on Docker\'s internal DNS) and map a host directory to the web container using a volume to allow live code reloading. Run docker-compose up to start the stack and verify that changes to your local code reflect instantly in the running container without rebuilding.

**Monitoring JUN**

1.  **Common Ecosystem Tools**

-   Prometheus: Standard for metric scraping and storage

-   Grafana: Industry leader for visualization

-   ELK Stack (Elasticsearch, Logstash, Kibana): Log analysis

-   Datadog / New Relic: SaaS APM solutions

-   CloudWatch / Stackdriver: Native cloud provider tools

**Task:** Use Docker Compose to spin up a local instance of Prometheus and Grafana. Create a simple script that runs an HTTP server exposing a /metrics endpoint, which returns a random number simulating \"Current Active Users\" formatted for Prometheus. Configure prometheus.yaml to scrape your script every 5 seconds, then connect Prometheus as a data source in Grafana. Finally, build a dashboard that creates a line graph of your random user count and adds a red threshold line that visually indicates when \"traffic\" is too high.

**AWS MID**

1.  **SQS (Advanced Patterns)**

-   Standard vs. FIFO: Ordering guarantees and throughput limits

-   Visibility Timeout mechanisms and handling processing failures

-   Implementing Dead Letter Queues (DLQ) for redrive policies

-   Short Polling vs. Long Polling (Cost and latency implications)

-   Message Group IDs and Deduplication logic

2.  **RDS (Scaling & Resilience)**

-   Multi-AZ deployments for High Availability and failover

-   Read Replicas: Offloading read traffic and promotion strategies

-   RDS Proxy: Connection pooling for serverless applications

-   Backup strategies: Snapshots, Automated backups, and Point-in-Time Recovery

-   Storage Auto Scaling and IOPS provisioning

3.  **Lambda (Optimization & Integration)**

-   Lifecycle phases: Cold starts vs. Warm starts

-   Provisioned Concurrency vs. Reserved Concurrency

-   Lambda Layers for dependency management and code sharing

-   Configuring Destinations for asynchronous success/failure handling

-   VPC integration: ENIs and accessing private resources

4.  **Route53 (Traffic Management)**

-   Routing Policies: Weighted, Latency, Failover, and Geolocation

-   Setting up Health Checks for automatic DNS failover

-   Alias Records vs. CNAME: Apex domain handling

-   Split-horizon DNS (Public vs. Private Hosted Zones)

-   Traffic flow visualizer and policy records

5.  **Amazon Cognito (Identity Security)**

-   User Pools (Authentication) vs. Identity Pools (Authorization)

-   The JWT structure: ID, Access, and Refresh tokens

-   Customizing workflows with Lambda Triggers (Pre-sign-up, Post-auth)

-   Social Federation and Identity Providers (IdP)

-   Hosted UI customization and domain configuration

6.  **VPC & Networking Architecture**

-   Subnet design: Public (IGW) vs. Private (NAT Gateway)

-   Security Groups (Stateful) vs. Network ACLs (Stateless)

-   VPC Peering and Transit Gateway architectures

-   VPC Endpoints (Interface vs. Gateway) for private AWS service access

-   VPN and Direct Connect basics

7.  **EKS (Elastic Kubernetes Service)**

-   Control Plane (Managed) vs. Data Plane (Self-managed/Fargate)

-   IAM Roles for Service Accounts (IRSA) implementation

-   The VPC CNI plugin and IP address management

-   Cluster upgrades and node group lifecycle management

-   Integrating with AWS Load Balancer Controller

8.  **SNS (Messaging & Fan-out)**

-   Pub/Sub architecture implementation

-   The Fan-out pattern: SNS to multiple SQS queues

-   Message Filtering policies to reduce subscriber traffic

-   Mobile Push Notifications and SMS delivery

-   Protocol support: HTTP/S, Email, SQS, Lambda

**Task:** Design and implement a \"Fan-Out\" messaging architecture to handle system events. Create a single SNS Topic named SystemAlerts and subscribe two separate SQS Queues to it: AllLogsQueue and CriticalAlertsQueue. Configure a Subscription Filter Policy on the CriticalAlertsQueue so that it only accepts messages where the attribute severity is set to high, while the other queue receives everything. Publish a test message with severity: high and another with severity: low to the SNS topic, then poll both queues to verify that the filtering logic correctly routed the messages.

**Kubernetes MID**

1.  **Health Checks & Probes**

-   Purpose of Liveness (restart loop) vs. Readiness (traffic flow)

-   Probe types: HTTP Request, TCP Socket, and Command execution

-   Configuring initialDelaySeconds and periodSeconds

-   Handling container startup latency with Startup Probes

-   Debugging \"CrashLoopBackOff\" caused by failed probes

2.  **Horizontal Pod Autoscaler (HPA)**

-   Scaling logic based on CPU and Memory usage

-   The requirement of Metrics Server in the cluster

-   Defining Resource Requests and Limits for HPA to work

-   Minimum vs. Maximum replica constraints

-   Basic imperative commands (kubectl autoscale)

3.  **Specialized Workloads**

-   **DaemonSet**: Running a pod on every node (e.g., logging agents)

-   **StatefulSet**: Managing apps requiring stable network IDs and storage

-   **Job**: Run-to-completion tasks (one-off processes)

-   **CronJob**: Time-based scheduling (syntax similar to Linux cron)

-   When to use these instead of a standard Deployment

4.  **Ingress & Networking**

-   Difference between Service (Layer 4) and Ingress (Layer 7)

-   Ingress Controllers (Nginx, Traefik) basics

-   Path-based (/api, /app) vs. Host-based (app.example.com) routing

-   Terminating TLS/SSL at the Ingress level

-   Concept of the \"Default Backend\"

5.  **Persistent Storage (PV & PVC)**

-   Decoupling storage: PersistentVolume (Admin) vs. Claim (Dev)

-   Access Modes: ReadWriteOnce (RWO) vs. ReadWriteMany (RWX)

-   Storage Classes and dynamic provisioning

-   The lifecycle of volume binding and reclaiming

-   Persisting data across Pod restarts and deletions

6.  **Helm Fundamentals**

-   Helm as the \"Package Manager\" for Kubernetes

-   Structure of a Chart (Chart.yaml, values.yaml, templates/)

-   Injecting variables from values.yaml into manifest templates

-   Installing, upgrading, and listing releases via CLI

-   Using public repositories (Artifact Hub)

**Task:** Create a basic Helm chart structure for a static Nginx web server. Modify the deployment.yaml template to include a **Liveness Probe** that checks the root path (/) every 10 seconds, and add a **PersistentVolumeClaim** to mount a volume at /usr/share/nginx/html. Install this chart to a local cluster (like Minikube), create an index.html file inside the mounted volume, and then manually delete the Pod. Verify that when the new Pod starts up (managed by the ReplicaSet), it still serves the custom index file you created, proving the storage persistence works.

**Deployment strategies MID**

1.  **Blue/Green Deployment Strategy**

-   Concept: Two identical environments (Active vs. Idle)

-   The Switching Mechanism: Router/Load Balancer pointer change

-   Immediate Rollback capabilities (Switching back)

-   Resource implications: Requiring double the infrastructure

-   Handling database compatibility (Shared database challenges)

2.  **Canary & Rolling Updates**

-   Rolling Update: Incrementally replacing old instances with new ones

-   Canary Release: Exposing changes to a small % of users first

-   A/B Testing vs. Canary: Business metrics vs. Stability metrics

-   Traffic splitting concepts (Weighted routing)

-   Automated promotion criteria (e.g., \"If \< 1% errors, proceed\")

3.  **Recreate Strategy**

-   The \"Stop the World\" approach: Shutdown V1, then Start V2

-   Managing Downtime: Maintenance pages and 503 errors

-   Pros: Simplicity and zero resource overhead

-   Cons: User service interruption

-   Ideal use cases: Non-production environments or major breaking changes

4.  **One Service - Multiple Deployments**

-   Running parallel versions (e.g., Staging, Prod, Beta)

-   Configuration management: Same code, different environment variables

-   Feature Preview environments (Deployments per Pull Request)

-   Isolation of resources (Separate databases vs. Shared)

-   Namespace separation in tools like Kubernetes

5.  **Deployment Monitoring Basics**

-   Critical metrics: HTTP Error rates (5xx) and Latency

-   Health Checks: Liveness (Am I crashing?) vs. Readiness (Can I take traffic?)

-   Logging: Comparing error logs before and after deployment

-   Smoke Tests: Verifying core functionality immediately after launch

-   Defining the \"Rollback threshold\"

**Task:** Create two simple Docker containers running a web server: one printing \"Version 1\" (Blue) and the other \"Version 2\" (Green). Set up a local Nginx instance acting as a reverse proxy that initially forwards all traffic to the \"Version 1\" container. While keeping a continuous script running that requests the page every second, modify the Nginx configuration to point to \"Version 2\" and reload the service. Observe how the output changes from \"Version 1\" to \"Version 2\" with minimal or no failed requests, effectively simulating the \"Switch\" phase of a Blue/Green deployment.

**NGINX MID**

1.  **Nginx Architecture & Configuration**

-   Structure of nginx.conf: http, server, and location blocks

-   Directive syntax and inheritance rules

-   Serving static files (root vs alias)

-   Index files and directory listing (autoindex)

-   Variable usage (e.g., \$host, \$remote\_addr)

2.  **Connection Processing Basics**

-   Master process vs. Worker processes

-   Event-driven, non-blocking architecture explained simply

-   Configuring worker\_processes and worker\_connections

-   Handling high concurrency with low memory usage

-   Timeouts and Keep-Alive settings

3.  **Hashing in Nginx**

-   ip\_hash for load balancing sticky sessions

-   Server names hash bucket size errors and fixes

-   Hash table performance for static lookups

-   load balancing distribution mechanisms

-   Caching keys and hash generation

4.  **Logging & Debugging Tools**

-   Access logs vs. Error logs differences

-   Validating syntax with nginx -t

-   Customizing log formats (log\_format)

-   Debugging common status codes (403 Forbidden, 502 Bad Gateway)

-   Reloading config without downtime (nginx -s reload)

5.  **HTTPS Implementation**

-   Configuring the listen 443 ssl directive

-   Specifying ssl\_certificate and ssl\_certificate\_key paths

-   Redirecting HTTP traffic to HTTPS (Return 301)

-   Generating self-signed certificates for local development

-   Basic SSL protocols and ciphers configuration

6.  **Load Balancing Fundamentals**

-   Defining upstream groups for backend servers

-   The proxy\_pass directive mechanism

-   Default Round-Robin distribution

-   Handling backend failures (Passive health checks)

-   Setting up a simple reverse proxy

**Task:** Install Nginx locally or run it via a Docker container and configure a custom server block to serve a static HTML \"Welcome\" page on port 8080. Modify the configuration to create a second server block on port 80 that acts as a reverse proxy, forwarding all traffic to your static site on port 8080. deliberate introduce a syntax error in your configuration file and use the nginx -t command to identify and fix it. Finally, access your site through the proxy and check the access.log to verify that the request was successfully forwarded and recorded.

**Terraform MID**

1.  **Core Concepts & HCL Syntax**

-   Providers: Interfacing with APIs (AWS, Azure, Docker)

-   Resources vs. Data Sources: Creating vs. Reading

-   Declarative nature: Describing \"What\" instead of \"How\"

-   The anatomy of a .tf file and HCL structure

-   Dependency management (implicit vs. explicit depends\_on)

2.  **State Management Fundamentals**

-   Purpose of terraform.tfstate: Mapping real-world ID to config

-   Local state vs. Remote state (S3, Consul, Terraform Cloud)

-   State locking to prevent concurrent corruption (DynamoDB)

-   Handling sensitive data in state files

-   Refreshing state and drift detection

3.  **Modules & Reusability**

-   The DRY (Don\'t Repeat Yourself) principle in IaC

-   Anatomy of a module: Inputs (variables), Resources, Outputs

-   Root module vs. Child modules hierarchy

-   Sourcing modules from the Terraform Registry vs. Git

-   Versioning and pinning module sources

4.  **Deployment Lifecycle & Workflow**

-   The standard workflow: init -\> plan -\> apply -\> destroy

-   Understanding the Execution Plan (Add, Change, Destroy)

-   Automation with CI/CD pipelines

-   Handling \"Drift\": When reality diverges from configuration

-   Immutable infrastructure concepts

5.  **Provisions & Bootstrapping**

-   The \"Last Resort\" rule for Provisioners

-   local-exec (running scripts on the machine running Terraform)

-   remote-exec (running scripts on the target resource)

-   Connection blocks and SSH handling

-   Better alternatives: Cloud-init, User Data, Packer images

6.  **Scaling & Logic**

-   Using count for simple replication

-   Using for\_each for map/set based replication

-   Dynamic blocks for repeating nested configurations

-   Conditional creation logic using ternary operators

-   Splat expressions (\[\*\]) for handling lists of resources

**Task:** Install Terraform and create a project that uses the kreuzwerker/docker provider to provision a local Nginx container. Create a variables.tf file to define the container name and host port, and an outputs.tf file to display the container\'s ID and IP address after creation. Run the full lifecycle (init, plan, apply) to start the container, then manually delete the container from Docker Desktop and run terraform apply again to demonstrate how Terraform detects drift and self-heals the state. Finally, use terraform destroy to remove all resources.

Message Brokers

**Kafka JUN**

1.  **Core Principles & Architecture**

-   Publish-Subscribe (Pub/Sub) messaging model

-   Decoupling Producers from Consumers

-   The \"Commit Log\" storage mechanism (Append-only)

-   Event streaming vs. Traditional queuing

-   High throughput and low latency design

2.  **Topics & Data Organization**

-   Topics as logical categories for messages

-   Retention policies (Time-based vs. Size-based)

-   Message immutability (cannot change written data)

-   Key-Value structure of Kafka messages

-   Log compaction basics

3.  **Partitions & Parallelism**

-   Breaking topics into Partitions for scaling

-   Ordering guarantees (Strict order only within a partition)

-   Distribution of data across the cluster

-   Round-robin vs. Key-based partitioning strategies

-   The relationship between Partitions and Consumer throughput

4.  **Brokers & Clusters**

-   The Broker node: Storing data and serving requests

-   Replication Factor: Data durability and redundancy

-   Leader vs. Follower replicas

-   In-sync Replicas (ISR) lists

-   Handling broker failure (Failover)

5.  **Offsets & Consumer Mechanics**

-   Offset: The unique ID/sequence number of a message

-   Consumer Groups for load balancing

-   Committing offsets (Auto-commit vs. Manual commit)

-   Resetting offsets (Replaying data from start)

-   Concept of \"Consumer Lag\"

6.  **Zookeeper vs. KRaft**

-   Zookeeper\'s legacy role: Managing cluster metadata

-   Controller election and broker registration

-   The move to KRaft (Kafka Raft Metadata mode)

-   Removing the external Zookeeper dependency

-   Storing metadata in an internal topic

**Task:** Use Docker Compose to spin up a single-node Kafka cluster (using either Zookeeper or KRaft mode) and a UI tool like Kafka-UI or use the built-in CLI tools. Create a new topic named user-logins with 3 partitions and a replication factor of 1. Open two separate terminal windows: use one to act as a Producer sending text messages to the topic, and the other as a Consumer reading them in real-time. Finally, restart the Consumer with the \--from-beginning flag to observe how Kafka retains the message history based on the stored offsets.

**Common principles and patterns JUN**

1.  **Producer Fundamentals**

-   Role and responsibility: Publishing events to the broker

-   Message anatomy: Payload, Headers, and Properties

-   Serialization formats: JSON vs. Protobuf/Avro

-   Fire-and-forget vs. Request-Reply patterns

-   Handling publication errors and retries

2.  **Consumer Mechanics**

-   Push-based vs. Pull-based (Polling) consumption

-   The Competing Consumers pattern for scaling

-   Consumer Groups and load distribution

-   Handling idempotency: Processing duplicates safely

-   Prefetch limits and backpressure control

3.  **Acknowledgement & Reliability**

-   The concept of \"ACK\" (Success) and \"NACK\" (Failure)

-   Auto-acknowledgement vs. Manual acknowledgement

-   Delivery Guarantees: At-most-once vs. At-least-once

-   Message Visibility Timeouts and redelivery logic

-   Dead Letter Queues (DLQ) for handling poison messages

**Task:** Using a local message broker like Kafka or a cloud mock, write a script that sends 10 tasks to a queue. Create a consumer that reads these tasks but is programmed to crash (throw an exception) specifically on the 5th message, while successfully acknowledging the others. Configure the consumer to use Manual Acknowledgement mode so that the failed message is not lost but returned to the queue. Restart the consumer script and verify that the crashed message is redelivered and processed successfully on the second attempt.

**RabbitMQ JUN**


1.  **Core Principles & AMQP Model**

-   Producer, Broker, and Consumer roles

-   Decoupling applications via asynchronous messaging

-   The AMQP 0-9-1 Protocol fundamentals

-   Connection vs. Channel concepts

-   Virtual Hosts (vhost) for isolation

2.  **Exchanges & Routing Logic**

-   The Exchange as the \"Mailman\" (Routing agent)

-   Direct Exchange: Exact matching of routing keys

-   Fanout Exchange: Broadcasting to all bound queues

-   Topic Exchange: Pattern matching with wildcards (\*, \#)

-   Bindings: The link between Exchange and Queue

3.  **Queues & Buffering**

-   First-In-First-Out (FIFO) structure

-   Connecting Queues to Exchanges via Bindings

-   Exclusive vs. Shared queues

-   Auto-delete queues (cleanup after use)

-   Round-robin dispatching to multiple consumers

4.  **Durability & Persistence**

-   Durable Queues: Preserving queue metadata (definition) across restarts

-   Persistent Messages: Saving message data to disk (Delivery Mode 2)

-   Transient vs. Persistent trade-offs (Speed vs. Safety)

-   What happens when a Broker crashes (RAM vs Disk)

-   Lazy Queues (Storing messages on disk by default)

**Task:** Start a RabbitMQ instance using Docker. Write a simple script that declares a durable queue and publishes a specific message marked with delivery\_mode=2 (Persistent). Once sent, manually restart the Docker container to simulate a server crash. Finally, run a consumer script to connect to that same queue and confirm the message is received, proving that both the queue definition and the message data survived the restart.

**Kafka MID**

1.  **Offset Control & Consumer Progress**

-   Auto-commit (enable.auto.commit) vs. Manual commit

-   The role of the internal \_\_consumer\_offsets topic

-   Synchronous (commitSync) vs. Asynchronous (commitAsync) commits

-   Handling offsets during a Consumer Rebalance

-   Reset strategies: earliest, latest, and none

2.  **Partitioning Strategies**

-   The role of the Message Key in routing

-   Default Partitioner: Sticky Partitioning vs. Round-Robin

-   Guaranteeing message ordering within a partition

-   Handling \"Hot Partitions\" and data skew

-   Implementing a custom partitioner class

3.  **Acknowledgement Modes (Acks)**

-   acks=0: Fire-and-forget (No guarantee, low latency)

-   acks=1: Leader acknowledgement only (Basic durability)

-   acks=all (or -1): Full ISR replication (Max durability)

-   Impact of min.insync.replicas on availability

-   Trade-offs between Throughput and Data Safety

4.  **Idempotent Producer**

-   Achieving \"Exactly-Once\" semantics at the producer level

-   How Sequence Numbers and Producer IDs (PID) work

-   The configuration enable.idempotence=true

-   Deduplication logic on the Broker side

-   Safe retries without creating duplicate messages

5.  **Message Headers & Metadata**

-   Attaching Key-Value metadata pairs to messages

-   Use cases: Distributed Tracing (Trace IDs), Versioning

-   Reading headers without deserializing the payload

-   Difference between Record Key, Value, and Headers

-   Impact on message size and overhead

**Task:** Create a Kafka Producer that generates fake \"User Activity\" events, attaching a \"UserID\" as the message Key and a \"Correlation-ID\" in the Headers. Send these messages to a topic with 3 partitions using acks=all and observe how specific UserIDs always land on the same partition. Next, implement a Consumer with Manual Offset Commit enabled that processes messages but deliberately crashes (exits) after every 10 messages without committing. Restart the consumer to verify that it re-reads the uncommitted messages, demonstrating the importance of precise offset control.

**Common principles and patterns MID**

1.  **Dead Letter Queue (DLQ) Strategy**

-   Handling \"Poison Messages\" that crash consumers

-   Defining Redrive Policies (max receive count)

-   Analyzing and debugging failed messages

-   Strategies for reprocessing or discarding DLQ content

-   Preventing infinite retry loops

2.  **Backpressure & Flow Control**

-   The \"Fast Producer, Slow Consumer\" problem

-   Pull-based (Prefetch) vs. Push-based consumption

-   Buffering strategies and memory limits

-   Rate limiting and throttling techniques

-   Dropping messages (Load shedding) as a last resort

3.  **Consumer Groups & Scaling**

-   Parallel processing of shared queues

-   Load balancing logic across instances

-   Group membership and rebalancing events

-   The concept of \"Competing Consumers\"

-   Offset tracking per group vs. per individual

4.  **Delivery Guarantees**

-   At-most-once: Fire-and-forget (Low latency, data loss risk)

-   At-least-once: Standard reliability (Requires idempotency)

-   Exactly-once: The \"Holy Grail\" and its performance cost

-   Handling network timeouts during Acknowledgements

-   Trade-offs between consistency and availability

5.  **Retry Mechanisms & Reliability**

-   Transient vs. Permanent failure classification

-   Implementing Exponential Backoff with Jitter

-   Circuit Breaker pattern to prevent cascading failures

-   The risk of \"Retry Storms\"

-   Local retry queues vs. Re-queueing to broker

6.  **Transactional Outbox & Inbox**

-   Solving the \"Dual Write\" problem (Database + Broker)

-   Storing events in a database table within the transaction

-   The Relay component (Polling Publisher or Log Tailing)

-   Inbox pattern for deduplication at the receiver

-   Achieving Eventual Consistency

7.  **Message Deduplication**

-   Why duplicates occur (ACK failures)

-   Generating and tracking unique Message IDs

-   Implementing Idempotent Consumers (Check-then-Act)

-   Deduplication windows and storage requirements

-   Broker-side deduplication capabilities

8.  **Event Replay & Event Log**

-   The Log as the immutable source of truth

-   Resetting offsets to re-process historical data

-   Use cases: Bug fixing, auditing, and new feature population

-   Retention policies vs. Storage costs

-   Handling schema evolution during replay

9.  **Command Bus vs. Event Bus**

-   Intent: \"Do this\" (Command) vs. \"This happened\" (Event)

-   Cardinality: One-to-One (Command) vs. One-to-Many (Event)

-   Naming conventions (CreateUser vs. UserCreated)

-   Error handling expectations and coupling

-   CQRS (Command Query Responsibility Segregation) basics

**Task:** Write a simulation script in your preferred language that mimics a message processing system. Implement a process\_message function that randomly fails 50% of the time. Build a \"Retry Wrapper\" around this function that attempts to process a message up to 3 times with a simulated \"Exponential Backoff\" delay (e.g., 1s, 2s, 4s) between attempts. If the message still fails after the 3rd try, move it to a dedicated list variable called dead\_letter\_queue and print an alert, demonstrating how to handle poison messages without blocking the system.

**RabbitMQ MID**

1.  **Exchange Types Deep Dive**

-   Direct Exchange: 1:1 routing based on exact routing keys

-   Fanout Exchange: Broadcasting messages to all bound queues ignoring keys

-   Topic Exchange: Pattern matching using wildcards (\* for one word, \# for many)

-   Headers Exchange: Routing based on message header attributes instead of keys

-   Default Exchange: Implicit direct routing to queues using their names

2.  **Consumer Prefetch (Quality of Service)**

-   The concept of \"In-flight\" unacknowledged messages

-   Configuring basic.qos to limit buffer size

-   Optimizing for throughput (High prefetch) vs. Latency (Low prefetch)

-   Fair Dispatching: Preventing one consumer from hogging all tasks

-   Global prefetch vs. Per-channel prefetch limits

3.  **Priority Queues**

-   Configuring queues with the x-max-priority argument

-   Assigning priority levels (0-255) to individual messages

-   The trade-off: Increased memory and CPU overhead

-   Ordering guarantees: High priority processed before Low priority

-   Potential risks: Starvation of low-priority messages

4.  **RabbitMQ Streams**

-   Log-based architecture (Append-only storage similar to Kafka)

-   Replaying historical messages using offsets

-   High-throughput fan-out use cases

-   Retention policies based on size or time

-   Differences in consumption model compared to classic queues

5.  **Message TTL & Queue TTL**

-   Setting Expiration time per message vs. per Queue (x-message-ttl)

-   Queue Expiration: Auto-deleting unused queues (x-expires)

-   Handling expired messages: Discarding vs. Dead Lettering

-   The impact of head-of-line blocking on per-message TTL

-   Use cases: Session timeouts, temporary command buffers

**Task:** Create a RabbitMQ queue configured with x-max-priority: 10 to support prioritization. Write a producer script that sends 50 \"Normal\" messages (priority 1) followed immediately by 5 \"Critical\" messages (priority 10) to this queue. Configure a consumer with a Prefetch Count of 1 and a simulated processing delay (e.g., time.sleep(0.1)) to ensure strict ordering. Run the consumer and verify in the logs that despite being sent last, the \"Critical\" messages are processed before the \"Normal\" ones.

**NATS MID**

1.  **Core Architecture & Philosophy**

-   The \"Fire-and-Forget\" (At-most-once) delivery model

-   Text-based protocol simplicity vs. binary protocols

-   Centralized Server (gnatsd) vs. Brokerless architectures

-   Performance focus: Low latency and high throughput

-   Client-side complexity abstraction (Smart clients)

2.  **Subject-Based Addressing**

-   Hierarchical subject structure (e.g., time.us.east)

-   Case sensitivity and token rules

-   Wildcards: The Asterisk (\*) for single-token matching

-   Wildcards: The Greater Than (\>) for full-tail matching

-   Subject isolation and security basics

3.  **Messaging Patterns**

-   Publish-Subscribe: One-to-many broadcasting

-   Request-Reply: Simulating synchronous calls over async transport

-   Queue Groups: Load balancing consumers (Queue Subscriptions)

-   Fan-in vs. Fan-out patterns

-   inbox style ephemeral reply subjects

4.  **Connection & Resilience**

-   Automatic server discovery (Gossip protocol)

-   Client reconnection logic and buffers

-   Handling \"Slow Consumers\" (Client disconnection)

-   Clustering and High Availability basics

-   Ping/Pong keep-alive mechanism

**Task:** Start a NATS server locally using Docker. Create a \"Worker\" script that subscribes to the subject orders.process using a Queue Group named order-workers. Run three separate instances of this worker script simultaneously in different terminals. Next, write a publisher script that sends 30 messages to orders.process. Observe the output in your worker terminals to verify that NATS automatically load-balances the messages across the three instances, rather than sending every message to every subscriber.

Principles & Patterns

**Principles JUN**


1.  **Dependency Injection (DI)**

-   The concept of decoupling: Removing hard-coded dependencies

-   Types of DI: Constructor, Setter, and Interface injection

-   Manual DI (Pure DI) vs. Framework-based DI

-   Benefits for Unit Testing (Mocking dependencies)

-   \"Composition Root\" pattern

2.  **Inversion of Control (IoC) & Containers**

-   The Hollywood Principle: \"Don\'t call us, we\'ll call you\"

-   IoC Container responsibilities: Resolution and Auto-wiring

-   Service Lifecycles: Singleton, Transient, and Scoped

-   Service Locator Pattern vs. Dependency Injection

-   Configuration: XML vs. Annotations/Attributes

3.  **SOLID Principles**

-   Single Responsibility: One reason to change

-   Open/Closed: Open for extension, closed for modification

-   Liskov Substitution: Subtypes must be substitutable for base types

-   Interface Segregation: Many client-specific interfaces are better

-   Dependency Inversion: Depend on abstractions, not concretions

4.  **Object-Oriented Programming (OOP)**

-   The 4 Pillars: Encapsulation, Abstraction, Inheritance, Polymorphism

-   Class vs. Object (Blueprint vs. Instance)

-   Composition over Inheritance preference

-   Abstract Classes vs. Interfaces

-   Access Modifiers (Public, Private, Protected)

5.  **Functional Programming (FP)**

-   Pure Functions and Referential Transparency

-   Immutability: Avoiding shared state and side effects

-   Higher-Order Functions: Map, Filter, Reduce

-   Functions as First-Class Citizens

-   Recursion as an alternative to loops

6.  **Mini Principles (Heuristics)**

-   KISS: Keep It Simple, Stupid (Complexity is a cost)

-   DRY: Don\'t Repeat Yourself (Single source of truth)

-   YAGNI: You Ain\'t Gonna Need It (Avoid premature optimization)

-   Occam\'s Razor: The simplest solution is often the correct one

-   BDUF: Big Design Up Front (Risks and inflexibility)

7.  **Clean Code Practices**

-   Naming conventions: Intent-revealing names

-   Function rules: Do one thing, keep them small

-   The \"Boy Scout Rule\": Leave code cleaner than you found it

-   Comments: Good code documents itself; comments explain \"Why\"

-   Formatting and avoiding deep nesting (Arrow code)

8.  **Debugging Strategies**

-   \"Rubber Duck\" debugging (Explaining code line-by-line)

-   Using Breakpoints, Watches, and Step-over/Step-into

-   Analyzing Stack Traces and error messages effectively

-   Bisection method: Isolating the bug (Git Bisect)

-   Logging vs. Debugger trade-offs

9.  **AJAX & Async Communication**

-   Asynchronous JavaScript and XML history

-   Modern Fetch API vs. XMLHttpRequest

-   Handling JSON data exchange

-   The Request/Response cycle and HTTP Status codes

-   Cross-Origin Resource Sharing (CORS) basics

10. **F.I.R.S.T. Unit Tests**

-   Fast: Tests must run in milliseconds

-   Independent: No shared state or order dependency

-   Repeatable: Deterministic results in any environment

-   Self-Validating: Boolean output (Pass/Fail)

-   Timely: Written just before or with the production code

11. **Imperative vs. Declarative/Functional**

-   Imperative: Focus on *How* (Step-by-step control flow)

-   Declarative: Focus on *What* (Desired result)

-   Managing State: Mutable variables vs. Immutable data streams

-   Loop structures (for, while) vs. Pipeline operators

-   readability and side-effect management differences


**Task:** Refactor a provided "bad code" example (a single 200-line function that handles user registration, validation, email sending, and database storage) by applying SOLID principles. Extract it into separate classes/modules following Single Responsibility, define interfaces for dependencies (Dependency Inversion), and ensure the code is open for extension (e.g., adding SMS notification) without modifying existing classes. Write unit tests for each extracted module using dependency injection.

**DDD MID**

1.  **Core Principles**

-   Ubiquitous Language: A shared vocabulary between developers and domain experts (e.g., using \"Place Order\" in code, not insert\_record\_into\_db).

-   Bounded Context: The explicit boundary within which a specific domain model applies and is consistent (e.g., \"Product\" means something different in *Sales* vs. *Shipping* contexts).

-   Entities: Objects defined by a unique identity that persists over time (e.g., a specific User ID).

-   Value Objects: Objects defined by their attributes, not identity; they are immutable (e.g., Money, Color, GPS coordinates).

-   Aggregates: A cluster of domain objects treated as a single unit for data changes, controlled by an Aggregate Root.

2.  **Context Maps & Relationships**

-   Visualizing how different Bounded Contexts interact.

-   Shared Kernel: Two teams sharing a subset of the domain model (high coupling).

-   Customer/Supplier: Upstream team dictates changes; Downstream team follows.

-   Anti-Corruption Layer (ACL): A translation layer that prevents concepts from an external system (legacy or 3rd party) from polluting your clean domain model.

-   Conformist: Adopting the upstream model blindly without translation.

3.  **Layers & Hexagonal Architecture**

-   Layered Architecture: Standard Separation (Presentation -\> Application -\> Domain -\> Infrastructure).

-   The Dependency Rule: Inner layers (Domain) must *never* depend on outer layers (Database/UI).

-   Hexagonal (Ports and Adapters):

    -   Core: The Domain logic (inside the hexagon).

    -   Ports: Interfaces defined by the Core (e.g., UserRepository interface).

    -   Adapters: Implementations outside the hexagon (e.g., SqlUserRepository, RestApiAdapter).

4.  **Code Structure & Organization**

-   Package by Component (Vertical Slicing) over Package by Layer.

-   Grouping code by the Bounded Context first, then by domain concept.

-   Application Layer: Orchestrates tasks (commands), but contains no business rules.

-   Domain Layer: Contains all business logic, invariants, and rules (Pure classes, no framework dependencies).

-   Infrastructure Layer: Concrete implementations (Frameworks, DB drivers, File IO).

Architecture


**Task:** Design a bounded context for an order management system using DDD principles. Define at least 3 aggregates (e.g., Order, Customer, Product), their value objects, and domain events. Implement the Order aggregate root with invariant validation, and create a domain service that coordinates a business process spanning multiple aggregates. Write unit tests that verify the domain rules are enforced correctly.

**Microservices vs. Monolith JUN**

1.  **Main concepts and ideas**

-   Defining the Monolith: Single codebase, shared memory, and tight coupling

-   Defining Microservices: Independent deployability and \"smart endpoints, dumb pipes\"

-   Bounded Contexts: How to define logical boundaries for services

-   The \"Share-nothing\" architecture philosophy

2.  **Differences**

-   Data Governance: Centralized shared database vs. Database-per-service pattern

-   Communication: In-process function calls vs. Network protocols (HTTP/REST, gRPC)

-   Deployment strategies: Monolithic artifacts vs. Containerization and orchestration

-   Team structure: Siloed functional teams vs. Cross-functional autonomous squads

3.  **Pros and cons**

-   Scalability: Scaling the entire application vs. Granular scaling of specific services

-   Operational Overhead: Simplicity of development vs. Complexity of distributed tracing and logging

-   Fault Isolation: System-wide crashes vs. Circuit breaking and partial availability

-   Agility: Faster time-to-market for small changes vs. Integration testing challenges


**Task:** Take a simple monolithic Express.js application (e.g., a blog with users, posts, and comments) and create a plan to decompose it into microservices. Identify the service boundaries, define the API contracts between services, and actually extract one service (e.g., the comments service) into a separate application that communicates with the main app via REST. Document the trade-offs you encountered during the decomposition.

**Styles JUN**

1.  **Client-Server Architecture**

-   Request-Response Lifecycle: Understanding the flow of data via HTTP

-   Separation of Concerns: Decoupling the Presentation Layer from the Data Layer

-   Statelessness vs. Stateful: Session management and REST constraints

-   Thin Clients vs. Thick Clients: Balancing processing load between devices

2.  **API Gateway Pattern**

-   The Gateway as a Facade: Aggregating multiple microservices calls

-   Offloading Cross-Cutting Concerns: Handling Authentication, SSL, and Logging

-   Traffic Management: Implementing Rate Limiting and Circuit Breaking

-   Protocol Translation: Converting Web-friendly protocols (HTTP/JSON) to internal protocols (gRPC/AMQP)

3.  **Serverless Computing (FaaS)**

-   Event-Driven Triggers: Invoking functions via HTTP, Timers, or Database changes

-   The \"Cold Start\" Phenomenon: Understanding latency and execution environments

-   Scaling Mechanics: Scale-to-zero and handling burst traffic automatically

-   Vendor Lock-in vs. Operational Efficiency: Trade-offs in infrastructure management


**Task:** Design a REST API and a GraphQL API for the same resource (e.g., a library catalog with books, authors, and categories). Implement both using Express.js, then write a comparison document covering: query flexibility, over-fetching/under-fetching, caching strategies, error handling approaches, and when you would choose one over the other. Include example requests and responses for common operations (list, filter, nested resources).

**Event driven system MID**

1.  **Event Sourcing**

-   The Append-Only Log: Storing every state change as a discrete record

-   State Reconstruction: Replaying history to derive the current application state

-   Audit Trails: Inherent historical data for debugging and compliance

-   Snapshots: Optimizing performance by caching intermediate states

2.  **Event Messaging**

-   Publish-Subscribe Pattern: Decoupling event producers from consumers

-   Message Brokers: The role of middleware like Kafka or RabbitMQ

-   Event Payload Design: Thin notifications vs. Fat state-transfer events

-   Asynchronous decoupling: \"Fire and forget\" communication flow

3.  **Event Based Synchronizations**

-   Eventual Consistency: Propagating data across distributed services

-   Choreography: Decentralized decision making between services

-   Change Data Capture (CDC): syncing database changes to downstream systems

-   Reliability patterns: Idempotency and Dead Letter Queues for failed syncs


**Task:** Build an event-driven notification system where a UserService publishes events (UserRegistered, OrderPlaced, PaymentCompleted) and multiple consumers process them independently: an EmailNotifier, a PushNotifier, and an AnalyticsCollector. Implement dead letter queue handling for failed events, idempotency checks to prevent duplicate processing, and an event store that allows replaying events from any point in time.

**Distributed Transactions MID**

1.  **Main problems and limitations**

-   The Dual Write Problem: Challenges of updating a database and publishing a message atomically

-   Lack of ACID: Why Atomicity and Isolation are difficult across network boundaries

-   Partial Failures: Handling scenarios where one service succeeds while another fails

-   Network Latency: The performance cost of coordinating locks across multiple servers

2.  **Two phase commit (2PC)**

-   The Prepare Phase: The coordinator asks all participants if they can commit

-   The Commit Phase: Enforcing the consensus decision (Commit or Rollback)

-   Blocking Nature: How the coordinator becomes a Single Point of Failure (SPOF)

-   Scalability limitations: Why locking resources across services reduces throughput

3.  **SAGA Pattern**

-   Local Transactions: Breaking a distributed process into a sequence of atomic local steps

-   Compensating Transactions: Logic to \"undo\" previous steps if a later step fails

-   Forward vs. Backward Recovery: Retrying (forward) vs. Rolling back (backward) strategies

-   Eventual Consistency: Accepting that the system state will converge over time

4.  **Choreography vs Orchestration**

-   Choreography (Decentralized): Services react to events autonomously without a central controller

-   Orchestration (Centralized): A specific service commands others and tracks the state

-   Coupling: Loose coupling in choreography vs. tighter logic coupling in orchestration

-   Observability: The difficulty of tracking workflows in choreography vs. centralized monitoring in orchestration


**Task:** Build a simple demonstration of the Saga pattern for an e-commerce checkout flow involving 3 microservices: OrderService, PaymentService, and InventoryService. Implement both the happy path (all succeed) and the compensation flow (payment fails after inventory is reserved). Use a choreography-based approach with event publishing, and document how your solution handles the case where a compensating action itself fails.

**Microservice patterns MID**

1.  **Rate Limiter**

-   Traffic Control Algorithms: Token Bucket, Leaky Bucket, and Fixed Window

-   Preventing Denial of Service (DoS): Protecting resources from abuse

-   Client Feedback: Using HTTP 429 \"Too Many Requests\" and Retry-After headers

-   Scope: Implementing at the API Gateway vs. Individual Service level

2.  **Circuit Breaker**

-   The Three States: Closed (Healthy), Open (Failing), and Half-Open (Testing recovery)

-   Fail-Fast Principle: Preventing thread pool exhaustion by failing immediately

-   Preventing Cascading Failures: Stopping one broken service from bringing down the system

-   Fallback integration: Triggering default responses when the circuit is open

3.  **Sidecar Pattern**

-   Decoupling Infrastructure: Offloading logging, proxying, and SSL from business logic

-   Language Agnostic: Providing consistent features across polyglot microservices

-   Service Mesh Data Plane: How sidecars (like Envoy) facilitate service-to-service communication

-   Lifecycle: Deploying auxiliary containers alongside the main application container

4.  **Orchestration vs. Choreography**

-   Centralized Control (Orchestration): A \"Conductor\" service directs the workflow

-   Decentralized Communication (Choreography): Services react to events autonomously

-   Error Handling: Centralized compensation logic vs. Distributed error recovery

-   Coupling: Tight coupling in orchestration vs. Loose coupling in choreography

5.  **Graceful Degradation**

-   Fallback Strategies: Serving cached data or static content when dynamic calls fail

-   Feature Shedding: Temporarily disabling non-critical features (like recommendations) during high load

-   UI Resilience: Designing the frontend to render partial content instead of crashing

-   Prioritization: Ensuring core business transactions (e.g., Checkout) survive while others fail

6.  **Monitoring & Telemetry**

-   The Three Pillars of Observability: Logs, Metrics, and Distributed Tracing

-   Correlation IDs: Tracking a single request across multiple service boundaries

-   Health Checks: Implementing Liveness (is it running?) and Readiness (can it take traffic?) probes

-   Alerting: Setting thresholds for error rates and latency percentiles (p95, p99)

7.  **Load Shifting & Backpressure**

-   Flow Control: Signaling upstream services to slow down data transmission

-   Load Shifting: Redirecting traffic to healthy regions or instances during spikes

-   Queue Management: Handling bufferbloat and rejecting excess requests

-   Reactive Streams: Non-blocking pressure management in asynchronous systems


**Task:** Implement an API Gateway pattern for a microservices system with at least 3 backend services. The gateway should handle: request routing based on path prefixes, rate limiting (100 requests/minute per client), circuit breaking for each downstream service, request/response transformation, and JWT authentication. Add a service registry component where services register themselves on startup and the gateway discovers them dynamically.

**Errors handler MID**

1.  **Retries logic**

-   Exponential Backoff: Increasing delays between failed attempts

-   Jitter: Adding randomness to prevent \"Thundering Herd\" problems

-   Idempotency Keys: Ensuring repeated requests don\'t duplicate actions

-   Retry limits: Defining maximum attempts to avoid infinite loops

2.  **Fallbacks**

-   Default Values: Returning empty lists or placeholders when data is missing

-   Cache Fallback: Serving stale data when the live source is unreachable

-   Degraded Functionality: Disabling specific features rather than crashing the app

-   User Feedback: Designing UI states for partial system failures

3.  **Logging strategies**

-   Log Levels: Distinguishing between DEBUG, INFO, WARN, and ERROR

-   Structured Logging: Using JSON for machine-readable and searchable logs

-   Correlation IDs: Tracing a request through multiple service boundaries

-   Security: Scrubbing PII (Personally Identifiable Information) and secrets

4.  **Network errors handling**

-   Timeouts: Setting Connection and Read timeouts to prevent hanging requests

-   HTTP Status Codes: Differentiating client errors (4xx) from server errors (5xx)

-   DNS and Connectivity: Handling \"Host Unreachable\" and offline scenarios

-   Parsing Errors: Distinguishing between bad network and bad data format


**Task:** Create an error handling middleware system for a Node.js/Express application that includes: a custom error hierarchy (AppError → ValidationError, NotFoundError, AuthorizationError), a centralized error handler that formats errors differently for development vs production, a circuit breaker wrapper for external API calls that opens after 3 consecutive failures, and structured JSON error logging with correlation IDs for request tracing.

**Design MID**

1.  **MVC (Model-View-Controller)**

-   Separation of Concerns: Dividing the app into Data, User Interface, and Control Logic

-   The Controller: Handling user input and updating the Model

-   The Model: Managing data logic and business rules independent of the UI

-   Unidirectional flow variants: How modern MVC differs from traditional implementations

2.  **MVP (Model-View-Presenter)**

-   The Presenter: Acting as a middleman to separate View from Model completely

-   Passive View: Keeping the UI logic minimal and testable

-   Testing benefits: Mocking the View to unit test the Presenter logic

-   One-to-One relationship: Tighter coupling between View and Presenter compared to MVC

3.  **MVVM (Model-View-ViewModel)**

-   Data Binding: Automating the flow of data between View and ViewModel

-   The ViewModel: Exposing streams of data and state specifically for the View

-   State Management: Handling UI state without direct DOM manipulation

-   Reducing Boilerplate: Removing the need for manual event listener code

4.  **Modularity**

-   Encapsulation: Hiding internal implementation details behind public APIs

-   Reusability: Designing modules to be used in different parts of the system

-   High Cohesion: Grouping related functionality together within a module

-   Low Coupling: Minimizing dependencies between different modules

5.  **Layered Architecture**

-   N-Tier Structure: Presentation, Business Logic, and Data Access layers

-   Dependency Rule: Layers should only depend on layers below them

-   Separation of Concerns: Isolating database queries from HTTP handling

-   Maintenance: Updating one layer without rewriting the entire application

6.  **IoC (Inversion of Control)**

-   The Hollywood Principle: \"Don\'t call us, we\'ll call you\"

-   Dependency Injection (DI): Passing dependencies (services/objects) from outside rather than creating them internally

-   Decoupling: Removing hard-coded dependencies to improve modularity

-   Containers: Using frameworks (like Spring or NestJS) to manage object lifecycles

7.  **SOA (Service-Oriented Architecture)**

-   Enterprise Service Bus (ESB): Centralized communication highway for services

-   Contract-First Design: Defining strict WSDL/SOAP interfaces before coding

-   Reusability: Services designed as generic business functions for the whole enterprise

-   Interoperability: integrating different technologies (e.g., Java and .NET) via standard protocols

8.  **EDA (Event-Driven Architecture)**

-   Asynchronous Communication: Decoupling producers from consumers

-   Event Channels: Using queues or topics to broadcast state changes

-   Scalability: Buffering spikes in traffic using event logs

-   Loose Coupling: Producers don\'t know who (or if anyone) is listening

9.  **Hexagonal (Ports and Adapters)**

-   The Core Domain: Isolating business logic from the outside world

-   Ports: Defining interfaces for what the application needs (e.g., Repository Interface)

-   Adapters: Implementing the interfaces for specific tools (e.g., SQL Adapter, REST Adapter)

-   Testability: Swapping real database adapters for in-memory mocks without changing business rules

**Task:** Design a URL shortening service (like bit.ly) that can handle 100M URLs. Create a system design document covering: the API design (REST endpoints), database schema choice and justification, the shortening algorithm, caching strategy with Redis, and a read/write scaling approach. Draw the architecture diagram showing load balancers, application servers, databases, and cache layers. Estimate storage requirements for 5 years of operation.

