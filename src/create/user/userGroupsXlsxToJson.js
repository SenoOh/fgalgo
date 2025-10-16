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

        rows.push(rowData);
    });
    // console.log(`rows:\n ${rows}`);
    return rows;
}

export function getUserUids(rows) {
    const uids = rows.map(group => group.uid).filter(Boolean);
    return uids;
}