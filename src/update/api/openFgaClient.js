import { OpenFgaClient, CredentialsMethod } from '@openfga/sdk';
import fs from 'fs';
import path from 'path';

/**
 * OpenFGAクライアントの設定
 */
export class FGAClient {
    constructor(apiUrl, storeId, apiToken) {
        this.fgaApi = new OpenFgaClient({
        apiUrl: apiUrl,
        storeId: storeId,
        credentials: {
            method: CredentialsMethod.ApiToken,
            config: {
            token: apiToken
            }
        }
        });
    }

    /**
     * Authorization Modelを取得
     * @returns {Promise<Object>} Authorization Model
     */
    async getAuthorizationModel() {
        const response = await this.fgaApi.readLatestAuthorizationModel();
        return response.authorization_model;
    }

    /**
     * Relationship Tuplesを取得（ページネーション対応）
     * @param {number} pageSize - 1ページあたりの取得件数（デフォルト: 50）
     * @returns {Promise<Array>} Relationship Tuples
     */
    async getRelationshipTuples(pageSize = 50) {
        let allTuples = [];
        let continuationToken = undefined;
        let page = 1;

        do {
            const response = await this.fgaApi.read({}, {
                pageSize: pageSize,
                continuationToken: continuationToken,
            });

            if (response.tuples && response.tuples.length > 0) {
                allTuples.push(...response.tuples);
            }

            continuationToken = response.continuation_token;
            page++;

        } while (continuationToken);

        console.log(`Relationship Tuples: ${allTuples.length} 件取得`);
        return allTuples;
    }

    /**
     * Authorization ModelとRelationship Tuplesの両方を取得
     * @returns {Promise<Object>} { authorizationModel, relationshipTuples }
     */
    async fetchAllData() {
        const [authorizationModel, relationshipTuples] = await Promise.all([
        this.getAuthorizationModel(),
        this.getRelationshipTuples()
        ]);

        return {
        authorizationModel,
        relationshipTuples
        };
    }

    /**
     * Authorization ModelをDSL形式に変換
     * @param {Object} authorizationModel - Authorization Model
     * @returns {string} DSL形式の文字列
     */
    convertAuthorizationModelToDSL(authorizationModel) {
        if (!authorizationModel || !authorizationModel.type_definitions) {
        return '';
        }

        let dsl = `model
  schema 1.1

`;

        authorizationModel.type_definitions.forEach(typeDef => {
        dsl += `type ${typeDef.type}\n`;
        
        if (typeDef.relations && Object.keys(typeDef.relations).length > 0) {
            dsl += `  relations\n`;
            Object.entries(typeDef.relations).forEach(([relation, definition]) => {
            dsl += `    define ${relation}: ${this.formatRelationDefinition(definition, typeDef, relation)}\n`;
            });
        }
        
        dsl += '\n';
        });

        return dsl;
    }

    /**
     * リレーション定義をフォーマット
     * @param {Object} definition - リレーション定義
     * @param {Object} typeDefinition - タイプ定義全体（directly_related_user_typesを確認するため）
     * @param {string} relationName - リレーション名
     * @returns {string} フォーマットされた定義
     */
    formatRelationDefinition(definition, typeDefinition, relationName) {
        if (definition.this) {
        // directly_related_user_typesを確認
        const directlyRelatedTypes = typeDefinition.metadata?.relations?.[relationName]?.directly_related_user_types;
        if (directlyRelatedTypes && directlyRelatedTypes.length > 0) {
            const types = directlyRelatedTypes.map(type => {
            if (type.relation) {
                return `${type.type}#${type.relation}`;
            }
            return type.type;
            });
            return `[${types.join(', ')}]`;
        }
        return 'self';
        }
        
        if (definition.union) {
        return definition.union.child.map(child => 
            this.formatRelationDefinition(child, typeDefinition, relationName)
        ).join(' or ');
        }
        
        if (definition.intersection) {
        return definition.intersection.child.map(child => 
            this.formatRelationDefinition(child, typeDefinition, relationName)
        ).join(' and ');
        }
        
        if (definition.difference) {
        const base = this.formatRelationDefinition(definition.difference.base, typeDefinition, relationName);
        const subtract = this.formatRelationDefinition(definition.difference.subtract, typeDefinition, relationName);
        return `${base} but not ${subtract}`;
        }
        
        if (definition.tupleToUserset) {
        const tupleset = definition.tupleToUserset.tupleset.relation;
        const computedUserset = definition.tupleToUserset.computedUserset.relation;
        return `${computedUserset} from ${tupleset}`;
        }
        
        if (definition.computedUserset) {
        return definition.computedUserset.relation;
        }
        
        if (definition.directlyRelated) {
        if (definition.directlyRelated.types && definition.directlyRelated.types.length > 0) {
            const types = definition.directlyRelated.types.map(type => {
            if (type.relation) {
                return `${type.type}#${type.relation}`;
            }
            return type.type;
            });
            return `[${types.join(', ')}]`;
        }
        return '[user]';
        }
        
        return 'self';
    }

