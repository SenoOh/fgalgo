// device_attribute_xlsx_to_json.js
import ExcelJS from 'exceljs';
import fs from 'fs/promises';

export async function getDeviceType(filename) {
    try {
        const jsonData = await fs.readFile(filename, 'utf-8');
        const typeArray = JSON.parse(jsonData);
        const deviceTypeNames = typeArray.map(device => device.devicetype);
        return deviceTypeNames;
    } catch (err) {
        console.error('Error reading matter.json:', err);
        return [];
    }
}

export async function deviceAttrXlsxToJson(DeviceType, filename) {
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

        const typeVal = rowData["type"];
        const typeArray = Array.isArray(typeVal) ? typeVal : [typeVal];

        const undefinedTypes = typeArray.filter(type => !DeviceType.includes(type));
        if (undefinedTypes.length > 0) {
            console.error(`Error: The type name "${undefinedTypes.join(', ')}" is not defined`);
            process.exit(1);
        }

        rows.push(rowData);
    });
    return rows;
}
