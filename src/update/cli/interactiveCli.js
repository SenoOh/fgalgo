/**
 * OpenFGA CLI対話モジュール
 */
import chalk from 'chalk';
import inquirer from 'inquirer';
import { createGeminiClient } from '../llm/geminiClient.js';
import { PromptBuilder } from '../llm/llmPrompts.js';
import { executeOpenFGAPlan, ensureOutputDirectory, findOpenFGAFiles } from './planExecutor.js';
import { applyUpdatesToOpenFGA, checkFgaCommand } from '../api/openFgaUpdater.js';



/**
 * メインメニューを表示して選択を取得
 * @returns {Promise<string>} 選択された項目
 */
export async function showMainMenu() {
    console.log(chalk.blue.bold('\n=== OpenFGA 管理ツール ==='));
    console.log(chalk.gray('変更したい項目を選択してください:\n'));
    
    const { choice } = await inquirer.prompt([
        {
            type: 'list',
            name: 'choice',
            message: '管理したい項目を選択してください:',
            choices: [
                {
                    name: chalk.cyan('👤 ユーザ'),
                    value: 'users'
                },
                {
                    name: chalk.green('🔒 デバイス'),
                    value: 'devices'
                },
                {
                    name: chalk.yellow('👥 グループ'),
                    value: 'groups'
                },
                {
                    name: chalk.red('🚪 終了'),
                    value: 'exit'
                }
            ]
        }
    ]);
    
    return choice;
}

/**
 * ユーザ管理メニューを表示
 * @param {Object} statistics - 統計情報
 * @returns {Promise<Object>} 選択された操作とデータ
 */
export async function showUserMenu(statistics) {
    console.log(chalk.cyan.bold('\n=== ユーザ管理 ==='));
    console.log(chalk.gray(`現在のユーザ数: ${statistics.users.count}\n`));
    
    // ユーザ一覧を表示
    if (statistics.users.items.length > 0) {
        console.log(chalk.cyan('ユーザ一覧:'));
        statistics.users.items.forEach((user, index) => {
            console.log(chalk.white(`  ${index + 1}. ${user.id}`));
            console.log(chalk.gray(`     グループ: [${user.groups.join(', ')}]`));
            console.log(chalk.gray(`     デバイス: [${user.devices.join(', ')}]`));
            console.log(chalk.gray(`     アクティブリレーション: [${user.activeRelations.join(', ')}]`));
        });
        console.log();
        
        // ユーザ選択
        const selectedUser = await selectSpecificUser(statistics.users.items);
        if (selectedUser) {
            console.log(chalk.cyan(`\n選択されたユーザ: ${selectedUser.id}`));
            console.log(chalk.gray('TODO: ユーザ操作メニューを実装予定'));
            return { type: 'user', action: 'selected', data: selectedUser };
        }
    } else {
        console.log(chalk.yellow('ユーザが存在しません\n'));
    }
    
    return { type: 'user', action: 'back' };
}

/**
 * 特定のユーザを選択
 * @param {Array} users - ユーザ一覧
 * @returns {Promise<Object|null>} 選択されたユーザ
 */
async function selectSpecificUser(users) {
    if (users.length === 0) {
        return null;
    }
    
    const choices = users.map((user, index) => ({
        name: `${user.id} (グループ: ${user.groups.join(', ')}, デバイス: ${user.devices.join(', ')})`,
        value: user
    }));
    
    choices.push({
        name: chalk.gray('← 戻る'),
        value: null
    });
    
    const { selectedUser } = await inquirer.prompt([
        {
            type: 'list',
            name: 'selectedUser',
            message: '管理するユーザを選択してください:',
            choices: choices
        }
    ]);
    
    return selectedUser;
}

/**
 * デバイス管理メニューを表示
 * @param {Object} statistics - 統計情報
 * @returns {Promise<Object>} 選択された操作とデータ
 */
