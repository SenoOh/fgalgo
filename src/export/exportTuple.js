import { OpenFgaClient, CredentialsMethod } from '@openfga/sdk';
import dotenv from 'dotenv';
dotenv.config();

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
        let totalDeletedCount = 0;
        let continuationToken = undefined;

        do {
            // タプルを取得
            const response = await openFga.read({
                pageSize: 100,
                continuationToken,
            });

            console.log("Fetched count:", response.tuples?.length || 0);
            console.log("Continuation token:", response.continuation_token);

            // タプルが存在しない場合は終了
            if (!response?.tuples || response.tuples.length === 0) {
                console.log('削除対象のタプルは見つかりませんでした。全件削除完了。');
                break;
            }

            // 削除対象のタプルを準備
            const deleteTuples = response.tuples.map(tuple => ({
                user: tuple.key.user,
                relation: tuple.key.relation,
                object: tuple.key.object,
                condition: tuple.key.condition || undefined,
            }));

            console.log(`deleteTuples:\n ${JSON.stringify(deleteTuples, null, 2)}`);

            // タプルを削除
            await openFga.write({
                deletes: deleteTuples,
            }, {
                authorizationModelId: id,
            });

            console.log(`削除完了: ${deleteTuples.length} 件のタプルを削除しました。`);

            totalDeletedCount += deleteTuples.length;

            // 次のページのトークンを取得
            continuationToken = response.continuation_token;

        } while (continuationToken);

        // console.log(`全件削除完了: 合計 ${totalDeletedCount} 件のタプルを削除しました`);
    } catch (error) {
        console.error('タプルの削除中にエラーが発生しました:', error?.response?.data || error);
        throw error; // エラーを上位に伝える
    }
}

export async function exportTupleToFGA(userTuple, deviceTuple, modelID) {
    try {
        const combined = [...userTuple, ...deviceTuple];
        await listAllTuplesWithModelId(modelID);
        const { created_tuples: tuples } = await openFga.write({
            writes: combined,
        }, {
            authorizationModelId: modelID
        });
    }
    catch (error) {
        console.error('モデルの生成中にエラーが発生しました:', error);
    }
}
