import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
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

const projectRootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../');
const modelFilePath = path.join(projectRootDir, 'file/model/model.fga');

// ファイルを連結して書き込む関数
function combinedModel(defaultModel, userModel, deviceModel) {
    try {
        const modelArray = [
            defaultModel,
            userModel,
            deviceModel
        ];
        // すべての内容を連結
        const fgaModel = modelArray.join('\n');
        return fgaModel;
    } catch (error) {
        console.error('ファイル処理中にエラーが発生しました:', error);
        throw error;
    }
}

async function runFGAtoJsonCommand(file) {
    return new Promise((resolve, reject) => {
        const child = spawn('fga', ['model', 'transform', '--file', file]);

        let output = '';
        let errorOutput = '';

        child.stdout.on('data', (data) => {
            output += data.toString();
        });

        child.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        child.on('close', (code) => {
            if (code === 0) {
                console.log('モデル変換が正常に完了しました');
                resolve(output); // 標準出力を返す
            } else {
                reject(new Error(`終了コード ${code}\n${errorOutput}`));
            }
        });

        child.on('error', (err) => {
            reject(err);
        });
    });
}


export async function exportModelToFGA(defaultModel, userModel, deviceModel) {
    try {
        const fgaModel = combinedModel(defaultModel, userModel, deviceModel);
        await fs.writeFile(modelFilePath, fgaModel, 'utf-8');
        
        const jsonModel = await runFGAtoJsonCommand(modelFilePath);
        // console.log(`変換結果:${jsonModel}`);   
        
        const { authorization_model_id: id } = await openFga.writeAuthorizationModel(JSON.parse(jsonModel));
        // console.log("Created Authorization Model ID:", id);
        return id; // モデルIDを返す
    }
    catch (error) {
        console.error('モデルの生成中にエラーが発生しました:', error);
    }
}