export async function showDeviceMenu(statistics) {
    console.log(chalk.green.bold('\n=== デバイス管理 ==='));
    console.log(chalk.gray(`現在のデバイス数: ${statistics.devices.count}\n`));
    
    // デバイス一覧を表示
    if (statistics.devices.items.length > 0) {
        console.log(chalk.green('デバイス一覧:'));
        statistics.devices.items.forEach((device, index) => {
            console.log(chalk.white(`  ${index + 1}. ${device.id} (${device.type})`));
            console.log(chalk.gray(`     ユーザ: [${device.users.join(', ')}]`));
            console.log(chalk.gray(`     アクティブリレーション: [${device.activeRelations.join(', ')}]`));
        });
        console.log();
        
        // デバイス選択
        const selectedDevice = await selectSpecificDevice(statistics.devices.items);
        if (selectedDevice) {
            console.log(chalk.green(`\n選択されたデバイス: ${selectedDevice.id} (${selectedDevice.type})`));
            console.log(chalk.gray('TODO: デバイス操作メニューを実装予定'));
            return { type: 'device', action: 'selected', data: selectedDevice };
        }
    } else {
        console.log(chalk.yellow('デバイスが存在しません\n'));
    }
    
    return { type: 'device', action: 'back' };
}

/**
 * 特定のデバイスを選択
 * @param {Array} devices - デバイス一覧
 * @returns {Promise<Object|null>} 選択されたデバイス
 */
async function selectSpecificDevice(devices) {
    if (devices.length === 0) {
        return null;
    }
    
    const choices = devices.map((device, index) => ({
        name: `${device.id} (${device.type}) - ユーザ: [${device.users.join(', ')}]`,
        value: device
    }));
    
    choices.push({
        name: chalk.gray('← 戻る'),
        value: null
    });
    
    const { selectedDevice } = await inquirer.prompt([
        {
            type: 'list',
            name: 'selectedDevice',
            message: '管理するデバイスを選択してください:',
            choices: choices
        }
    ]);
    
    return selectedDevice;
}

/**
 * グループ管理メニューを表示
 * @param {Object} statistics - 統計情報
 * @returns {Promise<Object>} 選択された操作とデータ
 */
export async function showGroupMenu(statistics) {
    console.log(chalk.yellow.bold('\n=== グループ管理 ==='));
    console.log(chalk.gray(`現在のグループ数: ${statistics.groups.count}\n`));
    
    // グループ一覧を表示
    if (statistics.groups.items.length > 0) {
        console.log(chalk.yellow('グループ一覧:'));
        statistics.groups.items.forEach((group, index) => {
            console.log(chalk.white(`  ${index + 1}. ${group.id}`));
            console.log(chalk.gray(`     メンバ: [${group.members.join(', ')}]`));
            console.log(chalk.gray(`     アクティブリレーション: [${group.activeRelations.join(', ')}]`));
        });
        console.log();
        
        // グループ選択
        const selectedGroup = await selectSpecificGroup(statistics.groups.items);
        if (selectedGroup) {
            console.log(chalk.yellow(`\n選択されたグループ: ${selectedGroup.id}`));
            console.log(chalk.gray('TODO: グループ操作メニューを実装予定'));
            return { type: 'group', action: 'selected', data: selectedGroup };
        }
    } else {
        console.log(chalk.yellow('グループが存在しません\n'));
    }
    
    return { type: 'group', action: 'back' };
}

/**
 * 特定のグループを選択
 * @param {Array} groups - グループ一覧
 * @returns {Promise<Object|null>} 選択されたグループ
 */
async function selectSpecificGroup(groups) {
    if (groups.length === 0) {
        return null;
    }
    
    const choices = groups.map((group, index) => ({
        name: `${group.id} - メンバ: [${group.members.join(', ')}]`,
        value: group
    }));
    
    choices.push({
        name: chalk.gray('← 戻る'),
        value: null
    });
    
    const { selectedGroup } = await inquirer.prompt([
        {
            type: 'list',
            name: 'selectedGroup',
            message: '管理するグループを選択してください:',
            choices: choices
        }
    ]);
    
    return selectedGroup;
}

/**
 * 自然言語でアクセス制御権限の変更内容を入力させる
 * @param {string} resourceType - リソースタイプ (user, device, group)
 * @param {Object} resourceData - 選択されたリソースのデータ
 * @returns {Promise<string|null>} 変更内容の記述またはnull
 */
