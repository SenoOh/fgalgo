/**
 * OpenFGA API更新モジュール
 * Authorization ModelとRelationship TuplesをOpenFGA APIに適用
 */
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { OpenFgaClient } from '@openfga/sdk';

/**
 * fgaコマンドを使用してDSLをJSONに変換
 * @param {string} dslFilePath - DSLファイル（.fga）のパス
 * @returns {Promise<Object>} 変換されたJSONオブジェクト
 */
async function transformDSLtoJSON(dslFilePath) {
    return new Promise((resolve, reject) => {
        console.log(chalk.gray(`  🔄 DSLをJSONに変換中: ${dslFilePath}`));
        
        const fgaProcess = spawn('fga', ['model', 'transform', '--file', dslFilePath]);
        
        let stdout = '';
        let stderr = '';
        
        fgaProcess.stdout.on('data', (data) => {
            stdout += data.toString();
        });
        
        fgaProcess.stderr.on('data', (data) => {
            stderr += data.toString();
        });
        
        fgaProcess.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`fga transformコマンドが失敗しました (code ${code}): ${stderr}`));
                return;
            }
            
            try {
                const jsonModel = JSON.parse(stdout);
                console.log(chalk.green(`  ✅ DSL→JSON変換完了`));
                resolve(jsonModel);
            } catch (error) {
                reject(new Error(`JSON解析エラー: ${error.message}\nOutput: ${stdout}`));
            }
        });
        
        fgaProcess.on('error', (error) => {
            reject(new Error(`fgaコマンド実行エラー: ${error.message}`));
        });
    });
}

/**
 * Authorization ModelをOpenFGA APIで更新
 * @param {Object} client - OpenFgaClient インスタンス
 * @param {Object} authorizationModel - Authorization ModelのJSONオブジェクト
 * @returns {Promise<string>} 新しいAuthorization Model ID
 */
async function updateAuthorizationModel(client, authorizationModel) {
    try {
        console.log(chalk.cyan('\n📝 Authorization ModelをAPIで更新中...'));
        
        const response = await client.writeAuthorizationModel({
            type_definitions: authorizationModel.type_definitions,
            schema_version: authorizationModel.schema_version
        });
        
        const newModelId = response.authorization_model_id;
        console.log(chalk.green(`✅ Authorization Model更新完了`));
        console.log(chalk.white(`  新しいModel ID: ${newModelId}`));
        
        return newModelId;
    } catch (error) {
        console.log(chalk.red(`❌ Authorization Model更新エラー: ${error.message}`));
        throw error;
    }
}

/**
 * 既存のRelationship Tuplesを全て取得
 * @param {Object} client - OpenFgaClient インスタンス
 * @returns {Promise<Array>} 既存のTuple配列
 */
async function getAllExistingTuples(client) {
    try {
        console.log(chalk.gray('  📊 既存のTuplesを取得中...'));
        
        const tuples = [];
        let continuationToken = undefined;
        
        do {
            const response = await client.read({
                continuation_token: continuationToken
            });
            
            if (response.tuples && response.tuples.length > 0) {
                tuples.push(...response.tuples);
            }
            
            continuationToken = response.continuation_token;
        } while (continuationToken);
        
        console.log(chalk.gray(`  📊 既存Tuple数: ${tuples.length}`));
        return tuples;
    } catch (error) {
        console.log(chalk.red(`  ❌ 既存Tuple取得エラー: ${error.message}`));
        throw error;
    }
}

/**
 * Relationship Tuplesを削除
 * @param {Object} client - OpenFgaClient インスタンス
 * @param {Array} tuples - 削除するTuple配列
 * @param {string} authorizationModelId - Authorization Model ID
 */
async function deleteTuples(client, tuples, authorizationModelId) {
    try {
        if (tuples.length === 0) {
            console.log(chalk.gray('  削除するTupleはありません'));
            return;
        }
        
        console.log(chalk.yellow(`  🗑️  ${tuples.length}件のTupleを削除中...`));
        
        // OpenFGA APIは一度に複数のTupleを削除できる
        const deletes = tuples.map(tuple => ({
            user: tuple.key.user,
            relation: tuple.key.relation,
            object: tuple.key.object
        }));
        
        await client.write({
            authorization_model_id: authorizationModelId,
            deletes: deletes
        });
        
        console.log(chalk.green(`  ✅ Tuple削除完了`));
    } catch (error) {
        console.log(chalk.red(`  ❌ Tuple削除エラー: ${error.message}`));
        throw error;
    }
}

/**
 * Relationship Tuplesを追加
 * @param {Object} client - OpenFgaClient インスタンス
 * @param {Array} tuples - 追加するTuple配列
 * @param {string} authorizationModelId - Authorization Model ID
 */
