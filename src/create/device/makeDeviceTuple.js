// デバイスのタイプを変換する関数
function convertDeviceType(deviceSetupInfo, deviceTypeMapJson) {
    // console.log(`\ndeviceSetupInfo:\n`, JSON.stringify(deviceSetupInfo, null, 2));
    // console.log(`\ndeviceTypeMapJson:\n`, JSON.stringify(deviceTypeMapJson, null, 2));
    const typeMap = {};
    deviceTypeMapJson.forEach(entry => {
        entry.typeset.forEach(device => {
            typeMap[device] = entry.type;
        });
    });

    return deviceSetupInfo.map(device => {
        return {
            device: device.device,
            type: typeMap[device.device] || device.type, // タイプを変換
            roles: device.roles // actionsを取り除く
        };
    });
}


function generateTupleJson(userAttrJson, result) {
    const tuples = [];

    for (const device of result) {
        const { device: deviceName, type, roles } = device;
        // console.log(`Processing device: ${deviceName}, type: ${type}, roles:`, roles);

        // デバイスタイプ名のハイフンをアンダースコアに変換
        const normalizedType = type.replace(/-/g, '_');

        for (const [relation, users] of Object.entries(roles)) {
            for (const user of users) {
                const userType = getUserType(userAttrJson, user); // ユーザタイプを取得
                // console.log(`  User: ${user}, Type: ${userType}`);
                const userField = userType === 'group' ? `${userType}:${user}#member` : `${userType}:${user}`;
                const tuple = {
                    user: userField,
                    relation: relation === 'room' ? 'has_device' : relation, // room を has_device に変換
                    object: `${normalizedType}:${deviceName}` // <type>:<device> を生成（ハイフンをアンダースコアに変換）
                };
                tuples.push(tuple);
            }
        }
    }

    return tuples;
}

// ユーザタイプを取得する関数
function getUserType(json, value) {
    try {
        // 各ユーザのプロパティを動的にチェック
        for (const user of json) {
            for (const [key, val] of Object.entries(user)) {
                if (Array.isArray(val)) {
                    // プロパティが配列の場合、配列内の要素と比較
                    if (val.includes(value)) {
                        return key === "uid" ? "user" : key; // uid を user に置換
                    }
                } else {
                    // プロパティが単一の値の場合
                    if (val === value) {
                        return key === "uid" ? "user" : key; // uid を user に置換
                    }
                }
            }
        }
        // 該当なしの場合はエラーをスロー
        throw new Error(`Value "${value}" の型が判別できませんでした。`);
    } catch (err) {
        console.error('Error reading user_attributes.json:', err);
        throw err; // エラーを再スロー
    }
}


export function makeDeviceTuple(deviceSetupInfo, deviceTypeMapJson, userAttrJson) {
    try {
        const result = convertDeviceType(deviceSetupInfo, deviceTypeMapJson);
        // console.log(`\n変換後のデバイス情報:\n`, JSON.stringify(result, null, 2));
        const deviceTupleJson = generateTupleJson(userAttrJson, result);
        return deviceTupleJson;
    } catch (error) {
        console.error('Error during processing:', error);
    }
}
