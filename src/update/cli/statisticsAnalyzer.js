/**
 * OpenFGA統計分析モジュール
 */
import fs from 'fs';
import path from 'path';

/**
 * Authorization Model と Relationship Tuples からデバイスタイプを検出
 * @param {Object} authorizationModel - Authorization Model
 * @param {Array} relationshipTuples - Relationship Tuples
 * @param {string} basePath - ファイルのベースパス（devicetype.json用）
 * @returns {Set} デバイスタイプ名のSet
 */
function loadDeviceTypes(authorizationModel, relationshipTuples, basePath = './file/json/matter') {
    const deviceTypes = new Set();
    
    // devicetype.jsonからデバイスタイプ定義を読み込み
    let deviceTypeDefinitions = [];
    try {
        const deviceTypeFilePath = path.join(basePath, 'devicetype.json');
        deviceTypeDefinitions = JSON.parse(fs.readFileSync(deviceTypeFilePath, 'utf8'));
        console.log(`devicetype.json読み込み成功: ${deviceTypeDefinitions.length}件`);
    } catch (error) {
        console.warn('devicetype.jsonの読み込みに失敗しました:', error.message);
        // フォールバック: 基本的なデバイスタイプ定義
        deviceTypeDefinitions = [
            { devicetype: 'doorlock' },
            { devicetype: 'device' }
        ];
    }
    
    // Relationship Tuplesからオブジェクトを収集
    const objectsInTuples = new Set();
    relationshipTuples.forEach(tuple => {
        if (tuple.key && tuple.key.object) {
            objectsInTuples.add(tuple.key.object);
        }
    });
    
    // Authorization Modelのtype定義を収集
    const authModelTypes = new Set();
    if (authorizationModel && authorizationModel.type_definitions) {
        authorizationModel.type_definitions.forEach(typeDef => {
            authModelTypes.add(typeDef.type);
        });
    }
    
    // devicetype.jsonの各devicetypeについて検証
    deviceTypeDefinitions.forEach(deviceTypeDef => {
        const deviceTypeName = deviceTypeDef.devicetype;
        let isDeviceType = false;
        
        // 1. Authorization Modelのtype定義に含まれているかチェック
        authModelTypes.forEach(modelType => {
            if (modelType.includes(deviceTypeName)) {
                deviceTypes.add(modelType);
                isDeviceType = true;
                console.log(`デバイスタイプマッチ (Auth Model): ${modelType} ← ${deviceTypeName}`);
            }
        });
        
        // 2. Relationship Tuplesのオブジェクトに含まれているかチェック
        objectsInTuples.forEach(objectName => {
            if (objectName.includes(':')) {
                const [type, identifier] = objectName.split(':', 2);
                
                // typeまたはidentifierにdevicetypeが含まれているかチェック
                if (type.includes(deviceTypeName) || identifier.includes(deviceTypeName)) {
                    // Authorization Modelにそのtypeが定義されている場合のみ有効
                    if (authModelTypes.has(type)) {
                        deviceTypes.add(type);
                        isDeviceType = true;
                        console.log(`デバイスタイプマッチ (Tuple Object): ${type} ← ${deviceTypeName} (object: ${objectName})`);
                    }
                }
            }
        });
    });
    
    console.log(`検出されたデバイスタイプ数: ${deviceTypes.size}`);
    console.log(`デバイスタイプ一覧: [${Array.from(deviceTypes).join(', ')}]`);
    
    return deviceTypes;
}

/**
 * オブジェクト名がデバイスかどうかを判定
 * @param {string} objectName - オブジェクト名 (例: "doorlock:doorlockStudyRoom")
 * @param {Set} detectedDeviceTypes - Authorization Modelから検出されたデバイスタイプのSet
 * @returns {Object|null} デバイス情報またはnull
 */
function parseDeviceInfo(objectName, detectedDeviceTypes) {
    if (!objectName || !objectName.includes(':')) {
        return null;
    }
    
    const colonIndex = objectName.indexOf(':');
    const prefix = objectName.substring(0, colonIndex);
    
    // Authorization Modelから検出されたデバイスタイプと一致するかチェック
    for (const deviceType of detectedDeviceTypes) {
        if (prefix === deviceType) {
            return {
                id: objectName.substring(colonIndex + 1),
                type: deviceType,
                fullName: objectName
            };
        }
    }
    
    return null;
}

/**
 * Authorization Modelから定義されている全リレーションを取得
 * @param {Object} authorizationModel - Authorization Model
 * @returns {Map} タイプ別の定義済みリレーション
 */
