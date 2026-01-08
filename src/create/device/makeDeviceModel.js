import ejs from 'ejs';
// ユーザ属性から型を取得する関数

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

async function processRolesAndActions(roles, actions, type, matterDeviceTypeJson, userAttrJson) {
    const relations = [];
    // roles を処理
    for (const [role, values] of Object.entries(roles)) {
        const roleTypes = await Promise.all(values.map(value => getUserType(userAttrJson, value)));
        const uniqueRoleTypes = [...new Set(roleTypes)]; // 型の重複を排除

        let formattedRoleTypes;
        let formattedRole = role;

        if (["admin", "junior", "guest"].includes(role)) {
            const defaultTypes = ["user", "group#member"];
            const mergedTypes = [...new Set([...defaultTypes, ...uniqueRoleTypes])];
            formattedRoleTypes = `[${mergedTypes.join(', ')}]`;
        } else if (role === "room") {
            const defaultTypes = ["room"];
            const mergedTypes = [...new Set([...defaultTypes, ...uniqueRoleTypes])];
            formattedRoleTypes = `[${mergedTypes.join(', ')}]`;
            formattedRole = "has_device";
        } else {
            formattedRoleTypes = `[${uniqueRoleTypes.join(', ')}]`;
        }
        relations.push(`define ${formattedRole}: ${formattedRoleTypes}`);
    }

    // actions を処理
    const customActions = new Set();
    for (const [action, roleExpression] of Object.entries(actions)) {
        if (action === "can_action") {
            relations.push(`define ${action}: ${roleExpression}`);
        } else {
            relations.push(`define can_${action}: ${roleExpression}`);
            customActions.add(action); // カスタム設定されたアクションを記録
        }
    }

    // devicetype.json から commands と attributes を追加（カスタム設定済みを除く）
    const matchingDeviceType = matterDeviceTypeJson.find(dt => dt.devicetype === type);
    if (matchingDeviceType) {
        // commands を追加（カスタム設定されていないもののみ）
        if (Array.isArray(matchingDeviceType.commands)) {
            for (const command of matchingDeviceType.commands) {
                if (!customActions.has(command)) {
                    relations.push(`define can_${command}: can_action`);
                }
            }
        }
        // attributes を追加（カスタム設定されていないもののみ）
        if (Array.isArray(matchingDeviceType.attributes)) {
            for (const attribute of matchingDeviceType.attributes) {
                if (!customActions.has(attribute)) {
                    relations.push(`define can_${attribute}: can_action`);
                }
            }
        }
    }

    // console.log(`relations:\n${relations}\n\n\n`);
    const seen = new Set();
    const uniqueElements = [];
    for (const elem of relations) {
        const trimmed = elem.trim();
        const keyMatch = trimmed.match(/^define\s+([^\s:]+):/);

        if (keyMatch) {
            const key = keyMatch[1];
            if (!seen.has(key)) {
            seen.add(key);
            uniqueElements.push(trimmed);
            }
        }
    }
    return uniqueElements;
}

