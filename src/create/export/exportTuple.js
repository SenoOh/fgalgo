import { OpenFgaClient, CredentialsMethod } from '@openfga/sdk';
import dotenv from 'dotenv';
dotenv.config({ quiet: true });


const openFga = new OpenFgaClient({
    apiUrl: process.env.FGA_API_URL,
    storeId: process.env.FGA_STORE_ID,
    credentials: {
        method: CredentialsMethod.ApiToken,
        config: {
            token: process.env.FGA_API_TOKEN,
        },
    }
});

async function listAllTuplesWithModelId(id) {
    try {
        let allTuples = [];
        let continuationToken = undefined;
        const pageSize = 100;

        do {
            const response = await openFga.read({}, {
                pageSize: pageSize,
                continuationToken: continuationToken,
            });

            if (response.tuples && response.tuples.length > 0) {
                allTuples.push(...response.tuples);
            }

            continuationToken = response.continuation_token;

        } while (continuationToken);

        console.log(`削除対象タプル: ${allTuples.length} 件取得`);

        if (allTuples.length === 0) {
            return;
        }

        // 削除対象のタプルを準備
        const deleteTuples = allTuples.map(tuple => ({
            user: tuple.key.user,
            relation: tuple.key.relation,
            object: tuple.key.object,
            condition: tuple.key.condition || undefined,
        }));

        // 100個ずつのバッチに分割して削除
        const BATCH_SIZE = 100;
        let totalDeleted = 0;

        for (let i = 0; i < deleteTuples.length; i += BATCH_SIZE) {
            const batch = deleteTuples.slice(i, i + BATCH_SIZE);

            await openFga.write({
                deletes: batch,
            }, {
                authorizationModelId: id,
            });

            totalDeleted += batch.length;
        }

        console.log(`削除完了: ${totalDeleted} 件のタプルを削除しました`);
    } catch (error) {
        console.error('タプルの削除中にエラーが発生しました:', error?.response?.data || error);
        throw error;
    }
}

export async function exportTupleToFGA(userTuple, deviceTuple, modelID) {
    try {
        const combined = [...userTuple, ...deviceTuple];
        console.log(`合計 ${combined.length} 件のタプルを書き込みます`);
        
        // 既存のタプルを削除
        await listAllTuplesWithModelId(modelID);
        
        // 100個ずつのバッチに分割して書き込み
        const BATCH_SIZE = 100;
        let totalWritten = 0;
        
        for (let i = 0; i < combined.length; i += BATCH_SIZE) {
            const batch = combined.slice(i, i + BATCH_SIZE);
            
            await openFga.write({
                writes: batch,
            }, {
                authorizationModelId: modelID
            });
            
            totalWritten += batch.length;
            console.log(`進捗: ${totalWritten} / ${combined.length} 件のタプルを書き込みました`);
        }
        
        console.log(`完了: 合計 ${totalWritten} 件のタプルを書き込みました`);
    }
    catch (error) {
        console.error('タプルの生成中にエラーが発生しました:', error);
    }
}
