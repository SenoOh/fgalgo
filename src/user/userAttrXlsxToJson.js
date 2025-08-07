// user_attribute_xlsx_to_json.js
import ExcelJS from 'exceljs';

export async function userAttrXlsxToJson(groupUidList, filename) {
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

        const groupVal = rowData["group"];
        const groupArray = Array.isArray(groupVal) ? groupVal : [groupVal];

        const undefinedGroups = groupArray.filter(g => !groupUidList.includes(g));
        if (undefinedGroups.length > 0) {
            console.error(`Error :The group name "${undefinedGroups.join(', ')}" is not defined（行 ${rowNumber}）`);
            process.exit(1);
        }

        rows.push(rowData);
    });
    return rows;
}