async function getChangeDescription(resourceType, resourceData) {
    const resourceTypeMap = {
        'user': 'ユーザ',
        'device': 'デバイス',
        'group': 'グループ'
    };
    
    const resourceName = resourceTypeMap[resourceType];
    const resourceId = resourceData.id;
    
    console.log(chalk.magenta.bold(`\n=== ${resourceName} "${resourceId}" のアクセス制御権限変更 ===`));
    console.log(chalk.gray('現在の状態:'));
    
    if (resourceType === 'user') {
        console.log(chalk.white(`  グループ: [${resourceData.groups.join(', ')}]`));
        console.log(chalk.white(`  デバイス: [${resourceData.devices.join(', ')}]`));
    } else if (resourceType === 'device') {
        console.log(chalk.white(`  タイプ: ${resourceData.type}`));
        console.log(chalk.white(`  ユーザ: [${resourceData.users.join(', ')}]`));
    } else if (resourceType === 'group') {
        console.log(chalk.white(`  メンバ: [${resourceData.members.join(', ')}]`));
    }
    
    console.log(chalk.white(`  アクティブリレーション: [${resourceData.activeRelations.join(', ')}]`));
    if (resourceData.inactiveRelations.length > 0) {
        console.log(chalk.gray(`  非アクティブリレーション: [${resourceData.inactiveRelations.join(', ')}]`));
    }
    
    console.log(chalk.cyan('\n📝 変更したい内容を自然言語で記述してください:'));
    console.log(chalk.gray('(Ctrl+C で入力をキャンセルして前のメニューに戻る)\n'));
    
    try {
        const { description } = await inquirer.prompt([
            {
                type: 'input',
                name: 'description',
                message: '変更内容を記述してください:',
                validate: (input) => {
                    if (!input.trim()) {
                        return '変更内容を入力してください';
                    }
                    return true;
                }
            }
        ]);
        
        const trimmedDescription = description.trim();
        
        // 確認
        const confirmed = await confirmAction(`以下の変更を実行しますか？\n"${trimmedDescription}"`);
        if (!confirmed) {
            console.log(chalk.yellow('変更をキャンセルしました'));
            return null;
        }
        
        return trimmedDescription;
    } catch (error) {
        // Ctrl+C でキャンセルされた場合
        if (error.name === 'ExitPromptError') {
            console.log(chalk.yellow('\n入力をキャンセルしました'));
            return null;
        }
        throw error;
    }
}

/**
 * 統合OpenFGA分析を実行
 * @param {string} changeDescription - 変更内容の記述
 * @param {string} resourceType - リソースタイプ
 * @param {Object} resourceData - リソースデータ
 * @param {Object} openFGAData - OpenFGAの全体データ（model, tuples, statistics）
 * @returns {Promise<Object|null>} 分析結果またはnull
 */
async function executeIntegratedAnalysis(changeDescription, resourceType, resourceData, openFGAData) {
    try {
        console.log(chalk.blue('\n🚀 LLM統合分析を開始...'));
        
        // OpenFGAコンテキストを準備
        const context = PromptBuilder.prepareOpenFGAContext(
            openFGAData.authorizationModel,
            openFGAData.relationshipTuples,
            openFGAData.statistics
        );
        
        // LLMクライアントを初期化
        const llmClient = createGeminiClient();
        
        // API接続テスト
        console.log(chalk.gray('🔗 LLM接続確認中...'));
        const connectionTest = await llmClient.testConnection();
        if (!connectionTest) {
            console.log(chalk.red('❌ LLM接続に失敗しました．GEMINI_API_KEYを確認してください．'));
            return null;
        }
        
        // 完全統合分析を実行
        const analysisResult = await llmClient.analyzeCompleteOpenFGAOperation(
            changeDescription,
            resourceType,
            resourceData,
            context
        );
        
        if (!analysisResult.success) {
            console.log(chalk.red(`❌ 分析に失敗しました: ${analysisResult.error}`));
            if (analysisResult.details) {
                console.log(chalk.gray(`詳細: ${JSON.stringify(analysisResult.details, null, 2)}`));
            }
            return null;
        }
        
        console.log(chalk.green('✅ LLM統合分析完了'));
        return analysisResult.analysis;
        
    } catch (error) {
        console.log(chalk.red(`❌ 統合分析エラー: ${error.message}`));
        return null;
    }
}

/**
 * 分析結果を表示
 * @param {Object} analysis - 分析結果
 */
