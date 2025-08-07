import fs from 'fs/promises';

export async function readFile(filename) {
    try {
        const data = await fs.readFile(filename, 'utf-8');
        console.log(`Successfully read from ${filename}`);
        return data;
    } catch (err) {
        console.error(`Error reading file ${filename}:`, err);
        throw err;
    }
}

export async function writeFile(filename, data) {
    try {
        await fs.writeFile(filename, data, 'utf-8');
        console.log(`Successfully wrote to ${filename}`);
    } catch (err) {
        console.error(`Error writing to file ${filename}:`, err);
        throw err;
    }
}

export async function parseJson(data) {
    try {
        const jsonData = JSON.parse(data);
        console.log(`Successfully parsed JSON data`);
        return jsonData;
    } catch (err) {
        console.error('Error parsing JSON data:', err);
        throw err;
    }
}