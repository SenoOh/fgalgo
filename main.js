import inquirer from 'inquirer';
import chalk from 'chalk';

// 作成処理のインポート
import createMain from './src/create/index.js';

// 更新処理のインポート
import { fetchAndSaveData } from './src/update/api/openFgaClient.js';
import { analyzeStatistics, printStatistics } from './src/update/cli/statisticsAnalyzer.js';
import { runInteractiveCLI } from './src/update/cli/interactiveCli.js';
import dotenv from 'dotenv';

// 環境変数を読み込み
dotenv.config({ quiet: true });

async function main() {
  try {
    console.log(chalk.blue.bold('=== OpenFGA 設定管理ツール ==='));
    console.log('');

    // ユーザーに操作を選択させる
    const { operation } = await inquirer.prompt([
      {
        type: 'list',
        name: 'operation',
        message: '実行する操作を選択してください:',
        choices: [
          {
            name: '🆕 新しいOpenFGA設定を作成する',
            value: 'create'
          },
          {
            name: '🔄 既存のOpenFGA設定を更新・分析する',
            value: 'update'
          }
        ]
      }
    ]);

    console.log('');

    if (operation === 'create') {
      // 作成処理を実行
      console.log(chalk.green('新しいOpenFGA設定の作成を開始します...'));
      console.log('');
      await createMain();
    } else if (operation === 'update') {
      // 更新処理を実行
      await runUpdateProcess();
    }

  } catch (error) {
    console.error(chalk.red('エラーが発生しました:'), error.message);
    process.exit(1);
  }
}

async function runUpdateProcess() {
  try {
    // 環境変数から設定を取得
    const apiUrl = process.env.FGA_API_URL;
    const storeId = process.env.FGA_STORE_ID;
    const apiToken = process.env.FGA_API_TOKEN;

    console.log(chalk.blue.bold('=== OpenFGA データ取得・保存・分析ツール ==='));
    console.log(chalk.gray(`API URL: ${apiUrl}`));
    console.log(chalk.gray(`Store ID: ${storeId}`));
    console.log('');

    // データを取得してファイルに保存
    console.log(chalk.yellow('OpenFGAからデータを取得中...'));
    const allData = await fetchAndSaveData(apiUrl, storeId, apiToken);
    
    // 分析モジュールで統計情報を分析・表示
    const statistics = analyzeStatistics(allData.relationshipTuples, allData.authorizationModel, './file/json/matter');
    printStatistics(statistics);
    
    console.log('');
    console.log(chalk.green('=== 取得結果サマリー ==='));
    console.log(chalk.gray(`Authorization Model Schema Version: ${allData.authorizationModel?.schema_version}`));
    console.log(chalk.gray(`Relationship Tuples 数: ${allData.relationshipTuples?.length || 0}`));
    console.log('');
    console.log(chalk.green('ファイル保存が完了しました:'));
    console.log(chalk.gray('- ./file/update/model.fga (Authorization Model DSL)'));
    console.log(chalk.gray('- ./file/update/tuple.json (Relationship Tuples JSON)'));
    
    // CLI対話モードの開始
    console.log(chalk.magenta('\n=== 対話モード開始 ==='));
    
    // OpenFGAデータを統合してCLIに渡す
    const openFGAData = {
      authorizationModel: allData.authorizationModel,
      relationshipTuples: allData.relationshipTuples,
      statistics: statistics
    };
    
    // OpenFGA API設定
    const openFGAConfig = {
      apiUrl: apiUrl,
      storeId: storeId,
      apiToken: apiToken
    };
    
    await runInteractiveCLI(statistics, openFGAData, openFGAConfig);
    
  } catch (error) {
    console.error(chalk.red('更新処理でエラーが発生しました:'), error.message);
    throw error;
  }
}

// メイン関数を実行
main();