function displayAnalysisResults(analysis) {
    const { intent, modelAnalysis, tupleOperations, executionPlan } = analysis;
    
    console.log(chalk.cyan('\n📊 === 分析結果 ==='));
    
    // 1. 意図分析結果
    console.log(chalk.yellow('\n🎯 意図分析:'));
    console.log(chalk.white(`  行動: ${intent.intent} (確信度: ${intent.confidence})`));
    console.log(chalk.white(`  対象: ${intent.target}`));
    console.log(chalk.white(`  権限: ${intent.permission}`));
    console.log(chalk.gray(`  理由: ${intent.reasoning}`));
    
    // 2. Authorization Model分析結果
    console.log(chalk.yellow('\n🏗️  Authorization Model分析:'));
    console.log(chalk.white(`  モデル変更必要: ${modelAnalysis.modelChangeRequired ? 'はい' : 'いいえ'}`));
    console.log(chalk.white(`  推奨アプローチ: ${modelAnalysis.analysis.recommendedApproach}`));
    console.log(chalk.gray(`  理由: ${modelAnalysis.analysis.reasoning}`));
    
    if (modelAnalysis.proposedChanges) {
        console.log(chalk.cyan('\n  📝 提案されるモデル変更:'));
        console.log(chalk.white(`    リソース: ${modelAnalysis.proposedChanges.resourceType}`));
        console.log(chalk.white(`    権限: ${modelAnalysis.proposedChanges.relation}`));
        console.log(chalk.gray(`    現在: ${modelAnalysis.proposedChanges.currentDefinition}`));
        console.log(chalk.green(`    変更後: ${modelAnalysis.proposedChanges.newDefinition}`));
    }
    
    // 3. Tuple操作（元の分析結果から）
    if (tupleOperations && tupleOperations.operations && tupleOperations.operations.length > 0) {
        console.log(chalk.yellow('\n📦 提案されるRelationship Tuples変更:'));
        tupleOperations.operations.forEach((operation, index) => {
            console.log(chalk.white(`  ${index + 1}. ${operation.type}`));
            console.log(chalk.cyan(`     User: ${operation.tuple.user}`));
            console.log(chalk.cyan(`     Relation: ${operation.tuple.relation}`));
            console.log(chalk.cyan(`     Object: ${operation.tuple.object}`));
            console.log(chalk.gray(`     説明: ${operation.description}`));
        });
    }
    
    // 4. 統合実行計画
    if (executionPlan && executionPlan.executionPlan) {
        console.log(chalk.yellow('\n⚙️  統合実行計画:'));
        console.log(chalk.white(`  総ステップ数: ${executionPlan.executionPlan.totalSteps}`));
        console.log(chalk.white(`  モデル変更: ${executionPlan.executionPlan.hasModelChanges ? 'あり' : 'なし'}`));
        console.log(chalk.white(`  Tuple操作: ${executionPlan.executionPlan.hasTupleOperations ? 'あり' : 'なし'}`));
        
        if (executionPlan.modelChanges && executionPlan.modelChanges.length > 0) {
            console.log(chalk.cyan('\n  🔧 モデル変更操作:'));
            executionPlan.modelChanges.forEach((change, index) => {
                console.log(chalk.white(`    ${index + 1}. ${change.type}`));
                console.log(chalk.gray(`       リソース: ${change.resourceType}`));
                console.log(chalk.gray(`       権限: ${change.relation}`));
                console.log(chalk.gray(`       現在: ${change.currentDefinition}`));
                console.log(chalk.green(`       変更後: ${change.newDefinition}`));
                console.log(chalk.gray(`       理由: ${change.reason}`));
            });
        }
        
        if (executionPlan.tupleOperations && executionPlan.tupleOperations.length > 0) {
            console.log(chalk.cyan('\n  📊 Tuple操作（統合計画）:'));
            executionPlan.tupleOperations.forEach((operation, index) => {
                console.log(chalk.white(`    ${index + 1}. ${operation.type}`));
                console.log(chalk.gray(`       User: ${operation.tuple.user}`));
                console.log(chalk.gray(`       Relation: ${operation.tuple.relation}`));
                console.log(chalk.gray(`       Object: ${operation.tuple.object}`));
                console.log(chalk.gray(`       説明: ${operation.description}`));
            });
        }
        
        // 5. 警告事項
        if (executionPlan.warnings && executionPlan.warnings.length > 0) {
            console.log(chalk.yellow('\n⚠️  警告事項:'));
            executionPlan.warnings.forEach((warning, index) => {
                console.log(chalk.yellow(`  ${index + 1}. ${warning}`));
            });
        }
        
        console.log(chalk.cyan(`\n📋 要約: ${executionPlan.summary}`));
    } else {
        console.log(chalk.red('\n⚠️  統合実行計画の生成に失敗しました'));
        console.log(chalk.gray('executionPlan データ構造:'));
        console.log(chalk.gray(JSON.stringify(executionPlan, null, 2)));
    }
}

/**
 * 実行計画の確認と実行
 * @param {Object} executionPlan - 実行計画
 * @param {string} modelPath - model.fgaファイルのパス（デフォルト: 自動検索）
 * @param {string} tuplePath - tuple.jsonファイルのパス（デフォルト: 自動検索）
 * @param {Object} openFGAConfig - OpenFGA API設定（apiUrl, storeId, apiToken）
 * @returns {Promise<boolean>} 実行が成功したかどうか
 */
