// Registers the memory-harness loader hooks before the server modules load:
//   node --import ./test/memory-harness/register.mjs src/index.js
import { register } from 'node:module';

register('./hooks.mjs', import.meta.url);