function getDefinedRelations(authorizationModel) {
    const definedRelations = new Map();
    
    if (!authorizationModel || !authorizationModel.type_definitions) {
        return definedRelations;
    }
    
    authorizationModel.type_definitions.forEach(typeDef => {
        if (typeDef.relations) {
            const relations = Object.keys(typeDef.relations);
            definedRelations.set(typeDef.type, relations);
        }
    });
    
    return definedRelations;
}

/**
 * Relationship Tuplesから統計情報を分析（存在/非存在リレーション含む）
 * @param {Array} relationshipTuples - Relationship Tuples
 * @param {Object} authorizationModel - Authorization Model
 * @param {string} basePath - ファイルのベースパス
 * @returns {Object} 詳細統計情報
 */
export function analyzeStatistics(relationshipTuples, authorizationModel, basePath = './file/json/matter') {
    const users = new Set();
    const groups = new Set();
    const devices = new Set();
    const deviceTypes = new Set();

    const userDetails = new Map();
    const groupDetails = new Map();
    const deviceDetails = new Map();
    const deviceTypeDetails = new Map();

    // Authorization Modelから定義済みリレーションを取得
    const definedRelations = getDefinedRelations(authorizationModel);
    
    // Authorization Model と Relationship Tuples からデバイスタイプを検出
    const knownDeviceTypes = loadDeviceTypes(authorizationModel, relationshipTuples, basePath);

    relationshipTuples.forEach(tuple => {
        const { user, object, relation } = tuple.key;

        // ユーザ情報を収集
        if (user && user.startsWith('user:')) {
            const userId = user.replace('user:', '');
            users.add(userId);
            
            if (!userDetails.has(userId)) {
                userDetails.set(userId, {
                    id: userId,
                    groups: new Set(),
                    rooms: new Set(),
                    devices: new Set(),
                    activeRelations: new Set(),
                    inactiveRelations: new Set()
                });
            }
            
            const userDetail = userDetails.get(userId);
            userDetail.activeRelations.add(relation);
            
            if (object.startsWith('group:')) {
                userDetail.groups.add(object.replace('group:', ''));
            } else if (object.startsWith('room:')) {
                userDetail.rooms.add(object.replace('room:', ''));
            } else {
                // 動的デバイス判定
                const deviceInfo = parseDeviceInfo(object, knownDeviceTypes);
                if (deviceInfo) {
                    userDetail.devices.add(deviceInfo.id);
                }
            }
        }

        // グループ情報を収集
        if (object && object.startsWith('group:')) {
            const groupId = object.replace('group:', '');
            groups.add(groupId);
            
            if (!groupDetails.has(groupId)) {
                groupDetails.set(groupId, {
                    id: groupId,
                    members: new Set(),
                    activeRelations: new Set(),
                    inactiveRelations: new Set()
                });
            }
            
            const groupDetail = groupDetails.get(groupId);
            groupDetail.activeRelations.add(relation);
            
            if (user && user.startsWith('user:')) {
                groupDetail.members.add(user.replace('user:', ''));
            }
        }

        // デバイス情報を収集（動的判定）
        const deviceInfo = parseDeviceInfo(object, knownDeviceTypes);
        if (deviceInfo) {
            devices.add(deviceInfo.id);
            
            if (!deviceDetails.has(deviceInfo.id)) {
                deviceDetails.set(deviceInfo.id, {
                    id: deviceInfo.id,
                    type: deviceInfo.type,
                    users: new Set(),
                    activeRelations: new Set(),
                    inactiveRelations: new Set()
                });
            }
            
            const deviceDetail = deviceDetails.get(deviceInfo.id);
            deviceDetail.activeRelations.add(relation);
            
            if (user && user.startsWith('user:')) {
                deviceDetail.users.add(user.replace('user:', ''));
            }
        }

        // デバイスタイプ情報を収集（動的判定）
        if (deviceInfo) {
            deviceTypes.add(deviceInfo.type);
            
            if (!deviceTypeDetails.has(deviceInfo.type)) {
                deviceTypeDetails.set(deviceInfo.type, {
                    type: deviceInfo.type,
                    devices: new Set(),
                    activeRelations: new Set(),
                    inactiveRelations: new Set()
                });
            }
            
            const typeDetail = deviceTypeDetails.get(deviceInfo.type);
            typeDetail.activeRelations.add(relation);
            typeDetail.devices.add(deviceInfo.id);
        }
    });

    // 非アクティブリレーションを特定
    const addInactiveRelations = (details, typeName) => {
        const definedRels = definedRelations.get(typeName) || [];
        Array.from(details).forEach(detail => {
            definedRels.forEach(rel => {
                if (!detail.activeRelations.has(rel)) {
                    detail.inactiveRelations.add(rel);
                }
            });
        });
    };

    // 各タイプの非アクティブリレーションを設定
    addInactiveRelations(userDetails.values(), 'user');
    addInactiveRelations(groupDetails.values(), 'group');
    addInactiveRelations(deviceDetails.values(), 'doorlock');
    addInactiveRelations(deviceTypeDetails.values(), 'doorlock');

    // Set を Array に変換
    const convertDetails = (detail) => ({
        ...detail,
        groups: detail.groups ? Array.from(detail.groups) : undefined,
        rooms: detail.rooms ? Array.from(detail.rooms) : undefined,
        devices: detail.devices ? Array.from(detail.devices) : undefined,
        members: detail.members ? Array.from(detail.members) : undefined,
        users: detail.users ? Array.from(detail.users) : undefined,
        activeRelations: Array.from(detail.activeRelations),
        inactiveRelations: Array.from(detail.inactiveRelations)
    });

    return {
        users: {
            count: users.size,
            items: Array.from(userDetails.values()).map(convertDetails)
        },
        groups: {
            count: groups.size,
            items: Array.from(groupDetails.values()).map(convertDetails)
        },
        devices: {
            count: devices.size,
            items: Array.from(deviceDetails.values()).map(convertDetails)
        },
        deviceTypes: {
            count: deviceTypes.size,
            items: Array.from(deviceTypeDetails.values()).map(convertDetails)
        },
        definedRelations: Object.fromEntries(definedRelations)
    };
}