async function confirmAndExecutePlan(executionPlan, modelPath = null, tuplePath = null, openFGAConfig = null) {
    console.log(chalk.magenta('\n🤔 実行確認'));
    
    // executionPlan.executionPlanがネストされた構造の場合に対応
    const plan = executionPlan.executionPlan || executionPlan;
    
    const confirmed = await confirmAction(
        `上記の実行計画を実行しますか？\n` +
        `モデル変更: ${plan.hasModelChanges ? 'あり' : 'なし'}, ` +
        `Tuple操作: ${plan.hasTupleOperations ? 'あり' : 'なし'}`
    );
    
    if (!confirmed) {
        console.log(chalk.yellow('実行をキャンセルしました'));
        return false;
    }
    
    // ファイルパスが指定されていない場合は自動検索
    if (!modelPath || !tuplePath) {
        const files = await findOpenFGAFiles();
        if (!files) {
            console.log(chalk.red('❌ OpenFGAファイルが見つかりませんでした'));
            return false;
        }
        modelPath = modelPath || files.modelPath;
        tuplePath = tuplePath || files.tuplePath;
    }
    
    // 実行計画を適用（outputDirをnullにして元ファイルと同じディレクトリに出力）
    const result = await executeOpenFGAPlan(
        executionPlan,
        modelPath,
        tuplePath,
        null  // nullを指定すると元ファイルと同じディレクトリに出力
    );
    
    if (!result.success) {
        console.log(chalk.red('\n❌ 実行中にエラーが発生しました'));
        return false;
    }
    
    console.log(chalk.green('\n✅ ファイル更新完了'));
    
    // OpenFGA APIへの適用を確認
    if (openFGAConfig && (result.modelUpdated || result.tuplesUpdated)) {
        const applyToAPI = await confirmAction(
            '\n更新内容をOpenFGA APIに適用しますか？'
        );
        
        if (applyToAPI) {
            // fgaコマンドの確認
            const hasFgaCommand = await checkFgaCommand();
            if (!hasFgaCommand) {
                console.log(chalk.red('❌ fgaコマンドが見つかりません'));
                console.log(chalk.yellow('fga CLIをインストールしてください: https://github.com/openfga/cli'));
                return true; // ファイル更新は成功しているのでtrueを返す
            }
            
            // APIに適用
            const apiResult = await applyUpdatesToOpenFGA(
                result.outputFiles.model || modelPath,
                result.outputFiles.tuples || tuplePath,
                openFGAConfig.apiUrl,
                openFGAConfig.storeId,
                openFGAConfig.apiToken
            );
            
            if (apiResult.success) {
                console.log(chalk.green('\n🎉 OpenFGA APIへの適用が完了しました！'));
            } else {
                console.log(chalk.yellow('\n⚠️ OpenFGA APIへの適用中にエラーが発生しましたが，ファイルは更新されています'));
            }
        }
    }
    
    return true;
}

/**
 * CLIの対話ループを実行
 * @param {Object} statistics - 統計情報
 * @param {Object} openFGAData - OpenFGAの全体データ
 * @param {Object} openFGAConfig - OpenFGA API設定
 */
