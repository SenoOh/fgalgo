/**
 * OpenFGA実行計画実行モジュール
 * Authorization ModelとRelationship Tuplesの更新を実行
 */
import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';

/**
 * 実行計画を実行してファイルを生成
 * @param {Object} executionPlan - 実行計画（executionPlan.executionPlanの場合もあるのでネスト対応）
 * @param {string} modelPath - 元のmodel.fgaファイルのパス
 * @param {string} tuplePath - 元のtuple.jsonファイルのパス
 * @param {string} outputDir - 出力ディレクトリ（デフォルト: 元ファイルと同じディレクトリ）
 * @returns {Promise<Object>} 実行結果
 */
export async function executeOpenFGAPlan(executionPlan, modelPath, tuplePath, outputDir = null) {
    try {
        console.log(chalk.blue('\n🚀 実行計画の適用を開始...'));
        
        // executionPlanがネストされた構造の場合に対応
        const plan = executionPlan.executionPlan || executionPlan;
        const modelChanges = executionPlan.modelChanges || [];
        const tupleOperations = executionPlan.tupleOperations || [];
        
        // デバッグ: 実行計画の内容を確認
        console.log(chalk.gray(`📊 実行計画デバッグ情報:`));
        console.log(chalk.gray(`  - hasModelChanges: ${plan.hasModelChanges}`));
        console.log(chalk.gray(`  - hasTupleOperations: ${plan.hasTupleOperations}`));
        console.log(chalk.gray(`  - modelChanges数: ${modelChanges.length}`));
        console.log(chalk.gray(`  - tupleOperations数: ${tupleOperations.length}`));
        
        if (tupleOperations.length > 0) {
            console.log(chalk.gray(`  📋 Tuple操作詳細:`));
            tupleOperations.forEach((op, idx) => {
                console.log(chalk.gray(`    ${idx + 1}. ${op.type}: ${op.tuple?.user} ${op.tuple?.relation} ${op.tuple?.object}`));
            });
        }        
        // 出力ディレクトリが指定されていない場合は元ファイルと同じディレクトリ
        const modelOutputDir = outputDir || path.dirname(modelPath);
        const tupleOutputDir = outputDir || path.dirname(tuplePath);
        
        const results = {
            success: true,
            modelUpdated: false,
            tuplesUpdated: false,
            outputFiles: {},
            errors: []
        };
        
        // Authorization Modelの更新
        if ((plan.hasModelChanges || modelChanges.length > 0) && modelChanges.length > 0) {
            console.log(chalk.cyan('📝 Authorization Modelを更新中...'));
            try {
                const modelResult = await updateAuthorizationModel(
                    modelPath,
                    modelChanges,
                    modelOutputDir
                );
                results.modelUpdated = modelResult.success;
                results.outputFiles.model = modelResult.outputPath;
                
                if (modelResult.success) {
                    console.log(chalk.green(`✅ Authorization Model更新完了: ${modelResult.outputPath}`));
                } else {
                    results.errors.push(`Model更新エラー: ${modelResult.error}`);
                }
            } catch (error) {
                results.success = false;
                results.errors.push(`Model更新エラー: ${error.message}`);
                console.log(chalk.red(`❌ Authorization Model更新エラー: ${error.message}`));
            }
        } else if (modelChanges.length === 0) {
            console.log(chalk.gray('📝 Model変更はありません'));
        }
        
        // Relationship Tuplesの更新
        if ((plan.hasTupleOperations || tupleOperations.length > 0) && tupleOperations.length > 0) {
            console.log(chalk.cyan('📦 Relationship Tuplesを更新中...'));
            try {
                const tuplesResult = await updateRelationshipTuples(
                    tuplePath,
                    tupleOperations,
                    tupleOutputDir
                );
                results.tuplesUpdated = tuplesResult.success;
                results.outputFiles.tuples = tuplesResult.outputPath;
                
                if (tuplesResult.success) {
                    console.log(chalk.green(`✅ Relationship Tuples更新完了: ${tuplesResult.outputPath}`));
                } else {
                    results.errors.push(`Tuples更新エラー: ${tuplesResult.error}`);
                }
            } catch (error) {
                results.success = false;
                results.errors.push(`Tuples更新エラー: ${error.message}`);
                console.log(chalk.red(`❌ Relationship Tuples更新エラー: ${error.message}`));
            }
        } else if (tupleOperations.length === 0) {
            console.log(chalk.gray('📦 Tuple操作はありません'));
        }
        
        // 実行結果のサマリー
        if (results.success && (results.modelUpdated || results.tuplesUpdated)) {
            console.log(chalk.green('\n✅ 実行計画の適用が完了しました'));
            if (results.outputFiles.model) {
                console.log(chalk.white(`  📄 更新されたModel: ${results.outputFiles.model}`));
            }
            if (results.outputFiles.tuples) {
                console.log(chalk.white(`  📄 更新されたTuples: ${results.outputFiles.tuples}`));
            }
        } else if (results.errors.length > 0) {
            console.log(chalk.yellow('\n⚠️ 実行計画の適用中にエラーが発生しました'));
            results.errors.forEach(error => {
                console.log(chalk.red(`  - ${error}`));
            });
        }
        
        return results;
        
    } catch (error) {
        console.log(chalk.red(`❌ 実行計画適用エラー: ${error.message}`));
        return {
            success: false,
            modelUpdated: false,
            tuplesUpdated: false,
            outputFiles: {},
            errors: [error.message]
        };
    }
}