/**
 * 統計情報を整形して出力
 * @param {Object} statistics - 統計情報
 */
export function printStatistics(statistics) {
    console.log('\n=== 詳細統計情報 ===');
    
    console.log(`\n📊 ユーザ数: ${statistics.users.count}`);
    if (statistics.users.items.length > 0) {
        statistics.users.items.forEach(user => {
            console.log(`  - ${user.id}`);
            console.log(`    グループ: [${user.groups.join(', ')}]`);
            console.log(`    ルーム: [${user.rooms.join(', ')}]`);
            console.log(`    デバイス: [${user.devices.join(', ')}]`);
            console.log(`    ✅ アクティブリレーション: [${user.activeRelations.join(', ')}]`);
            if (user.inactiveRelations.length > 0) {
                console.log(`    ❌ 非アクティブリレーション: [${user.inactiveRelations.join(', ')}]`);
            }
        });
    }

    console.log(`\n👥 グループ数: ${statistics.groups.count}`);
    if (statistics.groups.items.length > 0) {
        statistics.groups.items.forEach(group => {
            console.log(`  - ${group.id}`);
            console.log(`    メンバ: [${group.members.join(', ')}]`);
            console.log(`    ✅ アクティブリレーション: [${group.activeRelations.join(', ')}]`);
            if (group.inactiveRelations.length > 0) {
                console.log(`    ❌ 非アクティブリレーション: [${group.inactiveRelations.join(', ')}]`);
            }
        });
    }

    console.log(`\n🔒 デバイス数: ${statistics.devices.count}`);
    if (statistics.devices.items.length > 0) {
        statistics.devices.items.forEach(device => {
            console.log(`  - ${device.id} (${device.type})`);
            console.log(`    ユーザ: [${device.users.join(', ')}]`);
            console.log(`    ✅ アクティブリレーション: [${device.activeRelations.join(', ')}]`);
            if (device.inactiveRelations.length > 0) {
                console.log(`    ❌ 非アクティブリレーション: [${device.inactiveRelations.join(', ')}]`);
            }
        });
    }

    console.log(`\n⚙️  デバイスタイプ数: ${statistics.deviceTypes.count}`);
    if (statistics.deviceTypes.items.length > 0) {
        statistics.deviceTypes.items.forEach(type => {
            console.log(`  - ${type.type}`);
            console.log(`    デバイス: [${type.devices.join(', ')}]`);
            console.log(`    ✅ アクティブリレーション: [${type.activeRelations.join(', ')}]`);
            if (type.inactiveRelations.length > 0) {
                console.log(`    ❌ 非アクティブリレーション: [${type.inactiveRelations.join(', ')}]`);
            }
        });
    }

    console.log(`\n📋 Authorization Model定義済みリレーション:`);
    Object.entries(statistics.definedRelations).forEach(([type, relations]) => {
        console.log(`  ${type}: [${relations.join(', ')}]`);
    });
}
