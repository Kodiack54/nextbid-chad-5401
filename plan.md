 AI Workers Architecture - Chad & Susan as Full Standalone Applications

 The Problem

 1. Currently Chad and Susan are single server.js files - doesn't scale
 2. They're conceptually tied to the studio - but Claude can't modify them without resetting himself
 3. No multi-project support - what if 3 devs on 3 projects need Chad/Susan simultaneously?
 4. No shared utilities should exist - each worker must be 100% independent

 The Solution

 Studio = Claude's meeting room. Nothing else.

 Each AI worker is a 100% standalone application:
 - Own codebase, own utilities, own deployment
 - Multi-tenant from day 1 (handles multiple projects simultaneously)
 - Claude can modify any worker from the studio without affecting himself
 - No shared dependencies between workers

 ---
 Target Architecture

 Chad - Transcriber (Port 5401)

 Location: C:\Projects\NextBid_Dev\ai-workers\chad-5401\

 chad-5401/
 ├── index.js                    # Entry point, startup sequence
 ├── package.json
 ├── .env
 ├── pm2.config.js               # Process management
 ├── src/
 │   ├── routes/
 │   │   ├── index.js            # Route aggregator
 │   │   ├── health.js           # GET /health
 │   │   ├── sessions.js         # Session CRUD (multi-project)
 │   │   ├── transcribe.js       # POST /api/transcribe
 │   │   └── chat.js             # POST /api/chat (direct conversation)
 │   ├── services/
 │   │   ├── sessionManager.js   # Multi-project session tracking
 │   │   ├── transcriptionService.js # Core transcription logic
 │   │   ├── extractionEngine.js # GPT extraction orchestration
 │   │   └── susanClient.js      # HTTP calls to Susan (5403)
 │   ├── websocket/
 │   │   ├── handler.js          # WebSocket connection manager
 │   │   └── terminalStream.js   # Terminal output processing
 │   ├── extractors/             # Plugin architecture for extraction
 │   │   ├── registry.js         # Extractor discovery/registry
 │   │   ├── claude-tui/
 │   │   │   ├── config.json
 │   │   │   └── extractor.js
 │   │   ├── bash-output/
 │   │   │   ├── config.json
 │   │   │   └── extractor.js
 │   │   └── code-diff/
 │   │       ├── config.json
 │   │       └── extractor.js
 │   └── lib/                    # Chad's OWN utilities (not shared)
 │       ├── logger.js           # Chad's logger
 │       ├── db.js               # Chad's Supabase client
 │       ├── openai.js           # Chad's OpenAI client
 │       └── config.js           # Chad's config loader
 ├── logs/                       # Rotating log files
 └── tests/

 Susan - Librarian (Port 5403)

 Location: C:\Projects\NextBid_Dev\ai-workers\susan-5403\

 susan-5403/
 ├── index.js                    # Entry point
 ├── package.json
 ├── .env
 ├── pm2.config.js
 ├── src/
 │   ├── routes/
 │   │   ├── index.js            # Route aggregator
 │   │   ├── health.js           # GET /health
 │   │   ├── context.js          # GET /api/context (Claude startup, by project)
 │   │   ├── catalog.js          # POST /api/catalog (store knowledge)
 │   │   ├── search.js           # GET /api/search (query by project)
 │   │   ├── schemas.js          # Schema management endpoints
 │   │   ├── decisions.js        # Decision tracking endpoints
 │   │   └── chat.js             # POST /api/chat (direct conversation)
 │   ├── services/
 │   │   ├── knowledgeService.js # Multi-project knowledge CRUD
 │   │   ├── contextBuilder.js   # Build Claude's startup context (per project)
 │   │   ├── cataloger.js        # Knowledge extraction orchestration
 │   │   ├── searchService.js    # Knowledge base search (project-scoped)
 │   │   └── chadClient.js       # HTTP calls to Chad (5401)
 │   ├── catalogers/             # Plugin architecture for knowledge extraction
 │   │   ├── registry.js         # Cataloger discovery/registry
 │   │   ├── code-knowledge/
 │   │   │   ├── config.json
 │   │   │   └── cataloger.js
 │   │   ├── bug-fixes/
 │   │   │   ├── config.json
 │   │   │   └── cataloger.js
 │   │   ├── api-endpoints/
 │   │   │   ├── config.json
 │   │   │   └── cataloger.js
 │   │   └── gov-source-sam/     # Example: SAM.gov specific handler
 │   │       ├── config.json
 │   │       └── cataloger.js
 │   ├── database/
 │   │   ├── schemas.sql         # Table definitions
 │   │   └── migrations/
 │   └── lib/                    # Susan's OWN utilities (not shared)
 │       ├── logger.js           # Susan's logger
 │       ├── db.js               # Susan's Supabase client
 │       ├── openai.js           # Susan's OpenAI client
 │       └── config.js           # Susan's config loader
 ├── logs/
 └── tests/

 Tiffany - Tester (Port 5402) - Future

 Location: C:\Projects\NextBid_Dev\ai-workers\tiffany-5402\

 tiffany-5402/
 ├── index.js
 ├── package.json
 ├── .env
 ├── pm2.config.js
 ├── src/
 │   ├── routes/
 │   ├── services/
 │   ├── testers/                # Plugin architecture for test strategies
 │   └── lib/                    # Tiffany's OWN utilities
 ├── logs/
 └── tests/

 NO SHARED FOLDER

 Each worker is 100% standalone. If Chad needs a logger, Chad has his own logger. If Susan needs OpenAI, Susan
 has her own OpenAI client. This means:
 - Workers can be deployed independently
 - Workers can be moved to different servers
 - Modifying one worker never affects another
 - Each worker can have different versions of dependencies if needed

 ---
 Plugin Architecture (Key Pattern)

 Example: Susan's Catalogers

 Each cataloger handles a specific type of knowledge extraction:

 catalogers/gov-source-sam/
 ├── config.json
 └── cataloger.js

 config.json:
 {
   "name": "sam-gov",
   "displayName": "SAM.gov Federal Contracts",
   "enabled": true,
   "triggers": ["sam.gov", "federal", "contract"],
   "scripts": {
     "cataloger": "cataloger.js"
   }
 }

 cataloger.js:
 module.exports = {
   name: 'sam-gov',

   // Check if this cataloger should handle the content
   matches(content, metadata) {
     return content.includes('sam.gov') ||
            metadata.tags?.includes('federal');
   },

   // Extract knowledge from the content
   async extract(content, context) {
     return {
       category: 'government-source',
       subcategory: 'federal-sam',
       title: `SAM.gov: ${extractTitle(content)}`,
       summary: await summarize(content),
       metadata: {
         source: 'sam.gov',
         contractNumber: extractContractNumber(content)
       }
     };
   }
 };

 Registry Pattern (from nextbid-dev-5101)

 // src/catalogers/index.js
 const fs = require('fs');
 const path = require('path');

 class CatalogerRegistry {
   constructor() {
     this.catalogers = new Map();
   }

   async discover() {
     const catalogersDir = path.join(__dirname);
     const entries = fs.readdirSync(catalogersDir, { withFileTypes: true });

     for (const entry of entries) {
       if (entry.isDirectory()) {
         const configPath = path.join(catalogersDir, entry.name, 'config.json');
         if (fs.existsSync(configPath)) {
           const config = require(configPath);
           if (config.enabled) {
             const cataloger = require(path.join(catalogersDir, entry.name, config.scripts.cataloger));
             this.catalogers.set(config.name, { config, cataloger });
           }
         }
       }
     }
   }

   getCataloger(name) {
     return this.catalogers.get(name);
   }

   findMatching(content, metadata) {
     for (const [name, { cataloger }] of this.catalogers) {
       if (cataloger.matches(content, metadata)) {
         return cataloger;
       }
     }
     return null;
   }
 }

 module.exports = new CatalogerRegistry();

 ---
 Implementation Steps

 Phase 1: Build Chad as Full Standalone App

 1. Create full folder structure: chad-5401/src/{routes,services,websocket,extractors,lib}
 2. Create Chad's own lib: logger.js, db.js, openai.js, config.js
 3. Extract routes from current server.js → src/routes/
 4. Extract business logic → src/services/
 5. Move WebSocket handling → src/websocket/
 6. Create extractor plugin system with registry
 7. Create index.js entry point with proper startup sequence
 8. Add PM2 config
 9. Deploy and test independently

 Phase 2: Build Susan as Full Standalone App

 1. Create full folder structure: susan-5403/src/{routes,services,catalogers,database,lib}
 2. Create Susan's own lib: logger.js, db.js, openai.js, config.js
 3. Extract routes from current server.js → src/routes/
 4. Extract business logic → src/services/
 5. Create cataloger plugin system with registry
 6. Create index.js entry point with proper startup sequence
 7. Add PM2 config
 8. Deploy and test independently

 Phase 3: Add Initial Plugins

 1. Chad extractors: claude-tui, bash-output, code-diff
 2. Susan catalogers: code-knowledge, bug-fixes, api-endpoints

 Phase 4: Multi-Project Testing

 1. Test 2+ projects running simultaneously
 2. Verify project isolation in database queries
 3. Verify no cross-contamination between projects

 ---
 Critical Files to Create

 Chad's Entry Point: chad-5401/index.js

 require('dotenv').config();
 const { Logger } = require('./src/lib/logger');
 const logger = new Logger('Chad');

 async function start() {
   logger.info('Starting Chad Transcriber...');

   // 1. Load config
   const config = require('./src/lib/config');

   // 2. Initialize services
   const sessionManager = require('./src/services/sessionManager');
   await sessionManager.initialize();

   // 3. Discover extractors
   const extractorRegistry = require('./src/extractors/registry');
   await extractorRegistry.discover();
   logger.info(`Loaded ${extractorRegistry.count()} extractors`);

   // 4. Start HTTP + WebSocket server
   const app = require('./src/routes');
   const server = app.listen(config.PORT, () => {
     logger.info(`Chad ready on port ${config.PORT}`);
   });

   // 5. Attach WebSocket
   const wsHandler = require('./src/websocket/handler');
   wsHandler.attach(server);
 }

 start().catch(err => {
   logger.error('Startup failed', { error: err.message });
   process.exit(1);
 });

 Susan's Entry Point: susan-5403/index.js

 require('dotenv').config();
 const { Logger } = require('./src/lib/logger');
 const logger = new Logger('Susan');

 async function start() {
   logger.info('Starting Susan Librarian...');

   // 1. Load config
   const config = require('./src/lib/config');

   // 2. Initialize services
   const knowledgeService = require('./src/services/knowledgeService');
   await knowledgeService.initialize();

   // 3. Discover catalogers
   const catalogerRegistry = require('./src/catalogers/registry');
   await catalogerRegistry.discover();
   logger.info(`Loaded ${catalogerRegistry.count()} catalogers`);

   // 4. Start HTTP server
   const app = require('./src/routes');
   app.listen(config.PORT, () => {
     logger.info(`Susan ready on port ${config.PORT}`);
   });
 }

 start().catch(err => {
   logger.error('Startup failed', { error: err.message });
   process.exit(1);
 });

 ---
 Benefits of This Architecture

 1. Complete Isolation: Each worker is 100% standalone - can deploy/modify independently
 2. Multi-Project Ready: Handle 3+ projects simultaneously with zero confusion
 3. Claude Can Self-Improve: Modify Chad/Susan from studio without resetting
 4. Plugin System: Add 500+ catalogers/extractors without bloating core code
 5. No Refactoring Later: Built robust from day 1
 6. Testability: Each worker can be tested in isolation

 ---
 Key Principle

 Studio (5000) = Claude's meeting room. That's ALL.

 Workers are separate employees with their own desks:
 - Chad (5401) - Logs everything, his own office
 - Susan (5403) - Catalogs everything, her own office
 - Tiffany (5402) - Tests everything, her own office (future)

 They communicate via HTTP/WebSocket, not by sharing code.

 ---
 Reference Architecture

 Pattern adapted from: C:\Projects\NextBid_Dev\nextbid-dev-5101\
 - Logger pattern: shared/logger.js → each worker gets their own copy in src/lib/
 - Plugin discovery: shared/sourceRegistry.js → src/extractors/registry.js or src/catalogers/registry.js
 - Plugin structure: sources/*/config.json + adapter.js → extractors/*/ or catalogers/*/