export async function runInteractiveCLI(statistics, openFGAData = null, openFGAConfig = null) {
    let running = true;
    
    while (running) {
        try {
            const mainChoice = await showMainMenu();
            
            switch (mainChoice) {
                case 'users':
                    const userResult = await showUserMenu(statistics);
                    if (userResult.action === 'selected') {
                        console.log(chalk.blue(`\n✅ ユーザ "${userResult.data.id}" が選択されました`));
                        
                        // 自然言語で変更内容を入力
                        const changeDescription = await getChangeDescription('user', userResult.data);
                        if (changeDescription) {
                            console.log(chalk.blue(`\n📝 変更内容: ${changeDescription}`));
                            
                            // 統合LLM分析を実行
                            if (openFGAData) {
                                const analysisResult = await executeIntegratedAnalysis(
                                    changeDescription,
                                    'user',
                                    userResult.data,
                                    openFGAData
                                );
                                
                                if (analysisResult) {
                                    displayAnalysisResults(analysisResult);
                                    await confirmAndExecutePlan(analysisResult.executionPlan, null, null, openFGAConfig);
                                }
                            } else {
                                console.log(chalk.yellow('⚠️ OpenFGAデータが不足しているため，LLM分析をスキップします'));
                            }
                        }
                        
                        // 操作完了後，一時停止
                        await inquirer.prompt([{
                            type: 'input',
                            name: 'continue',
                            message: 'Enterキーを押してメインメニューに戻る...'
                        }]);
                    }
                    break;
                    
                case 'devices':
                    const deviceResult = await showDeviceMenu(statistics);
                    if (deviceResult.action === 'selected') {
                        console.log(chalk.green(`\n✅ デバイス "${deviceResult.data.id}" (${deviceResult.data.type}) が選択されました`));
                        
                        // 自然言語で変更内容を入力
                        const changeDescription = await getChangeDescription('device', deviceResult.data);
                        if (changeDescription) {
                            console.log(chalk.green(`\n📝 変更内容: ${changeDescription}`));
                            
                            // 統合LLM分析を実行
                            if (openFGAData) {
                                const analysisResult = await executeIntegratedAnalysis(
                                    changeDescription,
                                    'device',
                                    deviceResult.data,
                                    openFGAData
                                );
                                
                                if (analysisResult) {
                                    displayAnalysisResults(analysisResult);
                                    await confirmAndExecutePlan(analysisResult.executionPlan, null, null, openFGAConfig);
                                }
                            } else {
                                console.log(chalk.yellow('⚠️ OpenFGAデータが不足しているため，LLM分析をスキップします'));
                            }
                        }
                        
                        // 操作完了後，一時停止
                        await inquirer.prompt([{
                            type: 'input',
                            name: 'continue',
                            message: 'Enterキーを押してメインメニューに戻る...'
                        }]);
                    }
                    break;
                    
                case 'groups':
                    const groupResult = await showGroupMenu(statistics);
                    if (groupResult.action === 'selected') {
                        console.log(chalk.yellow(`\n✅ グループ "${groupResult.data.id}" が選択されました`));
                        
                        // 自然言語で変更内容を入力
                        const changeDescription = await getChangeDescription('group', groupResult.data);
                        if (changeDescription) {
                            console.log(chalk.yellow(`\n📝 変更内容: ${changeDescription}`));
                            
                            // 統合LLM分析を実行
                            if (openFGAData) {
                                const analysisResult = await executeIntegratedAnalysis(
                                    changeDescription,
                                    'group',
                                    groupResult.data,
                                    openFGAData
                                );
                                
                                if (analysisResult) {
                                    displayAnalysisResults(analysisResult);
                                    await confirmAndExecutePlan(analysisResult.executionPlan, null, null, openFGAConfig);
                                }
                            } else {
                                console.log(chalk.yellow('⚠️ OpenFGAデータが不足しているため，LLM分析をスキップします'));
                            }
                        }
                        
                        // 操作完了後，一時停止
                        await inquirer.prompt([{
                            type: 'input',
                            name: 'continue',
                            message: 'Enterキーを押してメインメニューに戻る...'
                        }]);
                    }
                    break;
                    
                case 'exit':
                    console.log(chalk.red('\n終了します...'));
                    running = false;
                    break;
                    
                default:
                    console.log(chalk.red('無効な選択です'));
                    break;
            }
        } catch (error) {
            if (error.isTtyError) {
                console.log(chalk.red('\nTTYエラー: 対話的環境でない可能性があります'));
            } else {
                console.log(chalk.red('\nエラーが発生しました:', error.message));
            }
            running = false;
        }
    }
}

/**
 * 確認ダイアログを表示
 * @param {string} message - 確認メッセージ
 * @returns {Promise<boolean>} ユーザの確認結果
 */
export async function confirmAction(message) {
    const { confirmed } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'confirmed',
            message: chalk.yellow(message),
            default: false
        }
    ]);
    
    return confirmed;
}

/**
 * 成功メッセージを表示
 * @param {string} message - メッセージ
 */
export function showSuccess(message) {
    console.log(chalk.green('✅ ' + message));
}

/**
 * エラーメッセージを表示
 * @param {string} message - メッセージ
 */
export function showError(message) {
    console.log(chalk.red('❌ ' + message));
}

/**
 * 警告メッセージを表示
 * @param {string} message - メッセージ
 */
export function showWarning(message) {
    console.log(chalk.yellow('⚠️  ' + message));
}

/**
 * 情報メッセージを表示
 * @param {string} message - メッセージ
 */
export function showInfo(message) {
    console.log(chalk.blue('ℹ️  ' + message));
}