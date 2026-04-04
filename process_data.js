const fs = require('fs');
const { Parser } = require('json2csv');

// Read CSV
const csvData = fs.readFileSync('bollywood_2023.csv', 'utf8');
const rows = csvData.split('\n').slice(1);

const processedData = rows.map(row => {
    const [title, budget, revenue, rating, genre] = row.split(',');
    if (!title) return null;
    
    const b = parseFloat(budget);
    const r = parseFloat(revenue);
    let status = 'Average';
    if (r > b * 1.5) status = 'Blockbuster';
    else if (r > b) status = 'Hit';
    else if (r < b * 0.5) status = 'Flop';
    else status = 'Average';

    return { Title: title, Budget: b, Revenue: r, Rating: rating, Genre: genre, Status: status };
}).filter(r => r);

// Write JSON for verification
fs.writeFileSync('bollywood_2023_processed.json', JSON.stringify(processedData, null, 2));

console.log('Data processed successfully.');