/**
 * Authorization Modelを更新
 * @param {string} modelPath - 元のmodel.fgaファイルのパス
 * @param {Array} modelChanges - モデル変更の配列
 * @param {string} outputDir - 出力ディレクトリ
 * @returns {Promise<Object>} 更新結果
 */
async function updateAuthorizationModel(modelPath, modelChanges, outputDir) {
    try {
        // 元のmodel.fgaを読み込み
        const modelContent = await fs.readFile(modelPath, 'utf-8');
        let updatedContent = modelContent;
        
        // 各変更を適用
        for (const change of modelChanges) {
            console.log(chalk.gray(`  - ${change.type}: ${change.resourceType}.${change.relation}`));
            
            if (change.type === 'MODIFY_RELATION_DEFINITION') {
                // リレーション定義を書き換え
                updatedContent = replaceRelationDefinition(
                    updatedContent,
                    change.resourceType,
                    change.relation,
                    change.currentDefinition,
                    change.newDefinition
                );
            } else if (change.type === 'ADD_RELATION') {
                // 新しいリレーションを追加（現在は未実装）
                console.log(chalk.yellow(`    ⚠️ ADD_RELATIONは未実装です`));
            }
        }
        
        // update_model.fgaとして保存
        const outputPath = path.join(outputDir, 'update_model.fga');
        await fs.writeFile(outputPath, updatedContent, 'utf-8');
        
        return {
            success: true,
            outputPath: outputPath
        };
        
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * model.fga内のリレーション定義を置換
 * @param {string} content - model.fgaの内容
 * @param {string} resourceType - リソースタイプ（例: doorlock）
 * @param {string} relation - リレーション名（例: can_UnlockDoor）
 * @param {string} currentDefinition - 現在の定義
 * @param {string} newDefinition - 新しい定義
 * @returns {string} 更新されたコンテンツ
 */
function replaceRelationDefinition(content, resourceType, relation, currentDefinition, newDefinition) {
    // type doorlock { ... } ブロック内で define can_UnlockDoor: ... の行を探す
    // 複数行にまたがる可能性を考慮し，より柔軟なパターンを使用
    const lines = content.split('\n');
    let inTargetType = false;
    let updatedLines = [];
    let foundAndReplaced = false;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // type リソース名 のブロックを検出
        if (line.match(new RegExp(`^type\\s+${resourceType}\\s*$`))) {
            inTargetType = true;
            updatedLines.push(line);
            continue;
        }
        
        // 次のtypeブロックに入ったら対象外
        if (inTargetType && line.match(/^type\s+\w+\s*$/)) {
            inTargetType = false;
        }
        
        // 対象のtypeブロック内でリレーション定義を検索
        if (inTargetType) {
            // define relation: definition の形式を検索
            const defineMatch = line.match(new RegExp(`^(\\s*)define\\s+${relation}\\s*:\\s*(.+)$`));
            if (defineMatch) {
                const indent = defineMatch[1];  // インデントのみ（空白文字）
                const oldDef = defineMatch[2].trim();
                console.log(chalk.gray(`    現在: ${oldDef}`));
                console.log(chalk.green(`    変更: ${newDefinition}`));
                // newDefinitionが既に "define relation:" を含む場合と含まない場合に対応
                if (newDefinition.trim().startsWith('define ')) {
                    // 完全な定義が渡された場合はそのまま使用
                    updatedLines.push(`${indent}${newDefinition.trim()}`);
                } else {
                    // 定義部分のみが渡された場合は "define relation:" を追加
                    updatedLines.push(`${indent}define ${relation}: ${newDefinition}`);
                }
                foundAndReplaced = true;
                continue;
            }
        }
        
        updatedLines.push(line);
    }
    
    if (!foundAndReplaced) {
        console.log(chalk.yellow(`    ⚠️ ${resourceType}.${relation} の定義が見つかりませんでした`));
        console.log(chalk.gray(`    検索対象: type ${resourceType} ブロック内の define ${relation}:`));
        return content;
    }
    
    return updatedLines.join('\n');
}

/**
 * Relationship Tuplesを更新
 * @param {string} tuplePath - 元のtuple.jsonファイルのパス
 * @param {Array} tupleOperations - Tuple操作の配列
 * @param {string} outputDir - 出力ディレクトリ
 * @returns {Promise<Object>} 更新結果
 */
async function updateRelationshipTuples(tuplePath, tupleOperations, outputDir) {
    try {
        console.log(chalk.gray(`  📂 Tupleファイル読み込み: ${tuplePath}`));
        
        // 元のtuple.jsonを読み込み
        const tupleContent = await fs.readFile(tuplePath, 'utf-8');
        const tupleData = JSON.parse(tupleContent);
        
        console.log(chalk.gray(`  ✅ Tupleファイル読み込み完了`));
        
        // フォーマットを判定
        let tuples;
        let isKeyFormat = false;
        
        if (Array.isArray(tupleData)) {
            // 直接配列の場合（key形式）
            if (tupleData.length > 0 && tupleData[0].key) {
                isKeyFormat = true;
                tuples = [...tupleData];
                console.log(chalk.gray(`  📋 フォーマット: key形式（OpenFGA API形式）`));
            } else {
                // 直接配列でkeyなし
                tuples = [...tupleData];
                console.log(chalk.gray(`  � フォーマット: 直接配列形式`));
            }
        } else if (tupleData.tuples && Array.isArray(tupleData.tuples)) {
            // tuples配列を持つオブジェクト形式
            tuples = [...tupleData.tuples];
            console.log(chalk.gray(`  📋 フォーマット: tuples配列形式`));
        } else {
            throw new Error('tuple.jsonのフォーマットが不正です（認識できない形式）');
        }
        
        console.log(chalk.gray(`  📊 現在のTuple数: ${tuples.length}`));
        
        // 各操作を適用
        for (const operation of tupleOperations) {
            console.log(chalk.gray(`  - ${operation.type}: ${operation.tuple.user} ${operation.tuple.relation} ${operation.tuple.object}`));
            
            switch (operation.type) {
                case 'ADD':
                case 'CREATE':  // CREATEもADDと同じ扱い
                    tuples = addTuple(tuples, operation.tuple, isKeyFormat);
                    break;
                    
                case 'DELETE':
                case 'REMOVE':  // REMOVEもDELETEと同じ扱い
                    tuples = deleteTuple(tuples, operation.tuple, isKeyFormat);
                    break;
                    
                case 'MODIFY':
                case 'UPDATE':  // UPDATEもMODIFYと同じ扱い
                    tuples = modifyTuple(tuples, operation.tuple, operation.newTuple, isKeyFormat);
                    break;
                    
                default:
                    console.log(chalk.yellow(`    ⚠️ 不明な操作タイプ: ${operation.type}`));
                    break;
            }
        }
        
        console.log(chalk.gray(`  📊 更新後のTuple数: ${tuples.length}`));
        
        // 更新されたデータを作成（元のフォーマットを維持）
        let updatedData;
        if (Array.isArray(tupleData)) {
            updatedData = tuples;
        } else {
            updatedData = {
                ...tupleData,
                tuples: tuples
            };
        }
        
        // update_tuple.jsonとして保存
        const outputPath = path.join(outputDir, 'update_tuple.json');
        console.log(chalk.gray(`  💾 保存先: ${outputPath}`));
        
        await fs.writeFile(outputPath, JSON.stringify(updatedData, null, 2), 'utf-8');
        
        console.log(chalk.gray(`  ✅ ファイル保存完了`));
        
        return {
            success: true,
            outputPath: outputPath
        };
        
    } catch (error) {
        console.log(chalk.red(`  ❌ Tuple更新エラー詳細: ${error.message}`));
        console.log(chalk.red(`  スタックトレース: ${error.stack}`));
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Tupleを追加
 * @param {Array} tuples - 既存のTuple配列
 * @param {Object} newTuple - 追加するTuple
 * @param {boolean} isKeyFormat - key形式かどうか
 * @returns {Array} 更新されたTuple配列
 */
function addTuple(tuples, newTuple, isKeyFormat = false) {
    // key形式の場合は比較方法を変更
    const exists = tuples.some(t => {
        const tuple = isKeyFormat ? t.key : t;
        return tuple.user === newTuple.user &&
               tuple.relation === newTuple.relation &&
               tuple.object === newTuple.object;
    });
    
    if (exists) {
        console.log(chalk.yellow(`    ⚠️ 既に存在するTupleです（スキップ）`));
        return tuples;
    }
    
    console.log(chalk.green(`    ✅ Tuple追加`));
    
    // key形式の場合は適切なフォーマットで追加
    if (isKeyFormat) {
        return [...tuples, {
            key: {
                user: newTuple.user,
                relation: newTuple.relation,
                object: newTuple.object,
                condition: null
            },
            timestamp: new Date().toISOString()
        }];
    } else {
        return [...tuples, newTuple];
    }
}

/**
 * Tupleを削除
 * @param {Array} tuples - 既存のTuple配列
 * @param {Object} targetTuple - 削除するTuple
 * @param {boolean} isKeyFormat - key形式かどうか
 * @returns {Array} 更新されたTuple配列
 */
function deleteTuple(tuples, targetTuple, isKeyFormat = false) {
    const initialLength = tuples.length;
    const filteredTuples = tuples.filter(t => {
        const tuple = isKeyFormat ? t.key : t;
        return !(tuple.user === targetTuple.user &&
                 tuple.relation === targetTuple.relation &&
                 tuple.object === targetTuple.object);
    });
    
    if (filteredTuples.length === initialLength) {
        console.log(chalk.yellow(`    ⚠️ 削除対象のTupleが見つかりませんでした`));
    } else {
        console.log(chalk.green(`    ✅ Tuple削除`));
    }
    
    return filteredTuples;
}

/**
 * Tupleを変更（削除して追加）
 * @param {Array} tuples - 既存のTuple配列
 * @param {Object} oldTuple - 削除するTuple
 * @param {Object} newTuple - 追加するTuple
 * @param {boolean} isKeyFormat - key形式かどうか
 * @returns {Array} 更新されたTuple配列
 */
function modifyTuple(tuples, oldTuple, newTuple, isKeyFormat = false) {
    console.log(chalk.gray(`    削除: ${oldTuple.user} ${oldTuple.relation} ${oldTuple.object}`));
    console.log(chalk.gray(`    追加: ${newTuple.user} ${newTuple.relation} ${newTuple.object}`));
    
    let updatedTuples = deleteTuple(tuples, oldTuple, isKeyFormat);
    updatedTuples = addTuple(updatedTuples, newTuple, isKeyFormat);
    
    return updatedTuples;
}

/**
 * 出力ディレクトリを確認・作成
 * @param {string} outputDir - 出力ディレクトリのパス
 */
export async function ensureOutputDirectory(outputDir) {
    try {
        await fs.access(outputDir);
    } catch (error) {
        // ディレクトリが存在しない場合は作成
        await fs.mkdir(outputDir, { recursive: true });
        console.log(chalk.gray(`📁 出力ディレクトリを作成: ${outputDir}`));
    }
}

/**
 * ファイルを柔軟に検索
 * @param {string} filename - ファイル名（例: model.fga）
 * @param {Array<string>} searchPaths - 検索パスの配列（優先順位順）
 * @returns {Promise<string|null>} 見つかったファイルパスまたはnull
 */
export async function findFile(filename, searchPaths = []) {
    // デフォルトの検索パスを設定
    const defaultSearchPaths = [
        `./${filename}`,                    // カレントディレクトリ
        `./file/update/${filename}`,        // file/update/ディレクトリ
        `./file/${filename}`,               // file/ディレクトリ
        `../file/${filename}`,              // 親のfile/ディレクトリ
        path.join(process.cwd(), filename), // プロセスのカレントディレクトリ
        path.join(process.cwd(), 'file', 'update', filename), // プロセスのfile/update/ディレクトリ
        path.join(process.cwd(), 'file', filename) // プロセスのfile/ディレクトリ
    ];
    
    // ユーザ指定のパスを優先
    const allSearchPaths = [...searchPaths, ...defaultSearchPaths];
    
    for (const searchPath of allSearchPaths) {
        try {
            await fs.access(searchPath);
            console.log(chalk.gray(`📍 ファイル検出: ${searchPath}`));
            return searchPath;
        } catch (error) {
            // ファイルが存在しない場合は次を試す
            continue;
        }
    }
    
    return null;
}

/**
 * model.fgaとtuple.jsonのパスを自動検索
 * @returns {Promise<Object>} { modelPath, tuplePath } または null
 */
export async function findOpenFGAFiles() {
    console.log(chalk.gray('🔍 OpenFGAファイルを検索中...'));
    
    const modelPath = await findFile('model.fga');
    const tuplePath = await findFile('tuple.json');
    
    if (!modelPath) {
        console.log(chalk.yellow('⚠️ model.fgaが見つかりませんでした'));
    }
    
    if (!tuplePath) {
        console.log(chalk.yellow('⚠️ tuple.jsonが見つかりませんでした'));
    }
    
    if (modelPath && tuplePath) {
        console.log(chalk.green('✅ OpenFGAファイルを検出しました'));
        return { modelPath, tuplePath };
    }
    
    return null;
}
