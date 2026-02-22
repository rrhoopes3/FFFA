#!/usr/bin/env node
// ============================================================
//  FFFA — Passenger/cPanel Entry Point
//  This wrapper ensures compatibility with Passenger Node.js
// ============================================================

// If Passenger provides a port via environment variable, use it
if (process.env.PORT) {
  console.log('Running under Passenger on port', process.env.PORT);
}

// Start the main server
require('./server.js');
