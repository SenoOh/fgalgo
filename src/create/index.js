import path from 'path';
import { readFile, parseJson, promptExcelPath } from './util/fileUtil.js';
import { groupXlsxToJson, getUserUids } from './user/userGroupsXlsxToJson.js';
import { userAttrXlsxToJson } from './user/userAttrXlsxToJson.js';
import { makeUserModel } from './user/makeUserModel.js';
import { makeUserTuple } from './user/makeUserTuple.js';
import { getDeviceType, deviceAttrXlsxToJson } from './device/deviceAttrXlsxToJson.js';
import { getDeviceSetupInfo } from './device/deviceSetup.js';
import { makeDeviceModel } from './device/makeDeviceModel.js';
import { makeDeviceTuple } from './device/makeDeviceTuple.js';
import { exportModelToFGA } from './export/exportModel.js';
import { exportTupleToFGA } from './export/exportTuple.js';

const projectRootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../');
// const userGroupsXlsxPath = path.join(projectRootDir, 'file/xlsx/user/user_groups.xlsx');
// const userAttributeXlsxPath = path.join(projectRootDir, 'file/xlsx/user/user_attributes.xlsx');
const userTemplatePath = path.join(projectRootDir, 'file/template/user/user_model_template.ejs');
const matterDeviceTypeJsonPath = path.join(projectRootDir, 'file/json/matter/devicetype.json');
// const deviceAttributeXlsxPath = path.join(projectRootDir, 'file/xlsx/device/device_attributes.xlsx');
const deviceTemplatePath = path.join(projectRootDir, 'file/template/device/device_model_template.ejs');
const defaultModelPath = path.join(projectRootDir, 'file/model/default.fga');


export default async function main() {
    // ユーザ属性の処理
    // group 取得
    const userGroupsXlsxPath = await promptExcelPath('ユーザグループのExcelファイルの絶対パスを入力してください:');
    const userGroupsJson = await groupXlsxToJson(userGroupsXlsxPath);
    // console.log(`userGroupsJson:\n`, userGroupsJson);
    const groupUidList = getUserUids(userGroupsJson);
    // ユーザ属性取得
    const userAttributeXlsxPath = await promptExcelPath('ユーザ属性のExcelファイルの絶対パスを入力してください:');
    const userAttrJson = await userAttrXlsxToJson(groupUidList, userAttributeXlsxPath);
    // console.log(`userAttrJson:\n`, userAttrJson);
    // ユーザモデル作成
    const userModelFGA = await makeUserModel(userAttrJson, userTemplatePath);
    // console.log(`userModelFGA:\n`, userModelFGA);
    // ユーザタプル作成
    const userTuple = await makeUserTuple(userAttrJson, userGroupsJson);
    // console.log(`userTuple:\n`, userTuple);

    // デバイス属性の処理
    // デバイスタイプ取得
    const deviceType = await getDeviceType(matterDeviceTypeJsonPath);
    const deviceAttributeXlsxPath = await promptExcelPath('デバイス属性のExcelファイルの絶対パスを入力してください:');
    const deviceAttrJson = await deviceAttrXlsxToJson(deviceType, deviceAttributeXlsxPath);
    // console.log(`deviceAttrJson:\n`, deviceAttrJson);
    // Matter デバイスタイプのJSONを読み込み
    const readMatter = await readFile(matterDeviceTypeJsonPath);
    const matterDeviceTypeJson = await parseJson(readMatter);
    // デバイスセットアップ情報取得
    const deviceSetupInfo = await getDeviceSetupInfo(deviceAttrJson, userAttrJson, userGroupsJson, matterDeviceTypeJson);
    // デバイスモデル作成
    const { deviceTypeMapJson, deviceModelFGA } = await makeDeviceModel(deviceSetupInfo, matterDeviceTypeJson, userAttrJson, deviceTemplatePath);
    // デバイスタプル作成
    const deviceTuple = makeDeviceTuple(deviceSetupInfo, deviceTypeMapJson, userAttrJson);
    // モデルを連結して書き込む
    const defaultModel = await readFile(defaultModelPath);
    const modelID = await exportModelToFGA(defaultModel, userModelFGA, deviceModelFGA);
    // console.log(`modelID:`, modelID);
    // タプルをFGAに書き込む
    await exportTupleToFGA(userTuple, deviceTuple, modelID);
    console.log(`すべての処理が完了しました`);
}

// ファイルが直接実行された場合のみmain()を実行
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
