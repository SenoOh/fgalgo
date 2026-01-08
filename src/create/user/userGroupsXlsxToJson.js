// user_attribute_xlsx_to_json.js
import ExcelJS from 'exceljs';

export async function groupXlsxToJson(filename) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filename);

    const worksheet = workbook.worksheets[0];
    const rows = [];

    const headerRow = worksheet.getRow(1);
    const headers = headerRow.values.slice(1); 

    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;

        const rowData = {};
        const values = row.values.slice(1);

        headers.forEach((header, idx) => {
        let value = values[idx] ?? '';

        if (typeof value === 'string' && value.includes(',')) {
            value = value.split(/\s*,\s*/).filter(s => s.length > 0);
        }

        rowData[header] = value;
        });

        // すべての列の値にハイフンが含まれているかチェック（再帰的に確認）
        for (const [key, value] of Object.entries(rowData)) {
            const checkHyphen = (val, fieldName) => {
                if (typeof val === 'string' && val.includes('-')) {
                    console.error('\x1b[31m%s\x1b[0m', `\nエラー: ${fieldName}にハイフン（-）が含まれています: "${val}"`);
                    console.error('\x1b[33m%s\x1b[0m', `\n修正方法:`);
                    console.error('  Excelファイルを開いて、以下のように修正してください:');
                    const corrected = val.replace(/-/g, '_');
                    console.error(`    "${val}" → "${corrected}"`);
                    console.error('\n  ハイフン（-）をアンダースコア（_）に置き換えてください。');
                    console.error(`  ファイル: ${filename}`);
                    console.error(`  列: ${key}`);
                    console.error(`  行番号: ${rowNumber}\n`);
                    process.exit(1);
                } else if (Array.isArray(val)) {
                    val.forEach((item, index) => {
                        checkHyphen(item, `${fieldName}[${index}]`);
                    });
                }
            };
            
            checkHyphen(value, key);
        }

        rows.push(rowData);
    });
    // console.log(`rows:\n ${rows}`);
    return rows;
}

export function getUserUids(rows) {
    const uids = rows.map(group => group.uid).filter(Boolean);
    return uids;
}