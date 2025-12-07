#!/usr/bin/env node
/**
 * Populate country_counts table from relay IP addresses using GeoIP database
 * 
 * This generates country statistics based on where Tor relays are hosted,
 * since the GuardClients per-country data is no longer available in newer datasets.
 */

'use strict';

const mysql = require('mysql');
const path = require('path');
const maxmind = require('maxmind');
const config = require('../config');

const GEOIP_DB_PATH = path.join(__dirname, '..', 'data', 'geoip', 'GeoLite2-City.mmdb');

async function main() {
    console.log('Loading GeoIP database...');
    const geoReader = await maxmind.open(GEOIP_DB_PATH);
    
    console.log('Connecting to MySQL...');
    const conn = mysql.createConnection(config.db);
    
    await new Promise((resolve, reject) => {
        conn.connect(err => err ? reject(err) : resolve());
    });
    
    // Get all dates that don't have country_counts data
    console.log('Finding dates without country data...');
    const datesWithoutCountry = await new Promise((resolve, reject) => {
        conn.query(`
            SELECT d.date 
            FROM dates d 
            LEFT JOIN (SELECT DISTINCT date FROM country_counts) c ON d.date = c.date 
            WHERE c.date IS NULL
            ORDER BY d.date
        `, (err, rows) => err ? reject(err) : resolve(rows));
    });
    
    console.log(`Found ${datesWithoutCountry.length} dates without country data`);
    
    for (const dateRow of datesWithoutCountry) {
        const date = dateRow.date;
        const dateStr = date.toISOString().split('T')[0];
        
        process.stdout.write(`Processing ${dateStr}... `);
        
        // Get all relays for this date
        const relays = await new Promise((resolve, reject) => {
            conn.query(
                'SELECT ip FROM relays WHERE date = ?',
                [date],
                (err, rows) => err ? reject(err) : resolve(rows)
            );
        });
        
        // Count relays by country using GeoIP
        const countryCounts = {};
        let geoHits = 0;
        
        for (const relay of relays) {
            try {
                const result = geoReader.get(relay.ip);
                if (result && result.country && result.country.iso_code) {
                    const cc = result.country.iso_code.toLowerCase();
                    countryCounts[cc] = (countryCounts[cc] || 0) + 1;
                    geoHits++;
                }
            } catch (e) {
                // IP not found in database
            }
        }
        
        // Insert country counts
        const countrySpecs = Object.entries(countryCounts).map(([cc, count]) => [date, cc, count]);
        
        if (countrySpecs.length > 0) {
            await new Promise((resolve, reject) => {
                conn.query(
                    'INSERT INTO country_counts (date, cc, count) VALUES ?',
                    [countrySpecs],
                    (err) => err ? reject(err) : resolve()
                );
            });
            console.log(`${relays.length} relays, ${geoHits} geolocated, ${Object.keys(countryCounts).length} countries`);
        } else {
            console.log(`${relays.length} relays, no country data`);
        }
    }
    
    console.log('\nDone!');
    conn.end();
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});