function refineModelFGA(modelFGA, deviceTypeList) {
    const lines = modelFGA.split('\n');
    const typeRegex = /^type\s+([\w\d]+)_([\w\d_]+)$/; // `type` 行を検出する正規表現 (例: light105_onofflightswitch, aircon105_room_airconditioner)
    const devicetypeMap = new Map(); // devicetype ごとに relations をグループ化
    const result = [];
    let currentType = null;
    let currentDevicetype = null;
    let currentRelations = [];

    // 1. 各 devicetype の relations を収集
    for (const line of lines) {
        const match = line.match(typeRegex);
        if (match) {
            // 新しい type の開始
            if (currentDevicetype && currentRelations.length > 0) {
                const relationsKey = JSON.stringify(currentRelations);
                if (!devicetypeMap.has(currentDevicetype)) {
                    devicetypeMap.set(currentDevicetype, new Map());
                }
                if (!devicetypeMap.get(currentDevicetype).has(relationsKey)) {
                    devicetypeMap.get(currentDevicetype).set(relationsKey, []);
                }
                devicetypeMap.get(currentDevicetype).get(relationsKey).push(currentType);
            }

            currentType = match[1] + '_' + match[2]; // 例: switch101_onofflightswitch
            currentDevicetype = match[2]; // 例: onofflightswitch
            currentRelations = [];
        } else if (line.trim().startsWith('define')) {
            // relations 行を収集
            currentRelations.push(line.trim());
        }
    }

    // 最後の devicetype を処理
    if (currentDevicetype && currentRelations.length > 0) {
        const relationsKey = JSON.stringify(currentRelations);
        if (!devicetypeMap.has(currentDevicetype)) {
            devicetypeMap.set(currentDevicetype, new Map());
        }
        if (!devicetypeMap.get(currentDevicetype).has(relationsKey)) {
            devicetypeMap.get(currentDevicetype).set(relationsKey, []);
        }
        devicetypeMap.get(currentDevicetype).get(relationsKey).push(currentType);
    }

    // 2. devicetypeMap を基にリファクタリング
    const typeMapping = new Map();
    for (const [devicetype, groupedRelations] of devicetypeMap.entries()) {
        // console.log(`Processing devicetype: ${devicetype}`);
        let typeCounter = 1;
        const typeOccurrences = []; // devicetype に関連する type の一覧

        // devicetype に関連する type を収集
        for (const [relationsKey, typeList] of groupedRelations.entries()) {
            typeOccurrences.push(...typeList);
        }

        // console.log(`devicetype: ${devicetype}, typeOccurrences: ${typeOccurrences}`);
        // 通常の処理: devicetype に関連する type をリファクタリング
        
        for (const [relationsKey, typeList] of groupedRelations.entries()) {
            // console.log(`relationsKey: ${relationsKey}, typeList: ${typeList}`);
            if (typeList.length === 1) {
                // console.log(`一意な type: ${typeList[0]}`);
                // 一意な type をそのまま使用
                result.push(`type ${typeList[0]}`);
                typeMapping.set(typeList[0], typeList[0]); 
            } else {
                // グループ化された type に共通の名前を付ける
                // console.log(`グループ化された type: ${typeList}`);
                const commonType = `${devicetype}_${typeCounter}`;
                typeMapping.set(commonType, typeList); 
                typeCounter++;
                result.push(`type ${commonType}`);
            }

            // relations を追加
            const relations = JSON.parse(relationsKey);
            result.push('  relations');
            for (const relation of relations) {
                result.push(`    ${relation}`);
            }
        }
    }
    // console.log("=== typeMapping の内容 ===");
    for (const [outputTypeName, originalTypes] of typeMapping.entries()) {
        // console.log(`出力用 type: ${outputTypeName}`);
        // console.log(`  対応する元の type: ${JSON.stringify(originalTypes)}`);
    }
    const typeMappingJson = [];

    for (const [outputTypeName, originalTypes] of typeMapping.entries()) {
        typeMappingJson.push({
            type: outputTypeName,
            typeset: Array.isArray(originalTypes) ? originalTypes : [originalTypes]
        });
    }

    // console.log("=== typeMapping の JSON ===");
    // console.log(JSON.stringify(typeMappingJson, null, 2)); 

    let resultlist = result.join('\n');
    // console.log(`resultlist: ${resultlist}`);

    
    const typeLines = resultlist.split('\n').filter(line => line.startsWith('type '));
    // console.log(`typeLines: ${typeLines}`);
    
    let fix_result = resultlist;

    // console.log(`devicetypes: ${deviceTypeList}`);
    
    // deviceTypeListを正規化（ハイフンをアンダースコアに変換）
    const normalizedDeviceTypeList = deviceTypeList.map(dt => dt.replace(/-/g, '_'));
    
    let transformed = typeMappingJson.map(entry => {
        const newTypeset = entry.typeset.map(t => {
            // デバイス名_デバイスタイプ の形式から、デバイス名部分のみを抽出
            // 例: light105_onofflightswitch -> light105
            // 例: aircon105_room_airconditioner -> aircon105
            
            // すべての正規化されたデバイスタイプに対してマッチングを試みる
            for (const deviceType of normalizedDeviceTypeList) {
                const suffix = `_${deviceType}`;
                if (t.endsWith(suffix)) {
                    return t.slice(0, -suffix.length);
                }
            }
            
            // マッチしない場合は、最後のアンダースコアで分割（フォールバック）
            const lastUnderscoreIndex = t.lastIndexOf("_");
            return lastUnderscoreIndex !== -1 ? t.slice(0, lastUnderscoreIndex) : t;
        });
        return {
            ...entry,
            typeset: newTypeset
        };
    });

    for (const dtype of deviceTypeList) {
        const regex = new RegExp(`^type ${dtype}_(\\d+)$`);
        // console.log(`dtype: ${dtype}, regex: ${regex}`);
        const matches = typeLines.filter(line => regex.test(line));
        if (matches.length === 1) {
            const originalLine = matches[0].trim();             // 例: "type doorlock_1"
            // console.log(`originalLine: ${originalLine}`);
            const replacedLine = `type ${dtype}`;               // 例: "type doorlock"
            // console.log(`replacedLine: ${replacedLine}`);
            const pattern = new RegExp(`^${originalLine}`, 'm');
            // console.log(`pattern: ${pattern}`);
            fix_result = fix_result.replace(pattern, replacedLine);
            
            let chenged = transformed.map(entry => {
                const newType = entry.type === originalLine.replace("type ", "") ? replacedLine.replace("type ", "") : entry.type;
                return {
                    ...entry,
                    type: newType
                };
            });
            transformed = chenged;
            // console.log(`chenged: ${JSON.stringify(chenged, null, 2)}`);
        }
    }
    // console.log(`transformed: ${JSON.stringify(transformed, null, 2)}`);
    
    // console.log(`fix_resultの中のtype:${fix_result.split('\n').filter(line => line.startsWith('type '))}`);

    return { transformed, fix_result };
}


export async function makeDeviceModel(deviceSetupInfo, matterDeviceTypeJson, userAttrJson, deviceTemplatePath) {
    try{
        const deviceTypeList = [...new Set(deviceSetupInfo.map(device => device.type))];
        const types = [];

        for (const device of deviceSetupInfo) {
            const deviceName = device.device;
            const type = device.type;
            const roles = device.roles;
            const actions = device.actions;

            const relations = await processRolesAndActions(roles, actions, type, matterDeviceTypeJson, userAttrJson);

            // デバイスタイプ名のハイフンをアンダースコアに変換
            const normalizedType = type.replace(/-/g, '_');

            // デバイスごとに <device_type> を作成
            types.push({ type: `${deviceName}_${normalizedType}`, relations });
        }


        // EJS テンプレートを使用して device_model.fga を生成
        const modelFGA = await ejs.renderFile(deviceTemplatePath, { types });
        // リファクタリング処理を実行
        const {transformed: deviceTypeMapJson, fix_result: deviceModelFGA} = refineModelFGA(modelFGA, deviceTypeList);
        return { deviceTypeMapJson, deviceModelFGA };
    } catch (err) {
        console.error('Error in makeDeviceModel:', err);
        throw err; // エラーを再スロー
    }
}
