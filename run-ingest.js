#!/usr/bin/env node
/**
 * Script to ingest all CSV relay data into the database
 */

var dbInit = require('./db/db_init');
var ingestFiles = require('./ingest/ingestFiles');
var path = require('path');

var directories = [
    path.resolve(__dirname, 'data/sample'),
    path.resolve(__dirname, 'data/historical'),
    path.resolve(__dirname, 'data/current')
];

console.log('Initializing database...');
dbInit.initialize(function(err) {
    if (err) {
        console.error('Database initialization failed:', err);
        process.exit(1);
    }
    console.log('Database initialized successfully.');
    
    var index = 0;
    function processNext() {
        if (index >= directories.length) {
            console.log('\n=== Ingestion complete! ===');
            process.exit(0);
        }
        
        var dir = directories[index];
        console.log('\n--- Processing directory: ' + dir + ' ---');
        
        ingestFiles(dir, function(err) {
            if (err) {
                console.error('Error ingesting ' + dir + ':', err);
            }
            index++;
            processNext();
        });
    }
    
    processNext();
});

