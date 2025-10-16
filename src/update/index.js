import dotenv from 'dotenv';
import { fetchAndSaveData } from './api/openFgaClient.js';
import { analyzeStatistics, printStatistics } from './cli/statisticsAnalyzer.js';
import { runInteractiveCLI } from './cli/interactiveCli.js';
import chalk from 'chalk';

// 環境変数を読み込み
dotenv.config();

async function main() {
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
    console.error(chalk.red('エラーが発生しました:'), error.message);
    process.exit(1);
  }
}

// ファイルが直接実行された場合のみmain()を実行
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