    /**
     * データをファイルに保存
     * @param {Object} authorizationModel - Authorization Model
     * @param {Array} relationshipTuples - Relationship Tuples
     * @param {string} basePath - 保存先のベースパス (デフォルト: ./file)
   */
    async saveToFiles(authorizationModel, relationshipTuples, basePath = './file/update') {
        // Authorization ModelをDSLに変換して保存
        const dslContent = this.convertAuthorizationModelToDSL(authorizationModel);
        const modelFilePath = path.join(basePath, 'model.fga');
        
        await fs.promises.writeFile(modelFilePath, dslContent, 'utf8');
        console.log(`Authorization Model saved to: ${modelFilePath}`);

        // Relationship TuplesをJSONで保存
        const tupleFilePath = path.join(basePath, 'tuple.json');
        const jsonContent = JSON.stringify(relationshipTuples, null, 2);
        
        await fs.promises.writeFile(tupleFilePath, jsonContent, 'utf8');
        console.log(`Relationship Tuples saved to: ${tupleFilePath}`);
    }
}


/**
 * OpenFGAからデータを取得する関数
 * @param {string} apiUrl - OpenFGA APIのURL
 * @param {string} storeId - ストアID
 * @param {string} apiToken - APIトークン
 * @returns {Promise<Object>} 取得したデータ
 */
export async function fetchFGAData(apiUrl, storeId, apiToken) {
    const client = new FGAClient(apiUrl, storeId, apiToken);

    console.log('OpenFGAからデータを取得中...');

    const data = await client.fetchAllData();

    console.log('Authorization Model取得完了');
    console.log('Relationship Tuples取得完了');

    return data;
}

/**
 * Authorization Modelのみを取得する関数
 * @param {string} apiUrl - OpenFGA APIのURL
 * @param {string} storeId - ストアID
 * @param {string} apiToken - APIトークン
 * @returns {Promise<Object>} Authorization Model
 */
export async function fetchAuthorizationModel(apiUrl, storeId, apiToken) {
    const client = new FGAClient(apiUrl, storeId, apiToken);
    
    console.log('Authorization Modelを取得中...');
    
    const authorizationModel = await client.getAuthorizationModel();
    
    console.log('Authorization Model取得完了');
    
    return authorizationModel;
}

/**
 * Relationship Tuplesのみを取得する関数
 * @param {string} apiUrl - OpenFGA APIのURL
 * @param {string} storeId - ストアID
 * @param {string} apiToken - APIトークン
 * @returns {Promise<Array>} Relationship Tuples
 */
export async function fetchRelationshipTuples(apiUrl, storeId, apiToken) {
    const client = new FGAClient(apiUrl, storeId, apiToken);
    
    console.log('Relationship Tuplesを取得中...');
    
    const relationshipTuples = await client.getRelationshipTuples();
    
    console.log('Relationship Tuples取得完了');
    
    return relationshipTuples;
}

/**
 * OpenFGAからデータを取得してファイルに保存する関数
 * @param {string} apiUrl - OpenFGA APIのURL
 * @param {string} storeId - ストアID
 * @param {string} apiToken - APIトークン
 * @param {string} basePath - 保存先のベースパス (デフォルト: ./file/update)
 * @returns {Promise<Object>} 取得したデータ
 */
export async function fetchAndSaveData(apiUrl, storeId, apiToken, basePath = './file/update') {
    const client = new FGAClient(apiUrl, storeId, apiToken);
    
    console.log('OpenFGAからデータを取得中...');
    
    const data = await client.fetchAllData();
    
    console.log('Authorization Model取得完了');
    console.log('Relationship Tuples取得完了');
    
    // ファイルに保存
    await client.saveToFiles(data.authorizationModel, data.relationshipTuples, basePath);
    
    return data;
}
