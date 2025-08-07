import inquirer from 'inquirer';

function getDeviceInfo(json) {
    try {
        const deviceUids = json.map(device => device.uid);
        process.stdout.write(`\n 以下のデバイスが見つかりました\n`);
        deviceUids.forEach((device, index) => {
            process.stdout.write(` [${index + 1}] ${device}\n`);
        });
        const types = [...new Set(json.map(device => device.type))];
        process.stdout.write(`\n 以下のデバイスタイプが見つかりました\n`);
        types.forEach((device, index) => {
            process.stdout.write(` [${index + 1}] ${device}\n`);
        });
        return deviceUids;
    } catch (err) {
        process.stdout.write('Error reading device_attributes.json:', err);
        return { uids: [] }; // エラー時は空の配列を返す
    }
}

function getRoomList(json) {
    try {
        const roomList = [...new Set(
            json.flatMap(user => 
                Array.isArray(user.room) ? user.room : [user.room]
            )
        )];
        return roomList;
    } catch (err) {
        process.stdout.write('Error reading JSON file:', err);
        return [];
    }
}

function getTypeToUids(json, uid) {
    try {
        // uid に一致するオブジェクトを検索
        const matchedDevice = json.find(device => device.uid === uid);

        // 一致した場合は type を返す
        if (matchedDevice) {
            return matchedDevice.type;
        } else {
            process.stdout.write(`指定された uid (${uid}) に一致するデバイスが見つかりませんでした。`);
            return null;
        }
    } catch (err) {
        process.stdout.write('Error reading device_attributes.json:', err);
        return null;
    }
}


function getDeviceActions(json, type){
    try {
        // type に一致するデバイスのアクションを取得
        const matchedDevice = json.find(device => device.devicetype === type);
        
        if (matchedDevice) {
            return matchedDevice.commands;
        } else {
            process.stdout.write(`指定された type (${type}) に一致するデバイスが見つかりませんでした。`);
            return [];
        }
    } catch (err) {
        process.stdout.write('Error reading device_attributes.json:', err);
        return [];
    }
}

async function setupRoles(rooms, user, group) {
    try {
        const userAttributesUids = user.map(user => user.uid);
        const userGroupsUids = group.map(group => group.uid);
        const allUids = [...new Set([...userAttributesUids, ...userGroupsUids])];

        // チェックボックスで選択
        const roles = {};
        roles.admin = (await inquirer.prompt({
            type: 'checkbox', // 複数選択可能にする
            name: 'admin',
            message: '1. admin 権限を持つユーザを選択してください:',
            choices: allUids.map((uid, i) => ({ name: `[${i + 1}] ${uid}`, value: uid }))
        })).admin;

        roles.junior = (await inquirer.prompt({
            type: 'checkbox', // 複数選択可能にする
            name: 'junior',
            message: '2. junior 権限を持つユーザを選択してください',
            choices: allUids.map((uid, i) => ({ name: `[${i + 1}] ${uid}`, value: uid }))
        })).junior;

        roles.guest = (await inquirer.prompt({
            type: 'checkbox', // 複数選択可能にする
            name: 'guest',
            message: '3. guest 権限を持つユーザを選択してください',
            choices: allUids.map((uid, i) => ({ name: `[${i + 1}] ${uid}`, value: uid }))
        })).guest;

        roles.room = (await inquirer.prompt({
            type: 'checkbox', // 複数選択可能にする
            name: 'room',
            message: '4. このデバイスが存在するroomを選択してください',
            choices: rooms.map((uid, i) => ({ name: `[${i + 1}] ${uid}`, value: uid }))
        })).room;

        return roles;
    } catch (err) {
        process.stdout.write('エラーが発生しました:', err);
        return null;
    }
}

const previousSettings = {};

async function setupActions(json, type) {
    // 過去の設定が存在するか確認
    if (previousSettings[type]) {
        const { usePreviousSettings } = await inquirer.prompt({
            name: 'usePreviousSettings',
            type: 'confirm',
            message: `過去に同じタイプ (${type}) のデバイスが設定されています。最新の設定内容を適用しますか？`
        });

        if (usePreviousSettings) {
            console.log(`タイプ (${type}) の最新設定を適用しました。`);
            return previousSettings[type]; // 過去の設定をそのまま返す
        }
    }

    const possibleActions = getDeviceActions(json, type);
    const { useSameRole } = await inquirer.prompt({
        name: 'useSameRole',
        type: 'confirm',
        message: ' 全ての操作を共通の権限で管理しますか？'
    });

    const actions = {};

    if (useSameRole) {
        // Yesの場合: 共通のロールを or, and で表現
        const { commonRoleExpression } = await inquirer.prompt({
            name: 'commonRoleExpression',
            message: '共通のロールを入力してください（例: admin or junior, admin and junior）'
        });

        actions['can_action'] = commonRoleExpression;

    } else {
        // Noの場合: カスタム設定
        const { selected } = await inquirer.prompt({
            name: 'selected',
            type: 'checkbox',
            message: 'カスタム設定したいアクションを選んでください（複数選択可）',
            choices: possibleActions
        });

        for (const act of selected) {
            const { roleExpression } = await inquirer.prompt({
                name: 'roleExpression',
                message: `${act} アクションに付けたいロールを入力してください（例: admin or junior, admin and junior）`
            });
            actions[act] = roleExpression;
        }

        // 未選択のアクションを取得

        const unselectedActions = possibleActions.filter(act => !selected.includes(act));
    
        // 未選択のアクションについてまとめてデフォルトのロールを設定
        if (unselectedActions.length > 0) {
            const { defaultRoleExpression } = await inquirer.prompt({
                name: 'defaultRoleExpression',
                message: `未選択のアクションに付けたいデフォルトのロールを入力してください（例: admin or junior, admin and junior）`
            });

            actions['can_action'] = defaultRoleExpression;
        }
    }

    previousSettings[type] = actions;
    const str = JSON.stringify(previousSettings, null, 2);
    process.stdout.write(`${str}\n`);

    return actions;
}


async function processDeviceType(device, rooms, deviceAttrJson, userAttrJSON, userGroupJSON, matterDeviceTypeJson) {
    process.stdout.write(`\n デバイス [${device}] の基本設定を開始します\n`);
    const roles = await setupRoles(rooms, userAttrJSON, userGroupJSON);
    const type = getTypeToUids(deviceAttrJson, device);
    const actions = await setupActions(matterDeviceTypeJson, type);

    const result = {
        device: device,
        type: type,
        roles: roles,
        actions: actions
    };

    const resultString = JSON.stringify(result, null, 2);

    process.stdout.write(`\n デバイス [${device}] の設定が完了しました。`);
    process.stdout.write(`\n 結果：\n${resultString}\n`);
    return result; // 各デバイスの結果を返す
}

export async function getDeviceSetupInfo(deviceAttrJson, userAttrJson, userGroupJson, matterDeviceTypeJson) {
    const deviceUids = getDeviceInfo(deviceAttrJson);
    const roomList = getRoomList(userAttrJson);
    const allResults = []; // すべてのデバイスの結果を格納する配列

    for (const device of deviceUids) {
        const result = await processDeviceType(device, roomList, deviceAttrJson, userAttrJson, userGroupJson, matterDeviceTypeJson);
        allResults.push(result); // 各デバイスの結果を収集
    }
    return allResults; // すべての結果を返す
}