async function writeTuples(client, tuples, authorizationModelId) {
    try {
        if (tuples.length === 0) {
            console.log(chalk.gray('  追加するTupleはありません'));
            return;
        }
        
        console.log(chalk.cyan(`  ➕ ${tuples.length}件のTupleを追加中...`));
        
        // key形式のTupleを変換
        const writes = tuples.map(tuple => {
            const key = tuple.key || tuple;
            return {
                user: key.user,
                relation: key.relation,
                object: key.object
            };
        });
        
        await client.write({
            authorization_model_id: authorizationModelId,
            writes: writes
        });
        
        console.log(chalk.green(`  ✅ Tuple追加完了`));
    } catch (error) {
        console.log(chalk.red(`  ❌ Tuple追加エラー: ${error.message}`));
        throw error;
    }
}

/**
 * 更新されたファイルをOpenFGA APIに適用
 * @param {string} modelFilePath - 更新されたmodel.fgaファイルのパス
 * @param {string} tupleFilePath - 更新されたtuple.jsonファイルのパス
 * @param {string} apiUrl - OpenFGA API URL
 * @param {string} storeId - Store ID
 * @param {string} apiToken - API Token（オプション）
 * @returns {Promise<Object>} 更新結果
 */
export async function applyUpdatesToOpenFGA(modelFilePath, tupleFilePath, apiUrl, storeId, apiToken = null) {
    // 元のファイルパスを計算（ロールバック用）
    const modelDir = path.dirname(modelFilePath);
    const tupleDir = path.dirname(tupleFilePath);
    const originalModelPath = path.join(modelDir, 'model.fga');
    const originalTuplePath = path.join(tupleDir, 'tuple.json');
    
    try {
        console.log(chalk.blue.bold('\n🚀 OpenFGA APIへの更新を開始...'));
        
        // OpenFGA クライアントを初期化
        const clientConfig = {
            apiUrl: apiUrl,
            storeId: storeId
        };
        
        if (apiToken) {
            clientConfig.credentials = {
                method: 'api_token',
                config: {
                    token: apiToken
                }
            };
        }
        
        const client = new OpenFgaClient(clientConfig);
        
        let newModelId = null;
        let modelUpdateSuccess = false;
        let tupleUpdateSuccess = false;
        
        try {
            // 1. DSLをJSONに変換
            const authorizationModelJson = await transformDSLtoJSON(modelFilePath);
            
            // 2. Authorization Modelを更新
            newModelId = await updateAuthorizationModel(client, authorizationModelJson);
            modelUpdateSuccess = true;
            
            // 3. Relationship Tuplesを更新
            console.log(chalk.cyan('\n📦 Relationship Tuplesを更新中...'));
            
            // 3-1. 既存のTuplesを取得
            const existingTuples = await getAllExistingTuples(client);
            
            // 3-2. 既存のTuplesを削除
            if (existingTuples.length > 0) {
                await deleteTuples(client, existingTuples, newModelId);
            }
            
            // 3-3. 新しいTuplesを読み込み
            console.log(chalk.gray(`  📂 新しいTupleファイル読み込み: ${tupleFilePath}`));
            const tupleContent = await fs.readFile(tupleFilePath, 'utf-8');
            const newTuples = JSON.parse(tupleContent);
            
            // 3-4. 新しいTuplesを追加
            await writeTuples(client, newTuples, newModelId);
            tupleUpdateSuccess = true;
            
            // 両方の更新が成功した場合のみファイルを上書き
            if (modelUpdateSuccess && tupleUpdateSuccess) {
                console.log(chalk.green('\n✅ OpenFGA API更新が完了しました！'));
                console.log(chalk.white(`  📋 Authorization Model ID: ${newModelId}`));
                console.log(chalk.white(`  📊 Tuple数: ${newTuples.length}`));
                
                // API更新成功後、update_model.fga と update_tuple.json を元のファイルに上書き
                await backupAndReplaceFiles(modelFilePath, tupleFilePath);
                
                return {
                    success: true,
                    authorizationModelId: newModelId,
                    tupleCount: newTuples.length
                };
            }
            
        } catch (updateError) {
            // 更新中にエラーが発生した場合、ロールバックを試みる
            console.log(chalk.red(`\n❌ 更新中にエラーが発生: ${updateError.message}`));
            console.log(chalk.yellow('🔄 元の設定にロールバックを試みます...'));
            
            try {
                await rollbackToOriginalState(
                    client, 
                    originalModelPath, 
                    originalTuplePath,
                    modelUpdateSuccess,
                    tupleUpdateSuccess
                );
                console.log(chalk.green('✅ ロールバックが完了しました'));
            } catch (rollbackError) {
                console.log(chalk.red(`❌ ロールバック失敗: ${rollbackError.message}`));
                throw new Error(`更新失敗: ${updateError.message}, ロールバックも失敗: ${rollbackError.message}`);
            }
            
            throw updateError;
        }
        
    } catch (error) {
        console.log(chalk.red(`\n❌ OpenFGA API更新エラー: ${error.message}`));
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * API更新成功後、update_model.fga と update_tuple.json を元のファイルに上書き
 * @param {string} updateModelPath - update_model.fga のパス
 * @param {string} updateTuplePath - update_tuple.json のパス
 */
async function backupAndReplaceFiles(updateModelPath, updateTuplePath) {
    try {
        console.log(chalk.cyan('\n📝 ファイルを更新中...'));
        
        // update_model.fga から model.fga へのパスを計算
        const modelDir = path.dirname(updateModelPath);
        const originalModelPath = path.join(modelDir, 'model.fga');
        
        // update_tuple.json から tuple.json へのパスを計算
        const tupleDir = path.dirname(updateTuplePath);
        const originalTuplePath = path.join(tupleDir, 'tuple.json');
        
        // update_model.fga の内容を model.fga に上書き
        if (await fileExists(updateModelPath)) {
            const modelContent = await fs.readFile(updateModelPath, 'utf-8');
            await fs.writeFile(originalModelPath, modelContent, 'utf-8');
            console.log(chalk.gray(`  ✓ ${originalModelPath} を更新しました`));
        }
        
        // update_tuple.json の内容を tuple.json に上書き
        if (await fileExists(updateTuplePath)) {
            const tupleContent = await fs.readFile(updateTuplePath, 'utf-8');
            await fs.writeFile(originalTuplePath, tupleContent, 'utf-8');
            console.log(chalk.gray(`  ✓ ${originalTuplePath} を更新しました`));
        }
        
        console.log(chalk.green('✅ 元のファイルを更新しました'));
        
    } catch (error) {
        console.log(chalk.yellow(`⚠️ ファイル更新中にエラーが発生しました: ${error.message}`));
        // ファイル更新の失敗はAPI更新の成功を妨げない
    }
}

/**
 * ファイルが存在するか確認
 * @param {string} filePath - ファイルパス
 * @returns {Promise<boolean>} 存在する場合true
 */
async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * fgaコマンドがインストールされているか確認
 * @returns {Promise<boolean>} インストールされている場合true
 */
export async function checkFgaCommand() {
    return new Promise((resolve) => {
        const fgaProcess = spawn('fga', ['version']);
        
        fgaProcess.on('close', (code) => {
            resolve(code === 0);
        });
        
        fgaProcess.on('error', () => {
            resolve(false);
        });
    });
}

/**
 * 元の設定にロールバックする
 * @param {Object} client - OpenFgaClient インスタンス
 * @param {string} originalModelPath - 元のmodel.fgaのパス
 * @param {string} originalTuplePath - 元のtuple.jsonのパス
 * @param {boolean} modelWasUpdated - Authorization Modelが更新されたか
 * @param {boolean} tuplesWereUpdated - Tuplesが更新されたか
 */
async function rollbackToOriginalState(client, originalModelPath, originalTuplePath, modelWasUpdated, tuplesWereUpdated) {
    try {
        console.log(chalk.cyan('\n🔄 ロールバック処理を開始...'));
        
        // 元のAuthorization ModelをJSONに変換
        console.log(chalk.gray(`  📂 元のモデルファイルを読み込み: ${originalModelPath}`));
        const originalModelJson = await transformDSLtoJSON(originalModelPath);
        
        // 元のAuthorization Modelを再登録
        console.log(chalk.cyan('  📝 元のAuthorization Modelを復元中...'));
        const restoredModelId = await updateAuthorizationModel(client, originalModelJson);
        
        // 元のTuplesを読み込み
        console.log(chalk.gray(`  📂 元のTupleファイルを読み込み: ${originalTuplePath}`));
        const originalTupleContent = await fs.readFile(originalTuplePath, 'utf-8');
        const originalTuples = JSON.parse(originalTupleContent);
        
        // 現在のTuplesを全て削除
        console.log(chalk.cyan('  📦 現在のTuplesを削除中...'));
        const currentTuples = await getAllExistingTuples(client);
        if (currentTuples.length > 0) {
            await deleteTuples(client, currentTuples, restoredModelId);
        }
        
        // 元のTuplesを復元
        console.log(chalk.cyan('  📦 元のTuplesを復元中...'));
        await writeTuples(client, originalTuples, restoredModelId);
        
        console.log(chalk.green('  ✅ ロールバック完了'));
        console.log(chalk.white(`    復元されたModel ID: ${restoredModelId}`));
        console.log(chalk.white(`    復元されたTuple数: ${originalTuples.length}`));
        
    } catch (error) {
        console.log(chalk.red(`  ❌ ロールバックエラー: ${error.message}`));
        throw error;
    }
}
