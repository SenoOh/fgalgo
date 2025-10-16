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

async function setupRoles(rooms, userAttributes, group) {
    try {
        const userAttributesUids = userAttributes.map(attr => attr.uid);
        const userGroupsUids = group.map(group => group.uid);
        const allUids = [...new Set([...userAttributesUids, ...userGroupsUids])];

        const roles = {};
        let currentStep = 0;
        const steps = [
            {
                key: 'admin',
                message: '1. admin 権限を持つユーザを選択してください:',
                choices: allUids
            },
            {
                key: 'junior', 
                message: '2. junior 権限を持つユーザを選択してください',
                choices: allUids
            },
            {
                key: 'guest',
                message: '3. guest 権限を持つユーザを選択してください', 
                choices: allUids
            },
            {
                key: 'room',
                message: '4. このデバイスが存在するroomを選択してください',
                choices: rooms
            }
        ];

        while (currentStep < steps.length) {
            const step = steps[currentStep];
            const choices = step.choices.map((uid, i) => ({ 
                name: `[${i + 1}] ${uid}`, 
                value: uid 
            }));

            // 戻るオプションを追加（最初のステップ以外）
            if (currentStep > 0) {
                choices.push({ 
                    name: '⬅️  前の設定に戻る', 
                    value: '__BACK__' 
                });
            }

            const answer = await inquirer.prompt({
                type: 'checkbox',
                name: step.key,
                message: step.message,
                choices: choices,
                validate: function(input) {
                    // 戻るオプションが選択された場合は単独選択をチェック
                    if (input.includes('__BACK__') && input.length > 1) {
                        return '「前の設定に戻る」は単独で選択してください。';
                    }
                    return true;
                }
            });

            // 戻るオプションが選択された場合
            if (answer[step.key].includes('__BACK__')) {
                currentStep--;
                console.log(`\n${steps[currentStep].key} の設定に戻ります...\n`);
                continue;
            }

            // 通常の選択の場合
            roles[step.key] = answer[step.key];
            
            // 現在の設定状況を表示
            console.log(`✓ ${step.key}: ${answer[step.key].join(', ')}`);
            
            currentStep++;
        }
        
        return roles;
    } catch (err) {
        process.stdout.write('エラーが発生しました:', err);
        return null;
    }
}

const previousSettings = {};

async function setupActions(json, type) {
    const possibleActions = getDeviceActions(json, type);
    let currentStep = 0;
    const actions = {};
    
    while (true) {
        if (currentStep === 0) {
            // Step 1: 共通権限 vs カスタム設定の選択
            const choices = [
                { name: '📝 すべての操作を共通の権限で管理する', value: 'common' },
                { name: '⚙️  各操作を個別にカスタム設定する', value: 'custom' }
            ];
            
            const useSameRoleAnswer = await inquirer.prompt({
                name: 'configType',
                type: 'list',
                message: ' アクション権限の設定方法を選択してください:',
                choices: choices
            });

            if (useSameRoleAnswer.configType === 'common') {
                // 共通権限設定へ
                currentStep = 1;
            } else {
                // カスタム設定へ
                currentStep = 2;
            }
            continue;
        }
        
        if (currentStep === 1) {
            // Step 2a: 共通権限設定
            const commonRoleAnswer = await inquirer.prompt({
                name: 'commonRoleExpression',
                type: 'input',
                message: '共通のロールを入力してください（例: admin or junior, admin and junior）:',
                validate: function(input) {
                    if (!input || input.trim() === '') {
                        return 'ロール表現を入力してください。';
                    }
                    if (input.trim() === '__BACK__') {
                        return true; // 戻る場合は有効
                    }
                    return true;
                },
                prefix: '  ',
                suffix: '\n  💡 戻るには "__BACK__" と入力してください。'
            });

            if (commonRoleAnswer.commonRoleExpression.trim() === '__BACK__') {
                currentStep = 0;
                console.log('\n設定方法の選択に戻ります...\n');
                continue;
            }

            actions['can_action'] = commonRoleAnswer.commonRoleExpression;
            console.log(`✓ 共通権限設定完了: ${commonRoleAnswer.commonRoleExpression}`);
            break;
        }
        
        if (currentStep === 2) {
            // Step 2b: カスタム設定 - アクション選択
            const choices = possibleActions.map(action => ({
                name: action,
                value: action
            }));
            choices.push({ name: '⬅️  前の選択に戻る', value: '__BACK__' });

            const selectedAnswer = await inquirer.prompt({
                name: 'selected',
                type: 'checkbox',
                message: 'カスタム設定したいアクションを選んでください（複数選択可）:',
                choices: choices,
                validate: function(input) {
                    if (input.includes('__BACK__') && input.length > 1) {
                        return '「前の選択に戻る」は単独で選択してください。';
                    }
                    return true;
                }
            });

            if (selectedAnswer.selected.includes('__BACK__')) {
                currentStep = 0;
                console.log('\n設定方法の選択に戻ります...\n');
                continue;
            }

            // 選択されたアクションに対する権限設定
            let actionStep = 0;
            const selectedActions = selectedAnswer.selected;
            
            while (actionStep < selectedActions.length) {
                const action = selectedActions[actionStep];

                const roleAnswer = await inquirer.prompt({
                    name: 'roleExpression',
                    type: 'input',
                    message: `${action} アクションの権限を入力してください（例: admin or junior）:`,
                    validate: function(input) {
                        if (!input || input.trim() === '') {
                            return 'ロール表現を入力してください。';
                        }
                        return true;
                    },
                    prefix: '  ',
                    suffix: '\n  💡 戻るには "__BACK__" と入力してください。'
                });

                if (roleAnswer.roleExpression.trim() === '__BACK__') {
                    if (actionStep > 0) {
                        actionStep--;
                        console.log(`\n${selectedActions[actionStep]} の設定に戻ります...\n`);
                        continue;
                    } else {
                        // アクション選択に戻る
                        currentStep = 2;
                        console.log('\nアクション選択に戻ります...\n');
                        break;
                    }
                }

                actions[action] = roleAnswer.roleExpression;
                console.log(`✓ ${action}: ${roleAnswer.roleExpression}`);
                actionStep++;
            }

            // 全てのアクション設定が完了した場合
            if (actionStep === selectedActions.length) {
                // 未選択のアクションのデフォルト権限設定
                const unselectedActions = possibleActions.filter(act => !selectedActions.includes(act));
                
                if (unselectedActions.length > 0) {
                    const defaultRoleAnswer = await inquirer.prompt({
                        name: 'defaultRoleExpression',
                        type: 'input',
                        message: `未選択のアクション（${unselectedActions.length}個）のデフォルト権限を入力してください:`,
                        validate: function(input) {
                            if (!input || input.trim() === '') {
                                return 'デフォルトロール表現を入力してください。';
                            }
                            return true;
                        }
                    });

                    actions['can_action'] = defaultRoleAnswer.defaultRoleExpression;
                    console.log(`✓ デフォルト権限設定完了: ${defaultRoleAnswer.defaultRoleExpression}`);
                }
                break;
            }
        }
    }

    previousSettings[type] = actions;
    // const str = JSON.stringify(previousSettings, null, 2);
    // process.stdout.write(`${str}\n`);

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

    // const resultString = JSON.stringify(result, null, 2);

    // // process.stdout.write(`\n デバイス [${device}] の設定が完了しました。`);
    // // process.stdout.write(`\n 結果：\n${resultString}\n`);
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
