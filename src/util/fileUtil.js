import fs from 'fs/promises';
import path from 'path';
import inquirer from 'inquirer';

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

export async function promptExcelPath(promptMessage) {
    let isValid = false;
    let filePath;

    while (!isValid) {
        const response = await inquirer.prompt([
            {
                type: 'input',
                name: 'filePath',
                message: promptMessage,
                validate: function(input) {
                    if (!input || input.trim() === '') {
                        return 'ファイルパスを入力してください。';
                    }
                    
                    // .xlsx拡張子をチェック
                    if (!input.toLowerCase().endsWith('.xlsx')) {
                        return 'Excelファイル(.xlsx)を指定してください。';
                    }
                    
                    // 絶対パスかどうかをチェック
                    if (!path.isAbsolute(input.trim())) {
                        return '絶対パスを入力してください。';
                    }
                    
                    return true;
                }
            }
        ]);

        filePath = response.filePath.trim();

        // ファイルの存在確認
        try {
            await fs.access(filePath, fs.constants.F_OK);
            console.log(`✓ ファイルが見つかりました: ${filePath}`);
            isValid = true;
        } catch (err) {
            console.error(`✗ ファイルが見つかりません: ${filePath}`);
            console.error('正確なファイルパスを入力してください。');
        }
    }

    return filePath;
}
